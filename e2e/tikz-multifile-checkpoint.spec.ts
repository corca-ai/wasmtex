import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.setTimeout(300_000)
const year = process.env.TEXLIVE_VERSION === '2025' ? ('2025' as const) : ('2026' as const)
// Use the same immutable annual mirror directly, as the other checkpoint specs do.
// An extra development proxy can stall package requests independently of the engine.
const texliveUrl = process.env.TEXLIVE_URL ?? (year === '2025'
  ? 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/'
  : 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/')

test('unread secondary TikZ edits reuse a proven prefix; preamble edits and new files retire it', async ({ page }) => {
  // Exercise the candidate controller with the pinned native engine and formats.
  // This does not change a published asset directory or claim a released identity.
  const controller = ['shared-file.js', 'resolver-evidence.js', 'kpse-resolve.cjs', 'pdftex-worker.js'].map(name => readFileSync(`wasm-build/${name}`, 'utf8')).join('\n')
  const clock = `var NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-13T00:00:00Z'])); } static now() { return 1791849600000; } };\n`
  await page.route('**/wasmtex-pdftex.worker.js*', route => route.fulfill({ contentType: 'text/javascript', body: controller.replace('Module["postRun"] = function() {', 'Module["postRun"] = function() {' + clock) }))
  await page.route('**/tikz-multifile.html', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Multi-file checkpoints</title>' }))
  await page.goto('http://localhost:6001/tikz-multifile.html')
  const out = await page.evaluate(async ({ year, texliveUrl }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const { warmup } = await import('/src/warmup.ts')
    const warmupCache = await warmup({ texliveVersion: year, texliveUrl })
    const source = String.raw`\documentclass{article}
\usepackage{tikz}
\input{config}
\begin{document}
\IfFileExists{optional.tex}{\input{optional}}{}
${Array.from({ length: 12 }, () => 'Unchanged academic text. '.repeat(180) + '\n\n').join('')}
\input{figure}
\begin{tikzpicture}\draw (0,0) circle (1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0) rectangle (1,1);\end{tikzpicture}
\extraFigure
\end{document}`
    const figure = (x: string) => String.raw`\begin{tikzpicture}\draw (0,0)--(${x},1);\end{tikzpicture}`
    const options = {
      files: { 'main.tex': source, 'figure.tex': figure('1'), 'config.tex': String.raw`\def\extraFigure{}` },
      warmupCache, engine: 'pdflatex' as const, texliveVersion: year, texliveUrl,
      tikzExternalization: { mode: 'auto' as const, workers: 1, idleMs: 5000 },
    }
    const candidate = new WasmTexCompiler({ ...options, incremental: true, heapCheckpointOptions: { maxCheckpoints: 1, maxBytes: 64 * 2 ** 20, minHeadBytes: 0 } })
    const full = new WasmTexCompiler(options)
    const normalize = (bytes: Uint8Array | null) => {
      if (!bytes) return null
      let text = ''
      for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192))
      return text.replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '')
    }
    const compare = async () => {
      const actual = await candidate.compile()
      const expected = await full.compile()
      return {
        success: actual.success && expected.success && !!actual.pdf && !!expected.pdf,
        equal: normalize(actual.pdf) === normalize(expected.pdf),
        synctexEqual: !!actual.synctex && !!expected.synctex && String(actual.synctex) === String(expected.synctex),
        canonical: actual.phaseTimings?.checkpointResume !== true,
        manifest: actual.telemetry?.dependencyManifest,
        tikz: actual.telemetry?.tikzExternalization,
        errors: actual.errors,
      }
    }
    try {
      await candidate.init(); await full.init()
      const initial = await compare()
      const prepared = await candidate.prepareIncrementalCompile('main.tex', source.indexOf('\\input{figure}'))
      const edits = []
      for (const x of ['1.1', '1.2']) {
        candidate.setFile('figure.tex', figure(x)); full.setFile('figure.tex', figure(x))
        edits.push(await compare())
      }
      const config = String.raw`\def\extraFigure{\begin{tikzpicture}\draw (0,0)--(2,3);\end{tikzpicture}}`
      candidate.setFile('config.tex', config); full.setFile('config.tex', config)
      const preamble = await compare()
      const preparedAgain = await candidate.prepareIncrementalCompile('main.tex', source.indexOf('\\input{figure}'))
      const added = String.raw`\def\extraFigure{\begin{tikzpicture}\draw (0,0)--(4,5);\end{tikzpicture}}`
      candidate.setFile('optional.tex', added); full.setFile('optional.tex', added)
      const topology = await compare()
      return { initial, prepared, edits, preamble, preparedAgain, topology }
    } finally { candidate.dispose(); full.dispose() }
  }, { year, texliveUrl })
  expect(out.prepared).toBe(true)
  expect(out.preparedAgain).toBe(true)
  for (const result of [out.initial, ...out.edits, out.preamble, out.topology]) {
    expect(result).toMatchObject({ success: true, equal: true, synctexEqual: true, canonical: true, errors: [], manifest: { complete: true } })
    expect(result.manifest?.projectInputs).toEqual(expect.arrayContaining(['main.tex', 'figure.tex', 'config.tex']))
  }
  for (const result of out.edits) expect(result.tikz).toMatchObject({ compiled: 1, reused: 2, discoveryCheckpointResume: true })
  expect(out.preamble.tikz).toMatchObject({ compiled: 1, reused: 3, discoveryCheckpointResume: false })
  expect(out.topology.tikz?.discoveryCheckpointResume).toBe(false)
  expect(out.topology.manifest?.projectInputs).toContain('optional.tex')
})

