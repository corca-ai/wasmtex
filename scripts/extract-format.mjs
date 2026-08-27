#!/usr/bin/env node
// Build the pdfTeX .fmt through the engine's explicit release-tooling API.

import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { collectFormatRequests, writeFormatInputEvidence } from './lib/format-input-evidence.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const version = process.argv[2] ?? '2025'
const texliveUrl = process.env.TEXLIVE_URL ?? `https://d1jectpaw0dlvl.cloudfront.net/${version}/`
const outPath = join(root, `public/wasmtex/${version}/wasmtex-pdftex.fmt`)

async function main() {
  console.log('Starting Vite dev server...')
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
  await server.listen()
  const addr = server.httpServer.address()
  const url = `http://localhost:${addr.port}`
  console.log(`Vite running at ${url}`)

  console.log('Launching browser...')
  // CI uses its preinstalled Chrome; local development can keep using the
  // Playwright-managed Chromium binary.
  const channel = process.env.PLAYWRIGHT_CHANNEL
  const browser = await chromium.launch(channel ? { channel } : {})
  try {
    const page = await browser.newPage()
    const formatRequests = collectFormatRequests(page, version)
    page.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[compile]') || text.includes('[kpse]') || text.includes('[engine]')) {
        console.log(`  [browser] ${text}`)
      }
    })

    // A plain text public asset gives us the Vite origin without booting the demo app.
    await page.goto(`${url}/sample/main.tex`)
    console.log('Building pdflatex format with the freshly staged engine...')

    const b64Data = await page.evaluate(async ({ v, endpoint }) => {
      const { WasmTexPdftexEngine } = await import('/src/engine/wasmtex-engine.ts')
      const engine = new WasmTexPdftexEngine({
        assetBaseUrl: '/',
        texliveVersion: v,
        texliveUrl: endpoint,
        skipFormatPreload: true,
      })
      try {
        await engine.init()
        const bytes = await engine.buildFormat()
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        }
        return btoa(binary)
      } finally {
        engine.terminate()
      }
    }, { v: version, endpoint: texliveUrl })

    const buffer = Buffer.from(b64Data, 'base64')
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, buffer)
    writeFormatInputEvidence({
      output: process.env.FORMAT_INPUT_LOG,
      engine: 'pdftex',
      formatPath: outPath,
      requests: formatRequests,
      procedure: 'node scripts/extract-format.mjs',
    })
    console.log(`\nSUCCESS: Format saved to ${outPath} (${buffer.length} bytes)`)
  } finally {
    await browser.close()
    await server.close()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
