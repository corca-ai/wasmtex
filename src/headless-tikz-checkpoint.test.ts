import { afterEach, describe, expect, it, vi } from 'vitest'
import * as factory from './engine/compile-engine'
import { HeapCheckpointCompiler } from './engine/heap-checkpoints'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

const source = String.raw`\documentclass{article}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0)--(2,1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0)--(3,1);\end{tikzpicture}
\end{document}`
const result = (resumed = false): CompileResult => ({
  success: true,
  synctex: null,
  pdf: new Uint8Array([resumed ? 1 : 2]),
  log: '',
  errors: [],
  compileTime: 1,
  ...(resumed
    ? {
        phaseTimings: {
          workerTotalMs: 1,
          heapRestoreMs: 0,
          heapSnapshotMs: 0,
          heapSnapshotBytes: 0,
          heapSizeBytes: 0,
          preambleBuildMs: 0,
          formatInstallMs: 0,
          preambleExportMs: 0,
          postProcessMs: 0,
          texRunMs: 1,
          checkpointResume: true,
        },
      }
    : {}),
})
function engine() {
  return {
    supportsHeapCheckpoints: true,
    init: async () => {},
    mkdir: async () => {},
    writeFile: async () => {},
    setMainFile: () => {},
    readFile: async () => null,
    flushCache: async () => {},
    clearCache: async () => {},
    terminate: vi.fn(),
    getStatus: () => 'ready' as const,
    compile: vi.fn(async () => result()),
    compileFromHeapCheckpoint: vi.fn(async () => result(true)),
    dropHeapCheckpoints: async () => {},
  }
}
afterEach(() => vi.restoreAllMocks())

describe('TikZ discovery checkpoint admission', () => {
  it.each([
    { input: 'main.aux', owned: false, changed: false, resumed: true },
    { input: 'texmf.cnf', owned: false, changed: false, resumed: true },
    { input: 'pdflatex.fmt', owned: false, changed: false, resumed: true },
    { input: 'pdflatex.fmt', owned: true, changed: false, resumed: false },
    { input: 'chapter.tex', owned: true, changed: false, resumed: true },
    { input: 'chapter.tex', owned: true, changed: true, resumed: false },
    { input: '.chapter.tex', owned: true, changed: false, resumed: false },
    { input: '.hidden/chapter.tex', owned: true, changed: false, resumed: false },
    { input: 'figure.pdf', owned: false, changed: false, resumed: false },
    { input: 'figure.dpth', owned: false, changed: false, resumed: false },
    { input: 'local.sty', owned: true, changed: false, resumed: false },
    { input: '__figure.pdf', owned: false, changed: false, resumed: false },
    { input: '__chapter.tex', owned: true, changed: true, resumed: false },
    { input: 'unknown', owned: false, changed: false, resumed: false },
  ])('validates prefix input $input (owned=$owned, changed=$changed)', async (sample) => {
    const e = engine()
    vi.spyOn(factory, 'createCompileEngine').mockReturnValue(e)
    const files: Record<string, string> = { 'main.tex': source }
    if (sample.owned) files[sample.input] = 'original'
    const compiler = new WasmTexCompiler({ files, tikzExternalization: { mode: 'auto' } })
    await compiler.init()
    const heap = new HeapCheckpointCompiler(e, { minHeadBytes: 0 })
    heap.noteFull(source, new Map(Object.entries(files)), {
      ...result(),
      heapCheckpoints: [
        {
          id: 'before-figures',
          line: 4,
          bytes: 1024,
          ms: 1,
          inputs: sample.input === 'unknown' ? [] : ['/work/main.tex', `/work/${sample.input}`],
        },
      ],
    })
    const internals = compiler as unknown as { heap: HeapCheckpointCompiler }
    internals.heap = heap
    if (sample.changed) compiler.setFile(sample.input, 'changed')
    compiler.setFile('main.tex', source.replace('(1,1)', '(1.1,1)'))
    try {
      const compiled = await compiler.compile()
      expect(e.compileFromHeapCheckpoint).toHaveBeenCalledTimes(sample.resumed ? 1 : 0)
      // Missing figure inventory must never publish a resumed disposable pass.
      expect(compiled.pdf).toEqual(new Uint8Array([2]))
      expect(compiled.phaseTimings?.checkpointResume).not.toBe(true)
    } finally {
      compiler.dispose()
    }
  })

  it.each([
    false,
    true,
  ])('drops unrecorded preamble inputs regardless of batched main writes (%s)', async (temporarilyDisabled) => {
    const e = engine()
    vi.spyOn(factory, 'createCompileEngine').mockReturnValue(e)
    const files = { 'main.tex': source, 'config.tex': 'original' }
    const compiler = new WasmTexCompiler({ files, tikzExternalization: { mode: 'auto' } })
    await compiler.init()
    const heap = new HeapCheckpointCompiler(e, { minHeadBytes: 0 })
    heap.noteFull(source, new Map(Object.entries(files)), {
      ...result(),
      heapCheckpoints: [{ id: 'prefix', line: 4, bytes: 1024, ms: 1, inputs: ['/work/main.tex'] }],
    })
    ;(compiler as unknown as { heap: HeapCheckpointCompiler }).heap = heap
    if (temporarilyDisabled) compiler.setFile('main.tex', 'plain temporary document')
    compiler.setFile('config.tex', 'changed')
    compiler.setFile('main.tex', source.replace('(1,1)', '(1.1,1)'))
    try {
      await compiler.compile()
      expect(e.compileFromHeapCheckpoint).not.toHaveBeenCalled()
    } finally {
      compiler.dispose()
    }
  })

  it('retires the figure pool when auto selection changes engines', async () => {
    const engines = [engine(), engine()] as const
    vi.spyOn(factory, 'createCompileEngine')
      .mockReturnValueOnce(engines[0])
      .mockReturnValueOnce(engines[1])
    const compiler = new WasmTexCompiler({
      files: { 'main.tex': source },
      tikzExternalization: { mode: 'auto', idleMs: 5000 },
    })
    await compiler.init()
    const pool = { dispose: vi.fn() }
    const internals = compiler as unknown as { tikzPool: typeof pool | null }
    internals.tikzPool = pool
    compiler.setFile('main.tex', `% !TEX program = xelatex\n${source}`)
    try {
      expect((await compiler.compile()).success).toBe(true)
      expect(pool.dispose).toHaveBeenCalledOnce()
      expect(internals.tikzPool).toBeNull()
      expect(engines[0].terminate).toHaveBeenCalledOnce()
    } finally {
      compiler.dispose()
    }
  })
})
