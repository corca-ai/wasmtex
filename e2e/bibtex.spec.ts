import { test, expect } from '@playwright/test'

test.setTimeout(120_000)

test.describe('BibTeX Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 30_000 })
  })

  test('compiles with BibTeX references', async ({ page }) => {
    const bibContent = `
@article{knuth1984,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
}
`
    const texContent = `
\\documentclass{article}
\\begin{document}
As shown in \\cite{knuth1984}, TeX is great.
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}
`

    // Use loadProject to set both files at once and trigger compilation
    await page.evaluate(({ bib, tex }) => {
      // @ts-ignore
      window.__wasmTex.loadProject({
        'main.tex': tex,
        'references.bib': bib
      })
    }, { bib: bibContent, tex: texContent })

    // Wait for compilation to settle
    // We expect main.bbl to eventually contain knuth1984
    await expect.poll(async () => {
      try {
        return await page.evaluate(async () => {
          try {
            // @ts-ignore
            return await window.__engine.readFile('main.bbl') || ''
          } catch (e) {
            return ''
          }
        })
      } catch {
        return ''
      }
    }, {
      timeout: 90_000,
      intervals: [1000],
    }).toContain('\\bibitem{knuth1984}')

    // Verify Literate Programming is in the .bbl (case-insensitive because styles vary)
    const bblContent = await page.evaluate(async () => {
      // @ts-ignore
      return await window.__engine.readFile('main.bbl')
    })
    expect(bblContent?.toLowerCase()).toContain('literate programming')
  })
})
