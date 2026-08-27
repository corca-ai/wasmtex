import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { BIBTEX_FILES, docFor, MAKEINDEX_FILES, pdfImportFiles } from '../../e2e/golden-corpus'

/**
 * Cross-host parity (S4 / #111, execution-model principle 5): the determinism contract.
 * Compiles the #51 golden corpus under **Node** (via the #121 host adapter) and asserts
 * the structural signature equals the **browser-generated** golden in `e2e/goldens/`.
 * Browser ≡ Node ⇒ the same deterministic engine, so the client/server boundary is safe
 * to slide. Opt-in (network + curl + engine assets):
 *
 *   CROSS_HOST_PARITY=1 npx vitest run src/engine/cross-host-parity.smoke.test.ts
 *
 * Set `WASMTEX_SMOKE_PUBLIC_DIR` to exercise locally rebuilt assets without replacing the
 * checked-in release artifacts under `public/`.
 */
const RUN = process.env.CROSS_HOST_PARITY === '1'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// pdfLaTeX, LuaLaTeX, and XeLaTeX all run under the Node host (M1 #113). XeLaTeX's
// font-by-name needs the ICU data file (icudt68l.dat), which the CDN serves gzip-encoded;
// the Node host fetches it with `curl --compressed` so ICU gets the decoded bytes (the
// browser's XHR does this transparently). The corpus is shared with the browser golden
// test (e2e/golden-corpus.ts) so both compare against the same e2e/goldens/*.
const ENGINES = ['pdflatex', 'lualatex', 'xelatex'] as const
const ASSET = 'http://assets.local/'
const TEXLIVE =
  process.env.WASMTEX_SMOKE_TEXLIVE_URL ?? 'https://d1jectpaw0dlvl.cloudfront.net/2025/'

/** Compile `files` under the Node host and assert the structural signature equals the
 *  committed browser golden `e2e/goldens/<goldenName>`. */
async function assertParity(
  engine: 'pdflatex' | 'xelatex' | 'lualatex',
  files: Record<string, string | Uint8Array>,
  goldenName: string,
): Promise<void> {
  const { installNodeWorkerHost } = await import('./node-host')
  const { WasmTexCompiler } = await import('../headless')
  installNodeWorkerHost({
    publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(ROOT, 'public'),
    assetBaseUrl: ASSET,
  })

  const compiler = new WasmTexCompiler({
    engine,
    assetBaseUrl: ASSET,
    texliveUrl: TEXLIVE,
    files,
  })
  try {
    await compiler.init()
    const r = await compiler.compile()
    const pages = r.pdf?.length
      ? (await PDFDocument.load(Uint8Array.from(r.pdf))).getPageCount()
      : 0
    const g = r.telemetry?.geometry
    const signature = {
      success: r.success,
      errorCount: r.errors.length,
      pages,
      diagnosticCodes: [...new Set((r.telemetry?.diagnostics ?? []).map((d) => d.code))].sort(),
      geometry: g
        ? {
            pages: g.pages.length,
            reliable: g.reliable,
            textRuns: g.pages.reduce((n, p) => n + p.textRuns.length, 0),
            rules: g.pages.reduce((n, p) => n + p.rules.length, 0),
          }
        : null,
    }
    const golden = JSON.parse(readFileSync(join(ROOT, 'e2e/goldens', goldenName), 'utf8'))
    // The crux of the hybrid: the Node host reproduces the browser's output exactly.
    expect(signature).toEqual(golden)
  } finally {
    compiler.dispose()
  }
}

describe.runIf(RUN)('cross-host parity (#111, #113, #114)', () => {
  for (const engine of ENGINES) {
    it(
      `${engine}: Node output equals the browser-generated golden`,
      () => assertParity(engine, { 'main.tex': docFor(engine) }, `${engine}.json`),
      180_000,
    )
  }

  // Bibliography (pdfLaTeX + BibTeX, M2 #114): the bibtex stage runs under Node too.
  it(
    'bibtex: Node output equals the browser-generated golden',
    () => assertParity('pdflatex', BIBTEX_FILES, 'bibtex.json'),
    180_000,
  )

  // Index (pdfLaTeX + makeindex, M3 #115/#134): the makeindex stage runs under Node too.
  // Skipped until the browser golden is generated (`GOLDEN_UPDATE=1 playwright test
  // golden-output`), so an opt-in run before that doesn't hard-fail on a missing file.
  it.runIf(existsSync(join(ROOT, 'e2e/goldens/makeindex.json')))(
    'makeindex: Node output equals the browser-generated golden',
    () => assertParity('pdflatex', MAKEINDEX_FILES, 'makeindex.json'),
    180_000,
  )

  for (const engine of ['xelatex', 'lualatex'] as const) {
    it.runIf(existsSync(join(ROOT, 'e2e/goldens', `pdf-import-${engine}.json`)))(
      `${engine}: graphicx/pdfpages/TikZ PDF import equals the browser golden`,
      () => assertParity(engine, pdfImportFiles(engine), `pdf-import-${engine}.json`),
      180_000,
    )
  }
})
