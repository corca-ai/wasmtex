import { expect, test } from '@playwright/test'

for (const engine of ['xelatex', 'pdflatex', 'lualatex'] as const) {
  test(`${engine}: nested output survives project switches and repeated compiles`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.goto('/')
    const reports = await page.evaluate(async (options) => {
      const { nestedOutputSequence } = await import('/test/fixtures/nested-output.ts')
      const reports = await nestedOutputSequence(options)
      return reports.map(({ mainFile, repeat, pages, pdf }) => ({ mainFile, repeat, pages, bytes: pdf.length }))
    }, {
      engine,
      texliveVersion: process.env.TEXLIVE_VERSION === '2026' ? '2026' as const : '2025' as const,
      texliveUrl: process.env.TEXLIVE_URL ?? 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/',
    })
    expect(reports).toHaveLength(engine === 'xelatex' ? 11 : 10)
  })
}
