import { afterEach, expect, it, vi } from 'vitest'
import * as factory from './engine/compile-engine'
import { WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { WasmTexCompiler } from './headless'

afterEach(() => vi.restoreAllMocks())

it.each([
  -1,
  Infinity,
  NaN,
  1.5,
])('rejects invalid heap budgets before starting workers: %s', (value) => {
  expect(() => new WasmTexCompiler({ heapCheckpointOptions: { maxBytes: value } })).toThrow(
    RangeError,
  )
  expect(() => new WasmTexCompiler({ heapCheckpointOptions: { maxCheckpoints: value } })).toThrow(
    RangeError,
  )
})

it.each([
  [{ maxCheckpoints: 1, maxBytes: 3000 }, 1],
  [{ maxCheckpoints: 4, maxBytes: 1500 }, 1],
  [{ maxCheckpoints: 4, maxBytes: 500 }, 0],
] as const)('drops worker checkpoints according to the host budget %j', async (budget, retained) => {
  const engine = new WasmTexPdftexEngine()
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  vi.spyOn(engine, 'init').mockResolvedValue()
  vi.spyOn(engine, 'mkdir').mockResolvedValue()
  vi.spyOn(engine, 'writeFile').mockResolvedValue()
  vi.spyOn(engine, 'setMainFile').mockImplementation(() => {})
  vi.spyOn(engine, 'terminate').mockImplementation(() => {})
  vi.spyOn(engine, 'supportsHeapCheckpoints', 'get').mockReturnValue(true)
  const held = new Set<string>()
  vi.spyOn(engine, 'compile').mockImplementation(async (options) => {
    const records = (options?.checkpoints ?? []).map(({ id, line }) => {
      held.add(id)
      return { id, line, bytes: 1000, ms: 1, inputs: ['/work/main.tex'] }
    })
    return {
      success: true,
      pdf: new Uint8Array([1]),
      log: '',
      errors: [],
      compileTime: 1,
      synctex: null,
      heapCheckpoints: records,
    }
  })
  vi.spyOn(engine, 'dropHeapCheckpoints').mockImplementation(async (ids) => {
    if (!ids) held.clear()
    else for (const id of ids) held.delete(id)
  })
  const source =
    '\\documentclass{article}\n\\begin{document}\n' +
    Array.from({ length: 20 }, (_, i) => `Paragraph ${i}. ${'Body text. '.repeat(60)}`).join(
      '\n\n',
    ) +
    '\n\\end{document}'
  const compiler = new WasmTexCompiler({
    files: { 'main.tex': source },
    incremental: true,
    heapCheckpointOptions: budget,
  })
  try {
    await compiler.init()
    for (const paragraph of [16, 12, 8]) {
      await compiler.prepareIncrementalCompile(
        'main.tex',
        source.indexOf(`Paragraph ${paragraph}.`),
      )
    }
    expect(held.size).toBe(retained)
    expect(engine.dropHeapCheckpoints).toHaveBeenCalled()
  } finally {
    compiler.dispose()
  }
})
