#!/usr/bin/env node
// Bundle essential TeX files as static assets for gh-pages deployment.
// Captures texlive responses during compilation and saves them.
//
// Prerequisites: texlive server running (docker compose up texlive)
// Usage: node scripts/bundle-texlive.mjs

import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const bundleDir = join(root, 'public/texlive')

async function main() {
  const texliveUrl = process.env.VITE_TEXLIVE_URL || 'http://localhost:5001/'
  const isCloudFront = texliveUrl.includes('cloudfront.net')

  // Check texlive server (unless cloudfront)
  if (!isCloudFront) {
    try {
      const r = await fetch(texliveUrl + 'pdftex/26/article.cls')
      if (!r.ok) throw new Error(`status ${r.status}`)
    } catch {
      console.error('Texlive server not responding. Run: docker compose up texlive')
      process.exit(1)
    }
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
    // Pattern matches both local /texlive/ and CloudFront /2025/
    if (!reqUrl.includes('/texlive/') && !reqUrl.includes('/2025/')) return
    if (response.status() !== 200) return

    try {
      const body = await response.body()
      const path = reqUrl.replace(/.*\/pdftex\//, 'pdftex/')
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
  for (const [path, data] of captured) {
    if (path.endsWith('.fmt')) continue
    const filename = path.split('/').pop()
    if (isNonEnglishHyphenation(filename)) {
      skippedHyph++
      continue
    }
    const outPath = join(bundleDir, path)
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, data)
    totalSize += data.length
    saved++
  }

  console.log(`Saved ${saved} files (${(totalSize / 1024).toFixed(0)} KB) to public/texlive/`)
  if (skippedHyph > 0) {
    console.log(`Skipped ${skippedHyph} non-English hyphenation files`)
  }

  await browser.close()
  await server.close()
  console.log('Done! Run: git add public/texlive && git commit')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
