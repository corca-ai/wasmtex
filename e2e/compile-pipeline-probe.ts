import { WasmTexCompiler, type WasmTexCompilerOptions } from '../src/headless'
import { CompileWorkerDriver, WasmTexWorker } from '../src/engine/wasmtex-worker'

interface Span {
  stage: string
  startMs: number
  durationMs: number
  bytes?: number
}

let active = false

/** Development-only observation of the real SDK. No application imports, worker
 * modifications, or public API are required. Stage spans may overlap; do not sum
 * them into wall time or describe a worker round-trip as pure TeX CPU time. */
export async function measureCompilePipeline(options: WasmTexCompilerOptions) {
  if (active) throw new Error('Run pipeline probes serially in one JS context')
  const spans: Span[] = []
  const origin = performance.now()
  const run = CompileWorkerDriver.prototype.run
  const writeFile = WasmTexWorker.prototype.writeFile
  const fetch = globalThis.fetch
  const compiler = new WasmTexCompiler(options)
  active = true
  const record = (stage: string, start: number, bytes?: number) => {
    spans.push({ stage, startMs: start - origin, durationMs: performance.now() - start, bytes })
  }
  CompileWorkerDriver.prototype.run = async function (command) {
    const start = performance.now()
    try {
      return await run.call(this, command)
    } finally {
      record(command === 'compilepdf' ? 'dvipdfmx round-trip' : `${command} round-trip`, start)
    }
  }
  WasmTexWorker.prototype.writeFile = async function (path, content) {
    const start = performance.now()
    try {
      return await writeFile.call(this, path, content)
    } finally {
      record(
        'worker file write',
        start,
        typeof content === 'string'
          ? new TextEncoder().encode(content).byteLength
          : content.byteLength,
      )
    }
  }
  globalThis.fetch = async (...args) => {
    const start = performance.now()
    try {
      return await fetch(...args)
    } finally {
      record('host fetch headers (body excluded)', start)
    }
  }
  try {
    const start = performance.now()
    await compiler.init()
    const initMs = performance.now() - start
    const preparationSpans = spans.slice()
    const samples = []
    const mainFile = options.mainFile ?? 'main.tex'
    const original = options.files?.[mainFile]
    if (typeof original !== 'string') throw new Error('Probe needs a text main file')
    for (const scenario of [
      'cold',
      'unchanged',
      'body edit',
      'preamble edit',
      'restore',
      'unchanged',
    ] as const) {
      if (scenario === 'body edit')
        compiler.setFile(
          mainFile,
          original.replace('\\end{document}', 'An edited paragraph.\\end{document}'),
        )
      if (scenario === 'preamble edit')
        compiler.setFile(
          mainFile,
          original.replace(
            '\\begin{document}',
            '\\newcommand{\\probeword}{Changed}\\begin{document}',
          ),
        )
      if (scenario === 'restore') compiler.setFile(mainFile, original)
      const firstSpan = spans.length
      const start = performance.now()
      const result = await compiler.compile()
      const wallMs = performance.now() - start
      if (!result.success || !result.pdf?.length) throw new Error(`${scenario}: ${result.log}`)
      // Keep raw PDF hashes: comparisons must use a fixed test clock and apply
      // only the existing allowed PDF timestamp/ID normalization separately.
      const pdfSha256 = Array.from(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(result.pdf))),
        (b) => b.toString(16).padStart(2, '0'),
      ).join('')
      samples.push({
        scenario,
        wallMs,
        spans: spans.slice(firstSpan),
        pdfBytes: result.pdf.length,
        pdfSha256,
        phaseTimings: result.phaseTimings ?? null,
        resolver: result.telemetry?.resolver ?? null,
        dependencies: result.telemetry?.texliveDependencies ?? null,
        tikz: result.telemetry?.tikzExternalization ?? null,
      })
    }
    return {
      engine: options.engine,
      version: options.texliveVersion,
      initMs,
      preparationSpans,
      samples,
      limitations: [
        'Worker round-trips include synchronous I/O and messaging.',
        'Worker HTTP duration is unobserved; resolver reports provide bounded lookup evidence.',
        'Spans can overlap; wallMs is the end-to-end compile measurement.',
        'Viewer paint and application queue/debounce are measured by the integrator.',
      ],
    }
  } finally {
    compiler.dispose()
    CompileWorkerDriver.prototype.run = run
    WasmTexWorker.prototype.writeFile = writeFile
    globalThis.fetch = fetch
    active = false
  }
}
