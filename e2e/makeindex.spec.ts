import { expect, test } from '@playwright/test'
import { MAKEINDEX_FILES } from './golden-corpus'

/**
 * makeindex acceptance (#134): a `\printindex` document compiles to a *populated* index on
 * the browser headless path with **no server** — the index stage auto-runs (`.idx` → `.ind`
 * via the bundled makeindex WASM) and the forced rerun resolves `\printindex`, exactly like
 * bibtex's `.bbl`. Needs the dev server + engine assets (network), so it lives in the
 * Playwright suite, not unit CI.
 */
test.setTimeout(120_000)

const APP_URL = 'http://localhost:6001'

test('\\printindex produces a populated index (client makeindex, no server)', async ({ page }) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ files }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const c = new WasmTexCompiler({ texliveVersion: '2025', engine: 'pdflatex', files })
      try {
        await c.init()
        const r = await c.compile()
        // The index stage writes `main.ind` into the engine FS; read it back to prove the
        // index was actually generated (not just that the doc compiled).
        return { success: r.success, ind: await c.readOutput('main.ind') }
      } finally {
        c.dispose()
      }
    },
    { files: MAKEINDEX_FILES },
  )

  expect(out.success, 'compile failed').toBe(true)
  expect(out.ind, 'no .ind generated — the index stage did not run').toBeTruthy()
  // makeindex emits the `theindex` environment with the indexed terms.
  expect(out.ind).toContain('\\begin{theindex}')
  expect(out.ind?.toLowerCase()).toContain('tex')
  expect(out.ind?.toLowerCase()).toContain('literate programming')
})
