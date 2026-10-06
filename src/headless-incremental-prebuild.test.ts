import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'
import { IncrementalCompiler } from './engine/incremental'
import type { WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { WasmTexCompiler } from './headless'

type PrebuildForEdit = (
  source: string,
  files: Map<string, string>,
  path: string,
  offset: number,
) => Promise<boolean>

interface CompilerInternals {
  initialized: boolean
  engine: object | null
  incremental: Pick<
    IncrementalCompiler,
    'prebuildForEdit' | 'canFastServe' | 'tryIncremental' | 'noteFull' | 'reset'
  > | null
  fs: { markSynced(): void }
}

function readyCompiler(prebuildForEdit: PrebuildForEdit) {
  const compiler = new WasmTexCompiler({
    incremental: true,
    files: {
      'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{chapter}\n\\end{document}',
      'chapter.tex': 'chapter body',
    },
  })
  const internals = compiler as unknown as CompilerInternals
  internals.initialized = true
  internals.engine = {
    terminate: () => {},
    init: async () => {},
    mkdir: async () => {},
    writeFile: async () => {},
    setMainFile: () => {},
    readFile: async () => null,
    compile: async () => ({
      success: true,
      pdf: new Uint8Array([1]),
      log: '',
      errors: [],
      compileTime: 0,
      synctex: null,
    }),
  }
  internals.incremental = {
    prebuildForEdit,
    canFastServe: () => false,
    tryIncremental: async () => null,
    noteFull: () => {},
    reset: () => {},
  }
  internals.fs.markSynced()
  return compiler
}

describe('WasmTexCompiler.prepareIncrementalCompile', () => {
  it('forwards an included-file cursor to the shared checkpoint manager', async () => {
    const prebuildForEdit = vi.fn<PrebuildForEdit>(async () => true)
    const compiler = readyCompiler(prebuildForEdit)

    await expect(compiler.prepareIncrementalCompile('chapter.tex', 7)).resolves.toBe(true)
    expect(prebuildForEdit).toHaveBeenCalledOnce()
    expect(prebuildForEdit.mock.calls[0]?.[2]).toBe('chapter.tex')
    expect(prebuildForEdit.mock.calls[0]?.[3]).toBe(7)
  })

  it('does not build against unsynchronized project bytes', async () => {
    const prebuildForEdit = vi.fn<PrebuildForEdit>(async () => true)
    const compiler = readyCompiler(prebuildForEdit)
    compiler.setFile('chapter.tex', 'edited')

    await expect(compiler.prepareIncrementalCompile('chapter.tex', 3)).resolves.toBe(false)
    expect(prebuildForEdit).not.toHaveBeenCalled()
  })

  it('shares one in-flight preparation between callers', async () => {
    let resolve!: (value: boolean) => void
    const pending = new Promise<boolean>((done) => {
      resolve = done
    })
    const prebuildForEdit = vi.fn(() => pending)
    const compiler = readyCompiler(prebuildForEdit)

    const first = compiler.prepareIncrementalCompile()
    const second = compiler.prepareIncrementalCompile()
    resolve(true)

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(prebuildForEdit).toHaveBeenCalledOnce()
  })
})

function compileWaitingForPreparation() {
  let finish!: (ready: boolean) => void
  const compiler = readyCompiler(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const preparation = compiler.prepareIncrementalCompile()
  const compile = compiler.compile()
  return { compiler, preparation, compile, finish }
}

describe('compile ownership during checkpoint preparation', () => {
  it('reserves one compile while preparation finishes and rejects additional callers', async () => {
    const { compiler, preparation, compile, finish } = compileWaitingForPreparation()
    await expect(compiler.compile()).rejects.toThrow(/in progress/)
    await expect(compiler.prepareIncrementalCompile()).resolves.toBe(false)
    await expect(compiler.compile()).rejects.toThrow(/in progress/)
    finish(true)
    await expect(preparation).resolves.toBe(true)
    await expect(compile).resolves.toMatchObject({ success: true })
    compiler.dispose()
  })

  it.each([
    'edit',
    'dispose',
  ] as const)('aborts preparation and its waiting compile on %s', async (change) => {
    const { compiler, preparation, compile, finish } = compileWaitingForPreparation()
    const rejected = Promise.all(
      [preparation, compile].map((p) => expect(p).rejects.toMatchObject({ name: 'AbortError' })),
    )
    if (change === 'edit') compiler.setFile('chapter.tex', 'new chapter')
    else compiler.dispose()
    await rejected
    finish(true)
    if (change === 'edit') {
      expect(compiler.getFile('chapter.tex')).toBe('new chapter')
      await expect(compiler.prepareIncrementalCompile()).resolves.toBe(false)
    }
    compiler.dispose()
  })
})

describe('preview compile ownership', () => {
  it('returns the full result without changing the ordinary compile contract', async () => {
    const compiler = readyCompiler(async () => false)
    const ordinary = await compiler.compile()
    const preview = await compiler.compilePreview()
    expect(preview).toEqual(ordinary)
    expect(preview.pdf).toBeInstanceOf(Uint8Array)
    compiler.dispose()
  })

  it('shares the reservation with ordinary compiles', async () => {
    const { compiler, preparation, compile, finish } = compileWaitingForPreparation()
    await expect(compiler.compilePreview()).rejects.toThrow(/in progress/)
    finish(true)
    await preparation
    await compile
    compiler.dispose()
  })
})

it('public preview results survive edits and compiler disposal with exact diagnostics', async () => {
  const compiler = readyCompiler(async () => false)
  const internals = compiler as unknown as CompilerInternals
  const document = await PDFDocument.create()
  document.addPage([200, 200])
  const bytes = await document.save()
  const engine = Object.assign(internals.engine!, {
    buildCheckpoint: async () => ({ fmt: new Uint8Array([1]), headPdf: bytes }),
    compileFromCheckpoint: async () => ({
      pdf: bytes,
      status: 0,
      log: 'tail diagnostics',
      synctex: null,
    }),
  })
  const incremental = new IncrementalCompiler(engine as unknown as WasmTexPdftexEngine, {
    minHeadBytes: 0,
  })
  internals.incremental = incremental
  const original =
    '\\documentclass{article}\n\\begin{document}\nHead.\n\\clearpage\nOriginal.\n\\end{document}'
  incremental.noteFull(original)
  compiler.setFile('main.tex', original.replace('Original.', 'Edited.'))
  const result = await compiler.compilePreview()
  const parts = result.pdf
  if (!parts || parts instanceof Uint8Array) throw new Error('expected public parts result')
  expect(result.success).toBe(true)
  expect(result.log).toBe('tail diagnostics')
  expect(result.synctex).toBeNull()
  expect(result.telemetry?.dependencyManifest).toBeDefined()
  expect(compiler.getRetentionStats().checkpointCount).toBe(1)
  compiler.setFile('main.tex', 'another edit')
  compiler.dispose()
  expect(compiler.getRetentionStats().checkpointCount).toBe(0)
  expect((await PDFDocument.load(await parts.materialize())).getPageCount()).toBe(2)
})
