import { expect, test } from '@playwright/test'

/**
 * LuaTeX looks a found path up again before opening it, and TFM and VF search by suffix
 * alone, so a font cached without its suffix is found and then refused. A virtual font
 * then stays a real one with no outline and asks for a bitmap. Under INITEX the same
 * refusal left `nullfont` in the format for cmex10, which took the large symbols out of
 * any document that does not load amsmath.
 */
const SOURCE = [
  '\\documentclass{article}',
  '\\usepackage[T1]{fontenc}',
  '\\usepackage{times}',
  '\\begin{document}',
  '\\section{Bold heading}',
  'Text with \\textit{italics}, and $\\int_0^1 x\\,dx + \\sum_i a_i$.',
  '\\end{document}',
  '',
].join('\n')

test('LuaLaTeX uses virtual fonts and the large math symbols', async ({ page }) => {
  test.setTimeout(240_000)
  await page.goto('/')
  const result = await page.evaluate(async (options) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const compiler = new WasmTexCompiler({ ...options, engine: 'lualatex' })
    try {
      await compiler.init()
      const { success, pdf, errors, log } = await compiler.compile()
      return {
        success,
        pdf: pdf?.length ?? 0,
        errors: errors.filter(({ severity }) => severity === 'error').map(({ message }) => message),
        missing: /mktexpk|is undefined/.test(log),
      }
    } finally {
      compiler.dispose()
    }
  }, {
    files: { 'main.tex': SOURCE },
    texliveVersion: process.env.TEXLIVE_VERSION === '2026' ? '2026' as const : '2025' as const,
    texliveUrl: process.env.TEXLIVE_URL ?? 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/',
  })
  expect(result.errors).toEqual([])
  expect(result.missing).toBe(false)
  expect(result.success).toBe(true)
  expect(result.pdf).toBeGreaterThan(0)
})
