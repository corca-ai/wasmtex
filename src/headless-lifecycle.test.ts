import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendRegistry, BIBTEX_STAGE } from './engine/backend-registry'
import { BibtexEngine } from './engine/bibtex-engine'
import type { CompileEngine } from './engine/compile-engine'
import * as factory from './engine/compile-engine'
import { CompilerOperations } from './engine/compiler-operation'
import { MakeindexEngine } from './engine/makeindex-engine'
import { WasmTexCompiler, type WasmTexCompilerOptions } from './headless'
import type { CompileResult } from './types'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
const result: CompileResult = {
  success: true,
  pdf: new Uint8Array([1]),
  log: '',
  errors: [],
  compileTime: 0,
  synctex: null,
}

function setup(options: Partial<WasmTexCompilerOptions> = {}) {
  const started = deferred<void>()
  const output = deferred<CompileResult>()
  const writes = new Map<string, string | Uint8Array>()
  const engine = {
    init: vi.fn(async () => {}),
    compile: vi.fn(() => {
      started.resolve()
      return output.promise
    }),
    writeFile: async (path: string, content: string | Uint8Array) => {
      writes.set(path, content)
    },
    mkdir: async () => {},
    setMainFile: () => {},
    readFile: async (): Promise<string | null> => null,
    flushCache: async () => {
      writes.clear()
    },
    clearCache: async () => {},
    terminate: vi.fn(),
    getStatus: () => 'ready' as const,
  } satisfies CompileEngine
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({ files: { 'main.tex': 'original' }, ...options })
  return { compiler, engine, started, output, writes }
}

afterEach(() => vi.restoreAllMocks())

describe('headless operation ownership', () => {
  it('rejects overlapping compile calls without releasing the first owner', async () => {
    const { compiler, engine, started, output } = setup()
    await compiler.init()
    const first = compiler.compile()
    await started.promise
    await expect(compiler.compile()).rejects.toThrow(/busy|in progress/i)
    await expect(compiler.compile()).rejects.toThrow(/busy|in progress/i)
    output.resolve({ ...result })
    await expect(first).resolves.toMatchObject({ success: true })
    expect(engine.compile).toHaveBeenCalledTimes(1)
    compiler.dispose()
  })

  it.each([
    'file',
    'root',
    'dispose',
  ] as const)('aborts an obsolete result after %s changes', async (change) => {
    const { compiler, engine, started, output } = setup()
    await compiler.init()
    const pending = compiler.compile()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    if (change === 'file') compiler.setFile('main.tex', 'edited')
    else if (change === 'root') compiler.setMainFile('other.tex')
    else compiler.dispose()
    output.resolve({ ...result })
    await rejected
    expect(engine.terminate).toHaveBeenCalled()
    expect(compiler.getCompletionSnapshotState().status).not.toBe('fresh')
    if (change === 'file') expect(compiler.getFile('main.tex')).toBe('edited')
    compiler.dispose()
  })

  it('replaces a project only after retiring the previous run', async () => {
    const { compiler, started, output, writes } = setup()
    await compiler.init()
    const pending = compiler.compile()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await started.promise
    const replacing = compiler.loadProject({ 'main.tex': 'replacement' })
    output.resolve({ ...result })
    await replacing
    await rejected
    await compiler.compile()
    expect(writes.get('main.tex')).toBe('replacement')
    compiler.dispose()
  })

  it('does not publish aux data when cancelled as the aux collection finishes', async () => {
    const { compiler, engine, output } = setup()
    const aux = String.raw`\newlabel{old}{{1}{2}}`
    engine.readFile = async () => aux
    await compiler.init()
    const observe = CompilerOperations.prototype.observe
    vi.spyOn(CompilerOperations.prototype, 'observe').mockImplementation(async function <T>(
      this: CompilerOperations,
      promise: PromiseLike<T> | T,
    ) {
      const observed = await observe.call(this, promise)
      return {
        resume() {
          const value = observed.resume() as T
          if (value === aux) queueMicrotask(() => compiler.setFile('main.tex', 'edited'))
          return value
        },
      }
    })
    output.resolve({ ...result })
    await expect(compiler.compile()).rejects.toMatchObject({ name: 'AbortError' })
    expect(compiler.getFile('main.tex')).toBe('edited')
    expect(compiler.getProjectIndex().resolveLabel('old')).toBeUndefined()
    compiler.dispose()
  })

  it('rejects late metadata without attaching it to an edited document', async () => {
    const { compiler, engine, output } = setup()
    const reading = deferred<void>()
    const aux = deferred<string | null>()
    engine.readFile = async () => {
      reading.resolve()
      return aux.promise
    }
    await compiler.init()
    output.resolve({ ...result })
    const pending = compiler.compile()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await reading.promise
    compiler.setFile('main.tex', 'edited')
    aux.resolve('\\newlabel{old}{{1}{1}}')
    await rejected
    expect(compiler.getFile('main.tex')).toBe('edited')
    expect(compiler.getCompletionSnapshotState().status).not.toBe('fresh')
    compiler.dispose()
  })
})

