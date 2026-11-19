import { expect, test } from '@playwright/test'

for (const engine of ['pdflatex', 'lualatex', 'xelatex'] as const) {
  test(`${engine}: compile only requested EPS figures with a host converter`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.goto('/')
    const report = await page.evaluate(
      async (options) => {
        const { verifyEpsGraphics } = await import('/test/fixtures/eps-graphics.ts')
        return verifyEpsGraphics(options)
      },
      {
        engine,
        texliveVersion: process.env.TEXLIVE_VERSION === '2026' ? '2026' as const : '2025' as const,
        texliveUrl:
          process.env.TEXLIVE_URL ??
          'https://texlive.corca.ai/snapshots/2025-2e1df8aa17d29d66/2025/',
      },
    )
    expect(report.calls).toBe(2)
  })
}
