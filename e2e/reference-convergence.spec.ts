import { expect, test } from '@playwright/test'

const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const mirror = process.env.TEXLIVE_URL ?? `https://texlive.corca.ai/snapshots/${year === '2026' ? '2026-ba38749b8714505a' : '2025-0d3fc73b65e39905'}/${year}/`

for (const heapCheckpoints of [true, false]) {
  test(`canonical bibliography convergence has explicit evidence (${heapCheckpoints ? 'heap' : 'plain'})`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.goto('/')
    const rows = await page.evaluate(async ({ year, mirror, heapCheckpoints }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const normalize = (bytes: Uint8Array | null) => bytes && new TextDecoder('latin1').decode(bytes)
        .replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '')
      const main = '\\documentclass{article}\n\\begin{document}\nCitation \\cite{book}.\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}'
      const bib = (title: string) => `@book{book,author={Donald Knuth},title={${title}},year={1984},publisher={Addison-Wesley}}`
      const compiler = new WasmTexCompiler({ engine: 'pdflatex', incremental: true, heapCheckpoints,
        texliveVersion: year, texliveUrl: mirror, files: { 'main.tex': main, 'refs.bib': bib('The TeXbook') } })
      try {
        await compiler.init()
        const rows = []
        for (let edit = 0; edit < 3; edit++) {
          if (edit) compiler.setFile('refs.bib', bib(`The TeXbook revision ${edit}`))
          const first = await compiler.compile()
          const aux = await compiler.readOutput('main.aux')
          const second = await compiler.compile()
          rows.push({ settled: first.telemetry?.referencesSettled, complete: first.telemetry?.dependencyManifest?.complete,
            success: first.success, errors: first.errors, equal: normalize(first.pdf) === normalize(second.pdf),
            auxEqual: aux === await compiler.readOutput('main.aux') })
        }
        compiler.setFile('main.tex', main.replace('cite{book}', 'cite{missing}'))
        const missing = await compiler.compile()
        return { rows, missingSettled: missing.telemetry?.referencesSettled }
      } finally { compiler.dispose() }
    }, { year, mirror, heapCheckpoints })
    for (const row of rows.rows) expect(row).toMatchObject({ settled: true, complete: true, success: true, errors: [], equal: true, auxEqual: true })
    expect(rows.missingSettled).not.toBe(true)
  })
}
