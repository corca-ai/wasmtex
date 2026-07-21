import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { BIBTEX_FILES, docFor, MAKEINDEX_FILES } from './golden-corpus'

/**
 * Golden-output regression (#51). CI's WASM smoke tests prove the engines *link* and
 * carry our own glue (no AGPL, the interposition symbols are present — see #50). They do
 * NOT prove the *rendered output* is unchanged. A from-source bump (new `texlive-source`
 * ref, a font-DB regen, an Emscripten upgrade) can "build green" yet silently shift the
 * typeset result.
 *
 * This locks a small reference corpus to a deterministic structural signature — page
 * count, telemetry diagnostic codes, and (XeLaTeX) XDV box/run geometry — derived from
 * `CompileResult`, NOT raw PDF bytes (those carry timestamps and are not reproducible).
 * Run on a schedule by `.github/workflows/golden-canary.yml` so drift surfaces before a
 * user hits it.
 *
 * Regenerate after an intentional output change:
 *   GOLDEN_UPDATE=1 npx playwright test golden-output
 * Then eyeball the `e2e/goldens/*.json` diff before committing.
 */

const APP_URL = 'http://localhost:6001'
const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), 'goldens')
const UPDATE = process.env.GOLDEN_UPDATE === '1'

const ENGINES = ['pdflatex', 'xelatex', 'lualatex'] as const

interface Signature {
  success: boolean
  errorCount: number
  /** Page count parsed from the PDF page objects (timestamp-independent). */
  pages: number
  /** Sorted unique telemetry diagnostic codes (#54) — a stable classification. */
  diagnosticCodes: string[]
  /** XDV geometry summary (XeLaTeX only); null for engines that emit no XDV. */
  geometry: { pages: number; reliable: boolean; textRuns: number; rules: number } | null
}

for (const engine of ENGINES) {
  test(`golden output — ${engine}`, async ({ page }) => {
    const file = join(GOLDEN_DIR, `${engine}.json`)
    test.skip(
      !UPDATE && !existsSync(file),
      `no golden for ${engine} yet — run \`GOLDEN_UPDATE=1 npx playwright test golden-output\` to create it`,
    )

    await page.goto(APP_URL)
    // The compile runs in the browser (the engine is WASM); PDF parsing happens back in
    // Node (pdf-lib doesn't resolve as a bare specifier inside `page.evaluate`).
    const raw = await page.evaluate(
      async ({ engine, doc }) => {
        const { WasmTexCompiler } = await import('/src/headless.ts')
        const c = new WasmTexCompiler({
          texliveVersion: '2025',
          engine: engine as 'pdflatex' | 'xelatex' | 'lualatex',
          files: { 'main.tex': doc },
        })
        try {
          await c.init()
          const r = await c.compile()
          const g = r.telemetry?.geometry
          return {
            success: r.success,
            errorCount: r.errors.length,
            diagnosticCodes: [
              ...new Set((r.telemetry?.diagnostics ?? []).map((d) => d.code)),
            ].sort(),
            geometry: g
              ? {
                  pages: g.pages.length,
                  reliable: g.reliable,
                  textRuns: g.pages.reduce((n, p) => n + p.textRuns.length, 0),
                  rules: g.pages.reduce((n, p) => n + p.rules.length, 0),
                }
              : null,
            pdfBytes: r.pdf ? Array.from(r.pdf) : [],
          }
        } finally {
          c.dispose()
        }
      },
      { engine, doc: docFor(engine) },
    )

    // Page count via pdf-lib (handles PDF 1.5+ compressed object streams, where
    // `/Type /Page` is not visible in the raw bytes). Deterministic, unlike the PDF's
    // timestamp-bearing bytes — which is why the bytes themselves never enter the golden.
    const pages = raw.pdfBytes.length
      ? (await PDFDocument.load(Uint8Array.from(raw.pdfBytes))).getPageCount()
      : 0
    const sig: Signature = {
      success: raw.success,
      errorCount: raw.errorCount,
      pages,
      diagnosticCodes: raw.diagnosticCodes,
      geometry: raw.geometry,
    }

    // A golden is only meaningful if the compile itself succeeded.
    expect(sig.success, `${engine} compile failed`).toBe(true)
    expect(sig.pages, `${engine} produced no pages`).toBeGreaterThan(0)

    if (UPDATE) {
      mkdirSync(GOLDEN_DIR, { recursive: true })
      writeFileSync(file, `${JSON.stringify(sig, null, 2)}\n`)
      console.log(`updated golden: ${file}`)
      return
    }

    const golden = JSON.parse(readFileSync(file, 'utf8')) as Signature
    expect(sig).toEqual(golden)
  })
}

