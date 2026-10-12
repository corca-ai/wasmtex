import { expect, test } from '@playwright/test'

const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const mirror = process.env.TEXLIVE_URL ?? (year === '2026'
  ? 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/'
  : 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/')
const paragraph = 'The original paragraph keeps precise typography while the author continues to edit. '
const body = Array.from({ length: 90 }, (_, i) =>
  `Paragraph ${i}. ${paragraph.repeat(14)}\n\n`).join('')
const fixtures = [
  { name: 'prose', preamble: '\\documentclass{article}', extra: '' },
  { name: 'math and footnotes', preamble: '\\documentclass{article}\\usepackage{amsmath}',
    extra: 'Text\\footnote{A real footnote.}\\begin{equation}\\sum_{k=1}^{n}k^2=\\frac{n(n+1)(2n+1)}6\\end{equation}\n' },
  { name: 'links and references', preamble: '\\documentclass{article}\\usepackage{hyperref}',
    extra: '\\section{Heading}\\label{heading} Section~\\ref{heading}. \\href{https://example.org}{A link}.\n' },
  { name: 'two columns and floats', preamble: '\\documentclass[twocolumn]{article}',
    extra: '\\begin{figure}[t]\\centering\\rule{20mm}{12mm}\\caption{A floating figure}\\end{figure}\n' },
]

for (const fixture of fixtures.flatMap(f => [true, false].map(heapCheckpoints => ({ ...f, heapCheckpoints })))) {
  test(`page preview matches canonical pixels: ${fixture.name} (${fixture.heapCheckpoints ? 'heap' : 'plain'})`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.route('**/page-preview-test', route => route.fulfill({
      contentType: 'text/html', body: '<!doctype html><title>Page preview qualification</title>',
    }))
    await page.goto('/page-preview-test')
    const source = `${fixture.preamble}\n\\begin{document}\n${fixture.extra}${body}\\end{document}\n`
    const evidence = await page.evaluate(async ({ source, year, mirror, heapCheckpoints }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const { WasmTexPdftexEngine } = await import('/src/engine/wasmtex-engine.ts')
      const { SynctexParser } = await import('/src/synctex.ts')
      let previewEvidence = null
      const previewMethod = WasmTexPdftexEngine.prototype.compilePagePreview
      WasmTexPdftexEngine.prototype.compilePagePreview = async function (...args) {
        const result = await previewMethod.apply(this, args)
        previewEvidence = result && { success: result.success, errors: result.errors, log: result.log, phases: result.phaseTimings }
        return result
      }
      const pdfjs = await import('/node_modules/pdfjs-dist/build/pdf.mjs')
      pdfjs.GlobalWorkerOptions.workerSrc = '/node_modules/pdfjs-dist/build/pdf.worker.mjs'
      const mainFile = heapCheckpoints ? 'main.tex' : 'nested/main.tex'
      const compiler = new WasmTexCompiler({
        mainFile, engine: 'pdflatex', files: { [mainFile]: source },
        texliveVersion: year, texliveUrl: mirror,
        incremental: true,
        heapCheckpoints,
        heapCheckpointOptions: { minHeadBytes: 0, maxCheckpoints: 1, maxBytes: 64 * 2 ** 20 },
      })
      const digest = async (data: Uint8ClampedArray) =>
        Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
          .map(n => n.toString(16).padStart(2, '0')).join('')
      async function pixels(bytes: Uint8Array, limit: number) {
        const document = await pdfjs.getDocument({ data: bytes.slice() }).promise
        try {
          const hashes: string[] = []
          for (let n = 1; n <= Math.min(limit, document.numPages); n++) {
            const p = await document.getPage(n)
            const viewport = p.getViewport({ scale: 1 })
            const canvas = window.document.createElement('canvas')
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            const context = canvas.getContext('2d')!
            await p.render({ canvasContext: context, canvas, viewport }).promise
            hashes.push(await digest(context.getImageData(0, 0, canvas.width, canvas.height).data))
            canvas.width = canvas.height = 0
          }
          return { pages: document.numPages, hashes }
        } finally { await document.destroy() }
      }
      try {
        await compiler.init()
        const baseline = await compiler.compile()
        if (!baseline.success) throw new Error(baseline.log)
        const prepared = await compiler.prepareIncrementalCompile(mainFile, source.indexOf('original'))
        if (heapCheckpoints && !prepared) throw new Error('Heap checkpoint was not prepared')
        const samples = []
        let edited = source
        for (const suffix of [' edited', ' continuously edited', ' edited once more']) {
          edited = source.replace('original', `original${suffix}`)
          compiler.setFile(mainFile, edited)
          const aux = await compiler.readOutput('main.aux')
          const t = performance.now()
          const preview = await compiler.previewPages(2)
          if (!preview) throw new Error(`Page preview unavailable: ${JSON.stringify(previewEvidence)}`)
          samples.push({ ms: performance.now() - t, bytes: preview.pdf.byteLength, phases: previewEvidence?.phases })
          if (!preview.synctex) throw new Error('Preview has no SyncTeX')
          const mapping = await new SynctexParser().parse(preview.synctex)
          if (mapping.pages.size !== 2 || !mapping.inputs.size) throw new Error('Preview SyncTeX inventory is incomplete')
          if (await compiler.readOutput('main.aux') !== aux) throw new Error('Preview changed auxiliary state')
          const canonical = await compiler.compile()
          if (!canonical.success || !canonical.pdf) throw new Error(canonical.log)
          const [prefix, full] = await Promise.all([pixels(preview.pdf, 2), pixels(canonical.pdf, 2)])
          if (JSON.stringify(prefix.hashes) !== JSON.stringify(full.hashes))
            throw new Error(`Preview pixels differ: ${JSON.stringify({ prefix, full })}`)
          if (prefix.pages !== 2 || full.pages <= 2) throw new Error('Fixture did not exercise bounded pages')
        }
        if (heapCheckpoints && !samples[0]?.phases?.checkpointResume)
          throw new Error('Preview did not resume the prepared checkpoint')
        const beforeError = await compiler.readOutput('main.aux')
        compiler.setFile(mainFile, source.replace('original', '\\undefinedPreviewCommand original'))
        if (await compiler.previewPages(2)) throw new Error('Erroneous preview was accepted')
        if (await compiler.readOutput('main.aux') !== beforeError) throw new Error('Failed preview changed auxiliary state')
        const invalid = await compiler.compile()
        if (!invalid.errors.some(error => error.severity === 'error'))
          throw new Error('Invalid fixture lost its diagnostics')
        compiler.setFile(mainFile, edited)
        if (!(await compiler.compile()).success) throw new Error('Full compile did not recover')
        if (!(await compiler.previewPages(2))) throw new Error('Preview did not recover')
        return samples
      } finally { compiler.dispose() }
    }, { source, year, mirror, heapCheckpoints: fixture.heapCheckpoints })
    expect(evidence).toHaveLength(3)
    console.log(JSON.stringify({ fixture: fixture.name, heapCheckpoints: fixture.heapCheckpoints, year, samples: evidence }))
  })
}