describe('headless operation recovery', () => {
  it('coalesces init and aborts disposal without waiting for engine initialization', async () => {
    const { compiler, engine } = setup()
    const boot = deferred<void>()
    engine.init.mockImplementation(() => boot.promise)
    const first = compiler.init()
    const second = compiler.init()
    const rejected = Promise.all(
      [first, second].map((p) => expect(p).rejects.toMatchObject({ name: 'AbortError' })),
    )
    compiler.dispose()
    await rejected
    expect(engine.init).toHaveBeenCalledTimes(1)
    boot.resolve()
    await expect(compiler.compile()).rejects.toThrow(/not initialized/)
    engine.init.mockResolvedValue()
    await compiler.init()
    compiler.dispose()
  })

  it('honors synchronous disposal from engine selection observers', async () => {
    let compiler!: WasmTexCompiler
    ;({ compiler } = setup({ onEngineSelected: () => compiler.dispose() }))
    await expect(compiler.init()).rejects.toMatchObject({ name: 'AbortError' })
    await expect(compiler.compile()).rejects.toThrow(/not initialized/)
  })

  it('keeps the active run when the main file is reasserted unchanged', async () => {
    const { compiler, started, output } = setup()
    await compiler.init()
    const pending = compiler.compile()
    await started.promise
    compiler.setMainFile('main.tex')
    output.resolve({ ...result })
    await expect(pending).resolves.toMatchObject({ success: true })
    compiler.dispose()
  })

  it('rejects cache and output operations while a compile owns the worker', async () => {
    const { compiler, started, output } = setup()
    await compiler.init()
    const pending = compiler.compile()
    await started.promise
    for (const call of [
      () => compiler.readOutput('main.aux'),
      () => compiler.flushCache(),
      () => compiler.clearCache(),
    ]) {
      await expect(call()).rejects.toThrow(/in progress/)
    }
    output.resolve({ ...result })
    await pending
    compiler.dispose()
  })

  it('prevents writes and another load while a project replacement is pending', async () => {
    const { compiler } = setup()
    await compiler.init()
    const replacement = compiler.loadProject({ 'new.tex': 'new' })
    expect(() => compiler.setFile('stray.tex', 'stray')).toThrow(/replacement in progress/)
    expect(() => compiler.setMainFile('stray.tex')).toThrow(/replacement in progress/)
    await expect(compiler.compile()).rejects.toThrow(/replacement in progress/)
    await expect(compiler.loadProject({})).rejects.toThrow(/replacement in progress/)
    await replacement
    expect(compiler.listFiles()).toEqual(['new.tex'])
    compiler.dispose()
  })

  it('does not resurrect a project replacement disposed before it can start', async () => {
    const { compiler } = setup()
    await compiler.init()
    const pending = compiler.loadProject({ 'main.tex': 'new' })
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    compiler.dispose()
    await rejected
    expect(compiler.getFile('main.tex')).toBe('original')
  })

  it('ignores a late remote bibliography response after project replacement', async () => {
    const backendStarted = deferred<void>()
    const bbl = deferred<string>()
    const backends = new BackendRegistry()
    backends.register(BIBTEX_STAGE, {
      id: 'deferred-bibtex',
      stage: BIBTEX_STAGE,
      location: 'server',
      run: () => {
        backendStarted.resolve()
        return bbl.promise
      },
    })
    const { compiler, engine, output, writes } = setup({ backends })
    compiler.setFile('refs.bib', '@book{old,title={Old}}')
    engine.readFile = async () => '\\citation{old}\n\\bibdata{refs}\n\\bibstyle{plain}'
    await compiler.init()
    output.resolve({ ...result })
    const pending = compiler.compile()
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await backendStarted.promise
    await compiler.loadProject({ 'main.tex': 'new' })
    await rejected
    bbl.resolve('old bibliography')
    await compiler.compile()
    expect(compiler.getFile('main.bbl')).toBeNull()
    expect(writes.has('main.bbl')).toBe(false)
    expect(compiler.getFile('main.tex')).toBe('new')
    compiler.dispose()
  })
})

it.each([
  'bibtex',
  'makeindex',
] as const)('retries a failed %s initialization on the next compile', async (kind) => {
  const { compiler, engine, output } = setup()
  const prototype = kind === 'bibtex' ? BibtexEngine.prototype : MakeindexEngine.prototype
  const init = vi
    .spyOn(prototype, 'init')
    .mockRejectedValueOnce(new Error('bootstrap failed'))
    .mockResolvedValue()
  vi.spyOn(prototype, 'writeFile').mockResolvedValue()
  vi.spyOn(prototype, 'compile').mockResolvedValue({ success: true, log: '' })
  vi.spyOn(prototype, 'readFile').mockResolvedValue('generated output')
  const terminate = vi.spyOn(prototype, 'terminate')
  if (kind === 'bibtex') {
    compiler.setFile('refs.bib', '@book{old,title={Old}}')
    engine.readFile = async () => '\\citation{old}\n\\bibdata{refs}\n\\bibstyle{plain}'
  } else {
    compiler.setFile('main.tex', '\\makeindex\n\\begin{document}\\printindex\\end{document}')
    engine.readFile = async () => '\\indexentry{term}{1}'
  }
  await compiler.init()
  output.resolve({ ...result })
  await expect(compiler.compile()).rejects.toThrow('bootstrap failed')
  await expect(compiler.compile()).resolves.toMatchObject({ success: true })
  expect(init).toHaveBeenCalledTimes(2)
  expect(terminate).toHaveBeenCalledTimes(1)
  expect(compiler.getFile(kind === 'bibtex' ? 'main.bbl' : 'main.ind')).toBe('generated output')
  compiler.dispose()
})
