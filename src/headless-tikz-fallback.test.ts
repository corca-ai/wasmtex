import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompileEngine } from './engine/compile-engine'
import * as factory from './engine/compile-engine'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

const source = String.raw`\documentclass{article}
\usepackage{tikz}
\begin{document}
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0)--(2,1);\end{tikzpicture}
\begin{tikzpicture}\draw (0,0)--(3,1);\end{tikzpicture}
\end{document}`

function result(success: boolean): CompileResult {
  return {
    success,
    pdf: success ? new Uint8Array([1]) : null,
    log: success
      ? ''
      : '! Emergency stop.\n! ==> Fatal error occurred, no output PDF file produced!',
    errors: [],
    compileTime: 1,
    synctex: null,
  }
}

function setup(options: { source?: string; inlineSuccess?: boolean } = {}) {
  const writes = new Map<string, string | Uint8Array>()
  const engine = {
    init: async () => {},
    compile: vi.fn(async () => {
      const input = writes.get('main.tex')
      return result(
        typeof input === 'string' &&
          !input.includes('mode=list and make') &&
          options.inlineSuccess !== false,
      )
    }),
    writeFile: vi.fn(async (path: string, content: string | Uint8Array) => {
      writes.set(path, content)
    }),
    mkdir: async () => {},
    setMainFile: () => {},
    readFile: async (): Promise<string | null> => null,
    flushCache: async () => {},
    clearCache: async () => {},
    terminate: vi.fn(),
    getStatus: () => 'ready' as const,
  } satisfies CompileEngine
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({
    files: { 'main.tex': options.source ?? source },
    tikzExternalization: { mode: 'auto' },
  })
  return { compiler, engine, writes }
}

afterEach(() => vi.restoreAllMocks())

describe('auto TikZ first-pass fallback', () => {
  it('recovers an injected first-pass failure inline and stays inline on later edits', async () => {
    const { compiler, engine, writes } = setup()
    await compiler.init()
    expect(writes.get('main.tex')).toContain('mode=list and make')
    const compiled = await compiler.compile()
    expect(compiled).toMatchObject({
      success: true,
      telemetry: { tikzExternalization: { mode: 'auto', fallback: true } },
    })
    expect(compiled.pdf).not.toBeNull()
    expect(compiler.getFile('main.tex')).toBe(source)
    expect(writes.get('main.tex')).toBe(source)
    expect(engine.compile).toHaveBeenCalledTimes(2)
    compiler.setFile('main.tex', source.replace('(3,1)', '(4,1)'))
    expect(await compiler.compile()).toMatchObject({ success: true })
    expect(engine.compile).toHaveBeenCalledTimes(3)
    expect(writes.get('main.tex')).not.toContain('mode=list and make')
    compiler.dispose()
  })

  it('does not loop when the original source also fails', async () => {
    const { compiler, engine } = setup({ inlineSuccess: false })
    await compiler.init()
    expect(await compiler.compile()).toMatchObject({ success: false, pdf: null })
    expect(engine.compile).toHaveBeenCalledTimes(2)
    compiler.dispose()
  })

  it('preserves an author-requested externalization failure', async () => {
    const { compiler, engine } = setup({
      source: source.replace(
        '\\begin{document}',
        '\\usetikzlibrary{external}\\tikzexternalize\\begin{document}',
      ),
    })
    await compiler.init()
    expect(await compiler.compile()).toMatchObject({ success: false, pdf: null })
    expect(engine.compile).toHaveBeenCalledTimes(1)
    compiler.dispose()
  })

  it('does not retry engine exceptions', async () => {
    const { compiler, engine } = setup()
    engine.compile.mockRejectedValue(new Error('engine timed out'))
    await compiler.init()
    await expect(compiler.compile()).rejects.toThrow('engine timed out')
    expect(engine.compile).toHaveBeenCalledTimes(1)
    compiler.dispose()
  })

  it('does not retry a first-pass result cancelled by disposal', async () => {
    const { compiler, engine } = setup()
    engine.compile.mockImplementationOnce(async () => {
      compiler.dispose()
      return result(false)
    })
    await compiler.init()
    await expect(compiler.compile()).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.compile).toHaveBeenCalledTimes(1)
  })
})