test('ordinary heap prefixes invalidate an already read file recorded through dot segments', async ({ page }) => {
  const controller = ['shared-file.js', 'resolver-evidence.js', 'kpse-resolve.cjs', 'pdftex-worker.js'].map(name => readFileSync(`wasm-build/${name}`, 'utf8')).join('\n')
  await page.route('**/wasmtex-pdftex.worker.js*', route => route.fulfill({ contentType: 'text/javascript', body: controller }))
  await page.route('**/heap-alias.html', route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>Alias invalidation</title>'}))
  await page.goto('http://localhost:6001/heap-alias.html')
  const out = await page.evaluate(async ({ year, texliveUrl }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const { warmup } = await import('/src/warmup.ts')
    const warmupCache = await warmup({texliveVersion: year, texliveUrl})
    const source = String.raw`\documentclass{article}
\input{sub/../config}
\begin{document}
${Array.from({length: 8}, () => 'Unchanged text. '.repeat(80) + '\n\n').join('')}
\messageText
\end{document}`
    const options = {files: {'main.tex': source, 'config.tex': String.raw`\def\messageText{ORIGINAL}`, 'sub/placeholder.tex': '% Directory input'}, warmupCache, engine: 'pdflatex' as const, texliveVersion: year, texliveUrl}
    const candidate = new WasmTexCompiler({...options, incremental: true, heapCheckpointOptions: {maxCheckpoints: 1, maxBytes: 64 * 2 ** 20, minHeadBytes: 0}})
    const full = new WasmTexCompiler(options)
    const normalize = (bytes: Uint8Array | null) => bytes ? new TextDecoder('latin1').decode(bytes).replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '') : null
    try {
      await candidate.init(); await full.init()
      const initial = await candidate.compile()
      await candidate.prepareIncrementalCompile('main.tex', source.indexOf('\\messageText', source.indexOf('\\begin{document}')))
      const checkpointHeld = (candidate as unknown as {heap: {held: unknown[]}}).heap.held.length > 0
      candidate.setFile('config.tex', String.raw`\def\messageText{CHANGED}`)
      full.setFile('config.tex', String.raw`\def\messageText{CHANGED}`)
      const actual = await candidate.compile()
      const expected = await full.compile()
      return {checkpointHeld, success: initial.success && actual.success && expected.success, resumed: actual.phaseTimings?.checkpointResume === true, equal: !!actual.pdf && normalize(actual.pdf) === normalize(expected.pdf), changed: normalize(initial.pdf) !== normalize(actual.pdf), complete: actual.telemetry?.dependencyManifest?.complete}
    } finally {candidate.dispose(); full.dispose()}
  }, { year, texliveUrl })
  expect(out).toEqual({checkpointHeld: true, success: true, resumed: false, equal: true, changed: true, complete: true})
})
