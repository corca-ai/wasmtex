import { expect, test } from '@playwright/test'

const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const mirror = process.env.TEXLIVE_URL ?? `https://texlive.corca.ai/snapshots/${year === '2026' ? '2026-ba38749b8714505a' : '2025-0d3fc73b65e39905'}/${year}/`

test('a full pass prepares the cursor without another compile and preserves canonical output', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/')
  const rows = await page.evaluate(async ({ year, mirror }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const { SynctexParser } = await import('/src/synctex.ts')
    const synctex = async (bytes: Uint8Array | null) => { if (!bytes) return null; const parsed = await new SynctexParser().parse(bytes); return JSON.stringify([...parsed.pages], (key, value) => key === 'parent' || key === 'children' ? undefined : value); }
    const normalize = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
      .replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '')
    const source = '\\documentclass{article}\n\\begin{document}\n' + Array.from({ length: 30 }, (_, i) =>
      `Paragraph ${i}. ${'Stable prose with precise typography. '.repeat(65)}\n`).join('') + '\\end{document}'
    const options = { engine: 'pdflatex' as const, texliveVersion: year, texliveUrl: mirror,
      incremental: true, heapCheckpointOptions: { minHeadBytes: 0, maxCheckpoints: 1, maxBytes: 64 * 2 ** 20 }, files: { 'main.tex': source } }
    const baseline = new WasmTexCompiler(options)
    const candidate = new WasmTexCompiler(options)
    try {
      await baseline.init(); await candidate.init()
      const expected = await baseline.compile()
      const rows = []
      for (const paragraph of [0, 16]) {
        const hint = { path: 'main.tex', offset: source.indexOf(`Paragraph ${paragraph}.`) }
        // Moving to an unprepared region still uses the ordinary full compile.
        const full = await candidate.compile({ incrementalPreparation: hint })
        const extra = await candidate.prepareIncrementalCompile(hint.path, hint.offset)
        const changed = source.replace(`Paragraph ${paragraph}.`, `Paragraph ${paragraph} edited.`)
        candidate.setFile('main.tex', changed)
        const preview = await candidate.previewPages(20)
        const canonical = await candidate.compile()
        baseline.setFile('main.tex', changed)
        const reference = await baseline.compile()
        rows.push({ extra, preview: !!preview?.pdf, initialEqual: !!full.pdf && !!expected.pdf && normalize(full.pdf) === normalize(expected.pdf),
          equal: !!canonical.pdf && !!reference.pdf && normalize(canonical.pdf) === normalize(reference.pdf),
          synctex: !!canonical.synctex && !!reference.synctex && await synctex(canonical.synctex) === await synctex(reference.synctex),
          errors: canonical.errors, aux: await candidate.readOutput('main.aux') === await baseline.readOutput('main.aux') })
        candidate.setFile('main.tex', source)
        baseline.setFile('main.tex', source)
      }
      return rows
    } finally { baseline.dispose(); candidate.dispose() }
  }, { year, mirror })
  for (const row of rows) {
    expect(row).toMatchObject({ extra: false, preview: true, initialEqual: true, equal: true, synctex: true, aux: true, errors: [] })
  }
})