// Bibliography (pdfLaTeX + BibTeX) — a multi-file project so the bibtex pass runs.
test('golden output — bibtex', async ({ page }) => {
  const file = join(GOLDEN_DIR, 'bibtex.json')
  test.skip(
    !UPDATE && !existsSync(file),
    'no golden for bibtex yet — run `GOLDEN_UPDATE=1 npx playwright test golden-output`',
  )

  await page.goto(APP_URL)
  const raw = await page.evaluate(async ({ files }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const c = new WasmTexCompiler({ texliveVersion: '2025', engine: 'pdflatex', files })
    try {
      await c.init()
      const r = await c.compile()
      return {
        success: r.success,
        errorCount: r.errors.length,
        diagnosticCodes: [...new Set((r.telemetry?.diagnostics ?? []).map((d) => d.code))].sort(),
        pdfBytes: r.pdf ? Array.from(r.pdf) : [],
      }
    } finally {
      c.dispose()
    }
  }, { files: BIBTEX_FILES })

  const pages = raw.pdfBytes.length
    ? (await PDFDocument.load(Uint8Array.from(raw.pdfBytes))).getPageCount()
    : 0
  const sig: Signature = {
    success: raw.success,
    errorCount: raw.errorCount,
    pages,
    diagnosticCodes: raw.diagnosticCodes,
    geometry: null,
  }

  expect(sig.success, 'bibtex compile failed').toBe(true)
  expect(sig.pages, 'bibtex produced no pages').toBeGreaterThan(0)

  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(file, `${JSON.stringify(sig, null, 2)}\n`)
    console.log(`updated golden: ${file}`)
    return
  }

  expect(sig).toEqual(JSON.parse(readFileSync(file, 'utf8')) as Signature)
})

// Index (pdfLaTeX + makeindex) — `\index` + `\printindex`, so the index stage runs and the
// rerun resolves `\printindex`. The dedicated `makeindex.spec.ts` asserts the `.ind` content;
// this locks the structural signature like the other goldens.
test('golden output — makeindex', async ({ page }) => {
  const file = join(GOLDEN_DIR, 'makeindex.json')
  test.skip(
    !UPDATE && !existsSync(file),
    'no golden for makeindex yet — run `GOLDEN_UPDATE=1 npx playwright test golden-output`',
  )

  await page.goto(APP_URL)
  const raw = await page.evaluate(async ({ files }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const c = new WasmTexCompiler({ texliveVersion: '2025', engine: 'pdflatex', files })
    try {
      await c.init()
      const r = await c.compile()
      return {
        success: r.success,
        errorCount: r.errors.length,
        diagnosticCodes: [...new Set((r.telemetry?.diagnostics ?? []).map((d) => d.code))].sort(),
        pdfBytes: r.pdf ? Array.from(r.pdf) : [],
      }
    } finally {
      c.dispose()
    }
  }, { files: MAKEINDEX_FILES })

  const pages = raw.pdfBytes.length
    ? (await PDFDocument.load(Uint8Array.from(raw.pdfBytes))).getPageCount()
    : 0
  const sig: Signature = {
    success: raw.success,
    errorCount: raw.errorCount,
    pages,
    diagnosticCodes: raw.diagnosticCodes,
    geometry: null,
  }

  expect(sig.success, 'makeindex compile failed').toBe(true)
  expect(sig.pages, 'makeindex produced no pages').toBeGreaterThan(0)

  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true })
    writeFileSync(file, `${JSON.stringify(sig, null, 2)}\n`)
    console.log(`updated golden: ${file}`)
    return
  }

  expect(sig).toEqual(JSON.parse(readFileSync(file, 'utf8')) as Signature)
})
