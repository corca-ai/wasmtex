import { expect, test } from '@playwright/test'

/**
 * LuaLaTeX Computer Modern via the legacy TFM path (#85). Forcing LuaLaTeX on a
 * plain CM document (no fontspec) resolves fonts through TFMs. TFMs are stored
 * extension-less on the CDN (`pdftex/3/cmr12`), but the worker requested them WITH
 * `.tfm` (`pdftex/3/cmr12.tfm` → 403), so the font failed:
 *   Font \OT1/cmr/m/n/12=cmr12 at 12pt not loadable: metric data not found or bad
 *
 * The worker now retries the extension-stripped name (the pdfTeX worker's fix),
 * so cmr12.tfm 403 falls back to cmr12 200 and the font loads.
 *
 * Requires the engine BUILT WITH the worker change deployed to public/wasmtex/2025/.
 */

const APP_URL = 'http://localhost:6001'

// 12 pt title (\maketitle) + 10 pt body → exercises cmr12/cmbx12 + cmr10 via TFMs.
const CM_DOC = [
  '% !TEX program = lualatex',
  '\\documentclass[10pt,twocolumn]{article}',
  '\\usepackage{amsmath,amssymb}',
  '\\title{Computer Modern via TFM}',
  '\\author{WasmTex}',
  '\\begin{document}',
  '\\maketitle',
  'Plain Computer Modern, no fontspec. $E=mc^2$ and $\\sum_{n=1}^{\\infty} 1/n^2 = \\pi^2/6$.',
  '\\end{document}',
  '',
].join('\n')

test.describe('LuaLaTeX Computer Modern TFM path (#85)', () => {
  test.setTimeout(240_000)

  test('forced LuaLaTeX on a plain CM doc loads cmr*.tfm and produces a PDF', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await page.goto(APP_URL)

      const r = await page.evaluate(async (doc) => {
        const mod = await import('/src/headless.ts')
        // @ts-ignore - dev-server module shape
        const c = new mod.WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': doc } })
        try {
          await c.init()
          const res = await c.compile()
          const log = res.log || ''
          return { ok: res.success && !!res.pdf, bytes: res.pdf ? res.pdf.byteLength : 0, metricErr: /metric data not found/i.test(log) }
        } finally {
          c.dispose()
        }
      }, CM_DOC)

      // eslint-disable-next-line no-console
      console.log(`[cm-tfm] ok=${r.ok} bytes=${r.bytes} metricErr=${r.metricErr}`)
      expect(r.metricErr).toBe(false) // the cmr12.tfm 403 regression
      expect(r.ok).toBe(true) // compiles with CM fonts loaded via the TFM path
    } finally {
      await context.close()
    }
  })

  // #87: the TFM retry must NOT substitute a different extension. geometry.cfg is
  // genuinely absent (optional); the over-broad retry resolved it to geometry.sty,
  // loading geometry twice → recursive \input / capacity exceeded. The retry is now
  // scoped to bare-stored formats (tfm/vf), so geometry.cfg misses cleanly.
  const GEOMETRY_DOC = [
    '% !TEX program = lualatex',
    '\\documentclass{article}',
    '\\usepackage[margin=1in]{geometry}',
    '\\begin{document}x\\end{document}',
    '',
  ].join('\n')

  test('a .cfg miss does not fall back to .sty (geometry compiles, no recursion)', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      await page.goto(APP_URL)

      const r = await page.evaluate(async (doc) => {
        const mod = await import('/src/headless.ts')
        // @ts-ignore - dev-server module shape
        const c = new mod.WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': doc } })
        try {
          await c.init()
          const res = await c.compile()
          const log = res.log || ''
          return {
            ok: res.success && !!res.pdf,
            bytes: res.pdf ? res.pdf.byteLength : 0,
            recursion: /already defined|capacity exceeded/i.test(log),
          }
        } finally {
          c.dispose()
        }
      }, GEOMETRY_DOC)

      // eslint-disable-next-line no-console
      console.log(`[geometry] ok=${r.ok} bytes=${r.bytes} recursion=${r.recursion}`)
      expect(r.recursion).toBe(false) // the geometry.cfg -> geometry.sty regression
      expect(r.ok).toBe(true)
    } finally {
      await context.close()
    }
  })
})
