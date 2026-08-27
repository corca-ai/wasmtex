#!/usr/bin/env node
// Capture essential TeX files as a development-only static cache.
// Every captured byte must match a pinned TeX Live provenance manifest. The
// output is gitignored and is not a release mirror or a substitute for notices.
//
// Prerequisites: texlive server running (docker compose up texlive)
// Usage: TEXLIVE_PROVENANCE_MANIFEST=/path/to/texlive-provenance.json \
//   node scripts/bundle-texlive.mjs

import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const bundleDir = join(root, 'public/texlive')

async function main() {
  const provenancePath = process.env.TEXLIVE_PROVENANCE_MANIFEST
  if (!provenancePath) {
    throw new Error('TEXLIVE_PROVENANCE_MANIFEST is required; unprovenanced capture is disabled')
  }
  const provenanceBytes = readFileSync(provenancePath)
  const provenance = JSON.parse(provenanceBytes.toString('utf8'))
  const provenanceSha256 = createHash('sha256').update(provenanceBytes).digest('hex')
  if (!Array.isArray(provenance.files) || provenance.files.length === 0) {
    throw new Error('TeX Live provenance manifest has no files')
  }
  if (
    provenance.source?.texmfArchive?.verified !== true ||
    provenance.source?.metadataArchive?.verified !== true
  ) {
    throw new Error('TeX Live provenance archives are not verified')
  }
  const provenanceByKey = new Map(provenance.files.map((file) => [file.key, file]))
  const texliveUrl = process.env.VITE_TEXLIVE_URL || 'http://localhost:5001/'

  try {
    const r = await fetch(texliveUrl + 'pdftex/26/article.cls')
    if (!r.ok) throw new Error(`status ${r.status}`)
  } catch {
    console.error('Texlive mirror not responding. Start the local mirror or check VITE_TEXLIVE_URL.')
    process.exit(1)
  }

  console.log('Starting Vite dev server...')
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
  await server.listen()
  const addr = server.httpServer.address()
  const url = `http://localhost:${addr.port}`

  const browser = await chromium.launch()
  const context = await browser.newContext({
    offline: false,
    javaScriptEnabled: true
  })
  const page = await context.newPage()

  // Capture all texlive responses (including from Web Workers)
  const captured = new Map()
  page.on('response', async (response) => {
    const reqUrl = response.url()
    // The marker is stable across local and public R2 mirror paths.
    const pdftexMarker = '/pdftex/'
    const markerIndex = reqUrl.indexOf(pdftexMarker)
    if (markerIndex === -1) return
    if (response.status() !== 200) return

    try {
      const body = await response.body()
      const path = `pdftex/${reqUrl.slice(markerIndex + pdftexMarker.length).split(/[?#]/, 1)[0]}`
      if (!captured.has(path)) {
        captured.set(path, body)
      }
    } catch { /* response body may not be available */ }
  })

  let compiled = false
  page.on('console', msg => {
    const text = msg.text()
    if (text.includes('ExitStatus caught, code=0') || text.includes('preamble HIT')) compiled = true
    if (text.includes('[compile]') && !text.includes('memlog')) {
      console.log(`  [browser] ${text}`)
    }
  })

  console.log('Opening app — waiting for compilation...')
  // Force clean state via init script
  await page.addInitScript(() => {
    window.__LATEX_EDITOR_OPTS = {
      serviceWorker: false // Disable SW to ensure clean network requests
    };
  });

  await page.goto(url)

  // Wait for at least one successful compilation
  const deadline = Date.now() + 180_000
  while (!compiled && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 500))
  }

  // Extra wait for trailing font requests
  await new Promise(r => setTimeout(r, 3000))

  console.log(`\nCaptured ${captured.size} texlive files.`)

  // Non-English hyphenation files to skip — the .fmt already has all trie data baked in.
  // These source .tex files are only needed during format building (done in Docker).
  const KEEP_HYPH = new Set([
    'hyph-en-us.tex', 'hyph-en-gb.tex',
    'loadhyph-en-us.tex', 'loadhyph-en-gb.tex',
    'hyphen.tex', 'hyphen.cfg', 'language.dat', 'dumyhyph.tex', 'zerohyph.tex',
  ])

  function isNonEnglishHyphenation(filename) {
    if (KEEP_HYPH.has(filename)) return false
    if (/^(hyph-|loadhyph-)/.test(filename)) return true
    if (/^dehyph/.test(filename)) return true
    if (/^conv-utf8-/.test(filename)) return true
    if (/^(grahyph|grmhyph|grphyph|copthyph|ibyhyph)/.test(filename)) return true
    if (/^(catkoi|catlcy|cyryoal|hypht2|koi2t2a|lcy2t2a|ukrhypmp|ruhyphen|ruhyphal|ukrhyph)/.test(filename)) return true
    return false
  }

  // Save files (skip .fmt which is handled separately, and non-English hyphenation)
  let saved = 0
  let totalSize = 0
  let skippedHyph = 0
  const subset = []
  for (const [path, data] of captured) {
    if (path.endsWith('.fmt')) continue
    const filename = path.split('/').pop()
    if (isNonEnglishHyphenation(filename)) {
      skippedHyph++
      continue
    }
    const record = provenanceByKey.get(path)
    if (!record) throw new Error(`captured file is absent from provenance: ${path}`)
    const actualSha256 = createHash('sha256').update(data).digest('hex')
    if (record.bytes !== data.length || record.sha256 !== actualSha256) {
      throw new Error(`captured file does not match provenance: ${path}`)
    }
    const outPath = join(bundleDir, path)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, data)
    totalSize += data.length
    saved++
    subset.push(record)
  }

  subset.sort((a, b) => a.key.localeCompare(b.key))
  writeFileSync(
    join(bundleDir, 'texlive-provenance.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      developmentOnly: true,
      derivedFromSha256: provenanceSha256,
      source: provenance.source,
      files: subset,
    }, null, 2)}\n`,
  )

  console.log(`Saved ${saved} files (${(totalSize / 1024).toFixed(0)} KB) to public/texlive/`)
  if (skippedHyph > 0) {
    console.log(`Skipped ${skippedHyph} non-English hyphenation files`)
  }

  await browser.close()
  await server.close()
  console.log('Done. public/texlive is a gitignored development cache; do not publish it.')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
