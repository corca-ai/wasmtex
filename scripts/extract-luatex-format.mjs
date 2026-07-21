#!/usr/bin/env node
/**
 * Extract the prebuilt LuaLaTeX format (`wasmtex-luatex.fmt`).
 *
 * Runs the LuaHBTeX WASM engine's `compileformat` (`luatex -ini lualatex.ini`)
 * once and captures the resulting `.fmt` bytes, so the engine can preload it at
 * init time instead of rebuilding the format on every cold start (the dominant
 * cost of a first LuaLaTeX compile). See docs/engine.md.
 *
 * The `.fmt` is engine-binary-specific: regenerate it whenever
 * `wasmtex-luatex.wasm` is rebuilt (CI does this in wasm-luatex.yml).
 *
 * Usage:
 *   node scripts/extract-luatex-format.mjs            # version 2025 (default)
 *   node scripts/extract-luatex-format.mjs 2025
 *
 * Requires the controller, generated module, and WASM under
 * `public/wasmtex/<version>/wasmtex-luatex.{worker.js,js,wasm}`.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import { collectFormatRequests, writeFormatInputEvidence } from './lib/format-input-evidence.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const version = process.argv[2] ?? '2025'
const outPath = join(root, `public/wasmtex/${version}/wasmtex-luatex.fmt`)
const enginePath = join(root, `public/wasmtex/${version}/wasmtex-luatex.worker.js`)

if (!existsSync(enginePath)) {
  console.error(`Missing engine: ${enginePath}\nDownload/build the LuaLaTeX WASM first.`)
  process.exit(1)
}

async function main() {
  const server = await createServer({ root, configFile: join(root, 'vite.config.ts') })
  await server.listen()
  const { port } = server.httpServer.address()
  const url = `http://localhost:${port}`
  console.log(`Vite running at ${url}; building LuaLaTeX format (version ${version})...`)

  // PLAYWRIGHT_CHANNEL=chrome uses the runner's system Chrome (CI) instead of
  // downloading Playwright's bundled browser, whose post-download install step
  // hangs deterministically on GitHub-hosted runners. Locally, leave it unset to
  // use the bundled chromium.
  const channel = process.env.PLAYWRIGHT_CHANNEL
  const browser = await chromium.launch(channel ? { channel } : {})
  let b64
  let formatRequests
  try {
    const page = await browser.newPage()
    formatRequests = collectFormatRequests(page, version)
    page.on('console', (msg) => {
      const t = msg.text()
      if (t.includes('error') || t.includes('Error') || t.includes('fatal')) {
        console.log(`  [browser] ${t}`)
      }
    })
    // Use the Vite origin without booting the demo application and its pdfTeX worker.
    await page.goto(`${url}/sample/main.tex`)

    // Bound the in-browser build so a stalled worker/CDN fetch fails loudly in CI
    // instead of hanging the job indefinitely.
    const evalPromise = page.evaluate(async (v) => {
      const { createCompileWorker } = await import('/src/engine/tex-fmt-engine.ts')
      const tex = createCompileWorker('luatex', { texliveVersion: v })
      try {
        await tex.init()
        const r = await tex.run('compileformat')
        if (!r.success || !r.out) return null
        let binary = ''
        for (let i = 0; i < r.out.length; i += 0x8000) {
          binary += String.fromCharCode(...r.out.subarray(i, i + 0x8000))
        }
        return btoa(binary)
      } finally {
        tex.terminate()
      }
    }, version)
    let timeout
    try {
      b64 = await Promise.race([
        evalPromise,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('compileformat timed out after 180s')),
            180_000,
          )
        }),
      ])
    } finally {
      clearTimeout(timeout)
    }
  } finally {
    await browser.close()
    await server.close()
  }

  if (!b64) {
    console.error('FAILED: compileformat did not produce a format file.')
    process.exit(1)
  }
  const buf = Buffer.from(b64, 'base64')
  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, buf)
  writeFormatInputEvidence({
    output: process.env.FORMAT_INPUT_LOG,
    engine: 'luahbtex',
    formatPath: outPath,
    requests: formatRequests,
    procedure: 'node scripts/extract-luatex-format.mjs; gzip -n -9 -c wasmtex-luatex.fmt',
  })
  console.log(`SUCCESS: wrote ${outPath} (${(buf.length / 1024 / 1024).toFixed(2)} MB)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
