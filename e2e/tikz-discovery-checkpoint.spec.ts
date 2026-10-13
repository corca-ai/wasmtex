import { expect, test } from '@playwright/test'

test.setTimeout(300_000)
const year = process.env.TEXLIVE_VERSION === '2025' ? ('2025' as const) : ('2026' as const)
const paragraph = 'Unchanged academic text before the diagrams. '.repeat(100)
const source = String.raw`\documentclass{article}
\usepackage{tikz}
\input{config}
\begin{document}
${Array.from({ length: 12 }, () => `${paragraph}\n\n`).join('')}
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0) circle (1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0) rectangle (1,1);\end{tikzpicture}
\end{document}`

test('TikZ discovery resumes before figures and reconciles canonical PDF and mappings', async ({ page }) => {
  // Fix clocks in every engine, including the sibling figure jobs. Imported figure
  // dates can live inside compressed PDF objects, beyond outer PDF normalization.
  await page.route('**/*.worker.js*', async (route) => {
    const response = await route.fetch()
    const clock = `var NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-13T00:00:00Z'])); } static now() { return 1791849600000; } };\n`
    await route.fulfill({ response, body: (await response.text()).replace('Module["postRun"] = function() {', 'Module["postRun"] = function() {' + clock) })
  })
  await page.route('**/tikz-probe.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>TikZ qualification</title>' }))
  await page.goto('http://localhost:6001/tikz-probe.html')
  const out = await page.evaluate(async ({ source, year }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const { warmup } = await import('/src/warmup.ts')
    const warmupCache = await warmup({ texliveVersion: year, texliveUrl: `${location.origin}/texlive/` })
    const normalize = (bytes: Uint8Array) => {
      let text = ''
      for (let i = 0; i < bytes.length; i += 8192)
        text += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return text.replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '')
    }
    const options = {
      files: { 'main.tex': source, 'config.tex': String.raw`\def\extraFigure{}` },
      warmupCache,
      engine: 'pdflatex' as const,
      texliveVersion: year,
      texliveUrl: `${location.origin}/texlive/`,
      tikzExternalization: { mode: 'auto' as const, workers: 1, idleMs: 5000 },
    }
    const candidate = new WasmTexCompiler({ ...options, incremental: true, heapCheckpointOptions: { maxCheckpoints: 1, maxBytes: 64 * 2 ** 20, minHeadBytes: 0 } })
    const full = new WasmTexCompiler(options)
    try {
      await candidate.init()
      await full.init()
      const initial = await candidate.compile()
      const initialFull = await full.compile()
      const prepared = await candidate.prepareIncrementalCompile('main.tex', source.indexOf('\\begin{tikzpicture}'))
      const results = []
      let lastSource = source
      for (const value of ['1.1', '1.2', '3.4']) {
        const next = source.replace('(1,1)', `(${value},1)`)
        lastSource = next
        candidate.setFile('main.tex', next)
        full.setFile('main.tex', next)
        const fast = await candidate.compile()
        const expected = await full.compile()
        results.push({
          success: fast.success && expected.success,
          equal: !!fast.pdf && !!expected.pdf && normalize(fast.pdf) === normalize(expected.pdf),
          telemetry: fast.telemetry?.tikzExternalization,
          canonical: fast.phaseTimings?.checkpointResume !== true,
          synctex: !!fast.synctex,
          dependencyComplete: fast.telemetry?.dependencyManifest?.complete,
          errors: fast.errors,
        })
      }
      // Even a text-only discovery resume must finish with a full main pass.
      candidate.setFile('main.tex', lastSource.replace('\\end{document}', 'Extra prose.\\end{document}'))
      const text = await candidate.compile()
      // Preamble dependencies are not necessarily present in snapshot recorder inputs.
      // Change one to add an entire figure; stale discovery would miss its job.
      const configured = lastSource.replace('\\end{document}', '\\extraFigure\\end{document}')
      candidate.setFile('main.tex', configured)
      full.setFile('main.tex', configured)
      await candidate.compile()
      await full.compile()
      await candidate.prepareIncrementalCompile('main.tex', configured.indexOf('\\begin{tikzpicture}'))
      const checkpointHeld = (candidate as unknown as { heap: { held: unknown[] } }).heap.held.length > 0
      const config = String.raw`\def\extraFigure{\begin{tikzpicture}\draw (0,0)--(2,3);\end{tikzpicture}}`
      candidate.setFile('config.tex', config)
      full.setFile('config.tex', config)
      const changedConfig = await candidate.compile()
      const expectedConfig = await full.compile()
      const configResult = {
        checkpointHeld,
        success: changedConfig.success && expectedConfig.success,
        equal: !!changedConfig.pdf && !!expectedConfig.pdf && normalize(changedConfig.pdf) === normalize(expectedConfig.pdf),
        telemetry: changedConfig.telemetry?.tikzExternalization,
      }
      return { configResult, prepared, initial: {success: initial.success, errors: initial.errors}, initialFull: initialFull.success, results, textCanonical: text.phaseTimings?.checkpointResume !== true, textTelemetry: text.telemetry?.tikzExternalization }
    } finally {
      candidate.dispose()
      full.dispose()
    }
  }, { source, year })
  expect(out.initial).toMatchObject({success: true, errors: []})
  expect(out.initialFull).toBe(true)
  expect(out.prepared).toBe(true)
  for (const result of out.results) {
    expect(result).toMatchObject({ success: true, equal: true, canonical: true, synctex: true, dependencyComplete: true, errors: [] })
    expect(result.telemetry).toMatchObject({ compiled: 1, reused: 2, discoveryCheckpointResume: true })
  }
  expect(out.configResult).toMatchObject({ checkpointHeld: true, success: true, equal: true })
  expect(out.configResult.telemetry).toMatchObject({ compiled: 1, reused: 3, discoveryCheckpointResume: false })
  expect(out.textCanonical).toBe(true)
  expect(out.textTelemetry).toMatchObject({compiled: 0, reused: 3, discoveryCheckpointResume: true})
})
