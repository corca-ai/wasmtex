import { expect, test } from '@playwright/test'

/**
 * XeLaTeX warm recompile (#82). Reusing one `WasmTexCompiler` across edits — the
 * standard interactive recompile path — must keep producing PDFs.
 *
 * Regression: the from-source dvipdfmx (#81) succeeded on the COLD compile but failed
 * on the 2nd compile with `xdvipdfmx:fatal: No font selected!` and crashed on the 3rd,
 * because dvipdfmx's main() is not re-entrant and its C globals (loaded-font table,
 * fontmap hash, page device) carried over between runs under EXIT_RUNTIME=0. The dpx
 * worker now snapshots the pristine post-init heap and restores it before each compile
 * (the font/map cache lives in MEMFS and survives, so no re-fetch).
 *
 * Requires the engine BUILT WITH the worker change deployed to public/wasmtex/2025/.
 */

const APP_URL = 'http://localhost:6001'

const doc = (n: number) =>
  [
    '% !TEX program = xelatex',
    '\\documentclass{article}',
    '\\usepackage{fontspec}',
    '\\setmainfont{Latin Modern Roman}',
    '\\begin{document}',
    `Warm recompile test, edit ${n}. $E=mc^2$.`,
    '\\end{document}',
    '',
  ].join('\n')

test.describe('XeLaTeX warm recompile (#82)', () => {
  test.setTimeout(240_000)

  test('2nd and 3rd compiles on a reused instance still produce a PDF', async ({ browser }) => {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto(APP_URL)

    const results = await page.evaluate(async (docs) => {
      const mod = await import('/src/headless.ts')
      // @ts-ignore - dev-server module shape
      const c = new mod.WasmTexCompiler({ engine: 'xelatex', files: { 'main.tex': docs[0] } })
      await c.init()
      const out: { ok: boolean; bytes: number }[] = []
      // #1 cold, then edit + recompile (#2, #3) — the path that regressed.
      const r1 = await c.compile()
      out.push({ ok: r1.success && !!r1.pdf, bytes: r1.pdf ? r1.pdf.byteLength : 0 })
      for (let i = 1; i < docs.length; i++) {
        c.setFile('main.tex', docs[i])
        const r = await c.compile()
        out.push({ ok: r.success && !!r.pdf, bytes: r.pdf ? r.pdf.byteLength : 0 })
      }
      c.dispose()
      return out
    }, [doc(1), doc(2), doc(3)])

    // eslint-disable-next-line no-console
    console.log(`[warm] ${results.map((r, i) => `#${i + 1}=${r.ok ? r.bytes + 'B' : 'FAIL'}`).join(' ')}`)
    expect(results.map((r) => r.ok)).toEqual([true, true, true])
    await context.close()
  })
})
