import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CompileEngine } from './engine/compile-engine'
import * as factory from './engine/compile-engine'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

const pass: CompileResult = {
  success: true,
  pdf: Uint8Array.of(1),
  synctex: null,
  log: '',
  errors: [],
  compileTime: 1,
}
function setup() {
  let finish!: (result: CompileResult) => void
  const settling = new Promise<CompileResult>((resolve) => {
    finish = resolve
  })
  const engine: CompileEngine = {
    init: async () => {},
    compile: vi
      .fn()
      .mockResolvedValueOnce({
        ...pass,
        log: 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.',
      })
      .mockReturnValue(settling),
    writeFile: async () => {},
    mkdir: async () => {},
    setMainFile() {},
    readFile: async () => null,
    flushCache: async () => {},
    clearCache: async () => {},
    terminate() {},
    getStatus: () => 'ready',
  }
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({
    files: { 'main.tex': String.raw`\documentclass{article}\begin{document}Text\end{document}` },
  })
  return { compiler, engine, finish }
}
afterEach(() => vi.restoreAllMocks())

describe('provisional first-pass PDF', () => {
  it('shows independent bytes before settling without adding a compile or committing metadata', async () => {
    const { compiler, engine, finish } = setup()
    await compiler.init()
    const callback = vi.fn((frame) => {
      frame.pdf[0] = 9
    })
    const compiling = compiler.compile({ onProgressPdf: callback })
    await vi.waitFor(() => expect(engine.compile).toHaveBeenCalledTimes(2))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(pass.pdf![0]).toBe(1)
    expect(compiler.getProjectIndex().resolveLabel('new')).toBeUndefined()
    finish({ ...pass, pdf: Uint8Array.of(2) })
    expect((await compiling).pdf).toEqual(Uint8Array.of(2))
    expect(engine.compile).toHaveBeenCalledTimes(2)
    compiler.dispose()
  })

  it('keeps observer exceptions out of canonical results', async () => {
    const { compiler, finish } = setup()
    await compiler.init()
    finish(pass)
    await expect(
      compiler.compile({
        onProgressPdf: () => {
          throw Error('display failed')
        },
      }),
    ).resolves.toMatchObject({ success: true })
    compiler.dispose()
  })

  it.each([
    'edit',
    'dispose',
  ] as const)('stops settling when the observer causes %s', async (action) => {
    const { compiler, engine } = setup()
    await compiler.init()
    const compiling = compiler.compile({
      onProgressPdf: () => {
        if (action === 'edit') compiler.setFile('main.tex', 'new source')
        else compiler.dispose()
      },
    })
    await expect(compiling).rejects.toMatchObject({ name: 'AbortError' })
    expect(engine.compile).toHaveBeenCalledTimes(1)
    compiler.dispose()
  })

  it('does not publish a failed pass or retained PDF as progress', async () => {
    const { compiler, engine } = setup()
    vi.mocked(engine.compile)
      .mockReset()
      .mockResolvedValue({ ...pass, success: false, pdf: null })
    await compiler.init()
    const callback = vi.fn()
    await compiler.compile({ onProgressPdf: callback })
    expect(callback).not.toHaveBeenCalled()
    compiler.dispose()
  })
})
