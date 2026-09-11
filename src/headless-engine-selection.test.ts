import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompileEngine } from './engine/compile-engine'
import * as factory from './engine/compile-engine'
import { type EngineDetection, WasmTexCompiler } from './headless'

function engineDouble(init = async () => {}) {
  return {
    init: vi.fn(init),
    compile: vi.fn(async () => ({
      success: false,
      pdf: null,
      log: '! Test engine stopped',
      errors: [],
      compileTime: 0,
      synctex: null,
    })),
    writeFile: async () => {},
    mkdir: async () => {},
    setMainFile: () => {},
    readFile: async () => null,
    flushCache: async () => {},
    clearCache: async () => {},
    terminate: vi.fn(),
    getStatus: () => 'ready' as const,
  } satisfies CompileEngine
}

afterEach(() => vi.restoreAllMocks())

describe('headless engine selection observation', () => {
  it.each([
    ['auto', '\\usepackage{fontspec}', 'xelatex'],
    ['auto', '\\directlua{print(1)}', 'lualatex'],
    ['auto', '% !TEX program = lualatex\n\\usepackage{fontspec}', 'lualatex'],
    ['auto', '\\documentclass{article}', 'pdflatex'],
    ['xelatex', '% !TEX program = lualatex', 'xelatex'],
  ] as const)('reports %s selection of %s before initialization', async (option, source, expected) => {
    const events: Readonly<EngineDetection>[] = []
    const engine = engineDouble(async () => {
      expect(events.map((e) => e.engine)).toEqual([expected])
    })
    vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
    const compiler = new WasmTexCompiler({
      engine: option,
      files: { 'main.tex': source },
      onEngineSelected: (e) => {
        events.push(e)
      },
    })
    expect(events).toEqual([])
    await compiler.init()
    await compiler.compile()
    await compiler.compile()
    expect(events).toHaveLength(1)
    expect(engine.init).toHaveBeenCalledOnce()
    compiler.dispose()
  })

  it('reports actual kind transitions, not body edits or changed detection reasons', async () => {
    const kinds: string[] = []
    const engines: ReturnType<typeof engineDouble>[] = []
    vi.spyOn(factory, 'createCompileEngine').mockImplementation(() => {
      const engine = engineDouble()
      engines.push(engine)
      return engine
    })
    const compiler = new WasmTexCompiler({
      files: { 'main.tex': '\\usepackage{fontspec}' },
      onEngineSelected: (e) => {
        kinds.push(e.engine)
      },
    })
    await compiler.init()
    for (const source of [
      '% !TEX program = xelatex',
      '\\directlua{print(1)}',
      '\\documentclass{article}',
      '\\usepackage{fontspec}',
    ]) {
      compiler.setFile('main.tex', source)
      await compiler.compile()
    }
    expect(kinds).toEqual(['xelatex', 'lualatex', 'pdflatex', 'xelatex'])
    expect(engines.slice(0, -1).every((e) => e.terminate.mock.calls.length === 1)).toBe(true)
    compiler.dispose()
  })

  it('does not await preparation or expose mutable internal detection', async () => {
    const engine = engineDouble()
    const create = vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
    const compiler = new WasmTexCompiler({
      files: { 'main.tex': '\\usepackage{fontspec}' },
      onEngineSelected: (e) => {
        Object.assign(e, { engine: 'pdflatex' })
        return new Promise<void>(() => {})
      },
    })
    await compiler.init()
    await compiler.compile()
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]?.[0]).toBe('xelatex')
    compiler.dispose()
  })

  it.each(['throw', 'reject'] as const)('isolates an observer that will %s', async (mode) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engineDouble())
    const compiler = new WasmTexCompiler({
      onEngineSelected: () => {
        if (mode === 'throw') throw new Error('observer')
        return Promise.reject(new Error('observer'))
      },
    })
    await compiler.init()
    await compiler.compile()
    expect(console.error).toHaveBeenCalledOnce()
    compiler.dispose()
  })

  it('reports selection even when a Unicode artifact is unavailable', async () => {
    const selected = vi.fn()
    vi.spyOn(factory, 'createCompileEngine').mockReturnValue(
      engineDouble(async () => {
        throw new Error('missing artifact')
      }),
    )
    const compiler = new WasmTexCompiler({ engine: 'xelatex', onEngineSelected: selected })
    await compiler.init()
    const result = await compiler.compile()
    expect(selected).toHaveBeenCalledOnce()
    expect(result.success).toBe(false)
    expect(result.log).toContain('engine is not available')
    compiler.dispose()
  })
})
