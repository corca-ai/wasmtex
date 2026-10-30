import { afterEach, expect, it, vi } from 'vitest'
import * as factory from './engine/compile-engine'
import { WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { WasmTexCompiler, type WasmTexCompilerOptions } from './headless'
import type { CompileResult } from './types'

const source = '\\documentclass{article}\n\\begin{document}\nA paragraph.\n\\end{document}'
const result: CompileResult = {
  success: true,
  pdf: new Uint8Array([1]),
  synctex: null,
  log: '',
  errors: [],
  compileTime: 12,
}

async function fixture(
  preview = async (): Promise<CompileResult | null> => result,
  options: WasmTexCompilerOptions = {},
) {
  const engine = new WasmTexPdftexEngine()
  vi.spyOn(engine, 'init').mockResolvedValue()
  vi.spyOn(engine, 'writeFile').mockResolvedValue()
  vi.spyOn(engine, 'mkdir').mockResolvedValue()
  vi.spyOn(engine, 'readFile').mockResolvedValue(null)
  vi.spyOn(engine, 'setMainFile').mockImplementation(() => {})
  vi.spyOn(engine, 'setPreambleSnapshot').mockImplementation(() => {})
  vi.spyOn(engine, 'compile').mockResolvedValue(result)
  const pages = vi.spyOn(engine, 'compilePagePreview').mockImplementation(preview)
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({ files: { 'main.tex': source }, ...options })
  await compiler.init()
  return { compiler, engine, pages }
}

afterEach(() => vi.restoreAllMocks())

it('requires a complete baseline and keeps page previews out of compile metadata', async () => {
  const { compiler, pages } = await fixture()
  expect(await compiler.previewPages(2)).toBeNull()
  await compiler.compile()
  compiler.setFile('main.tex', source.replace('A paragraph.', 'Edited paragraph.'))
  expect(await compiler.previewPages(2)).toEqual({
    pdf: result.pdf,
    synctex: null,
    compileTime: 12,
    pageLimit: 2,
  })
  expect(await compiler.previewPages(3)).not.toBeNull()
  expect(pages.mock.calls.map((call) => call[0])).toEqual([2, 3])
  compiler.dispose()
})

it.each([
  { complete: true, read: false, added: false, allowed: true },
  { complete: false, read: false, added: false, allowed: false },
  { complete: true, read: true, added: false, allowed: false },
  { complete: true, read: false, added: true, allowed: false },
])('admits secondary previews only with retained unread-input proof: %j', async ({
  complete,
  read,
  added,
  allowed,
}) => {
  const { compiler, engine, pages } = await fixture(undefined, {
    incremental: true,
    heapCheckpointOptions: { minHeadBytes: 0 },
    files: { 'main.tex': source, ...(added ? {} : { 'chapter.tex': 'body' }) },
  })
  vi.spyOn(engine, 'supportsHeapCheckpoints', 'get').mockReturnValue(true)
  vi.spyOn(engine, 'dropHeapCheckpoints').mockResolvedValue()
  vi.mocked(engine.compile).mockResolvedValue({
    ...result,
    heapCheckpoints: [
      {
        id: 'before-chapter',
        line: 3,
        bytes: 1000,
        ms: 1,
        inputs: ['/work/main.tex', ...(read ? ['/work/chapter.tex'] : [])],
        inputsComplete: complete,
      },
    ],
  })
  try {
    await compiler.compile()
    compiler.setFile('chapter.tex', 'edited body')
    expect(!!(await compiler.previewPages(2))).toBe(allowed)
    if (allowed) expect(pages).toHaveBeenCalledWith(2, 'before-chapter')
    else expect(pages).not.toHaveBeenCalled()
  } finally {
    compiler.dispose()
  }
})

it('rejects invalid limits and requires full compilation after structural invalidation', async () => {
  const { compiler, pages } = await fixture()
  for (const limit of [0, -1, 1.5, Number.NaN, 10001]) {
    await expect(compiler.previewPages(limit)).rejects.toThrow(RangeError)
  }
  await compiler.compile()
  compiler.setFile('main.tex', source.replace('article', 'report'))
  expect(await compiler.previewPages(2)).toBeNull()
  compiler.setFile('main.tex', source)
  compiler.setFile('chapter.tex', 'changed dependency')
  expect(await compiler.previewPages(2)).toBeNull()
  expect(pages).not.toHaveBeenCalled()
  compiler.dispose()
})

it.each([
  null,
  { ...result, success: false },
  { ...result, pdf: null },
  {
    ...result,
    errors: [{ severity: 'error' as const, line: 1, message: 'Broken input' }],
  },
])('falls back for unavailable or unsuccessful page previews', async (candidate) => {
  const { compiler } = await fixture(async () => candidate)
  await compiler.compile()
  expect(await compiler.previewPages(2)).toBeNull()
  compiler.dispose()
})

it('serializes previews and fences source mutation while one is in flight', async () => {
  let finish!: (value: CompileResult) => void
  const { compiler, pages } = await fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  await compiler.compile()
  const preview = compiler.previewPages(2)
  await vi.waitFor(() => expect(pages).toHaveBeenCalled())
  await expect(compiler.compile()).rejects.toThrow('already in progress')
  await expect(compiler.previewPages(2)).rejects.toThrow('already in progress')
  compiler.setFile('main.tex', source.replace('paragraph', 'revision'))
  finish(result)
  await expect(preview).rejects.toThrow()
  compiler.dispose()
})

async function forkFixture(chapter = 'body', local = false) {
  const f = await fixture(undefined, {
    incremental: true,
    heapCheckpointOptions: { minHeadBytes: 0 },
    files: { 'main.tex': source, 'chapter.tex': chapter },
  })
  vi.spyOn(f.engine, 'supportsHeapCheckpoints', 'get').mockReturnValue(true)
  vi.spyOn(f.engine, 'dropHeapCheckpoints').mockResolvedValue()
  vi.mocked(f.engine.compile).mockResolvedValue({
    ...result,
    heapCheckpoints: [
      {
        id: 'before-chapter',
        line: 3,
        bytes: 1000,
        ms: 1,
        inputs: ['/work/main.tex'],
        inputsComplete: true,
      },
      ...(local
        ? [
            {
              id: 'inside-chapter',
              path: 'chapter.tex',
              line: 3,
              bytes: 1000,
              ms: 1,
              inputs: ['/work/main.tex', '/work/chapter.tex'],
              inputsComplete: true,
              prefixSafe: true,
            },
          ]
        : []),
    ],
  })
  vi.spyOn(f.engine, 'compileFromHeapCheckpoint').mockResolvedValue(result)
  await f.compiler.compile()
  const fork = new WasmTexPdftexEngine()
  vi.spyOn(fork, 'supportsHeapCheckpoints', 'get').mockReturnValue(true)
  vi.spyOn(fork, 'writeFile').mockResolvedValue()
  vi.spyOn(fork, 'mkdir').mockResolvedValue()
  vi.spyOn(fork, 'setMainFile').mockImplementation(() => {})
  vi.spyOn(fork, 'dropHeapCheckpoints').mockResolvedValue()
  const preview = vi.spyOn(fork, 'compilePagePreview').mockResolvedValue(result)
  const terminate = vi.spyOn(fork, 'terminate').mockImplementation(() => {})
  const create = vi.spyOn(f.engine, 'forkForPagePreview').mockResolvedValue(fork)
  return { ...f, fork, preview, terminate, create }
}

it('a fork renders edited secondary inputs while its canonical owner is compiling', async () => {
  const { compiler, engine, fork, preview, create } = await forkFixture()
  const session = await compiler.createPagePreviewSession({ path: 'chapter.tex', offset: 0 })
  expect(session).not.toBeNull()
  expect(create).toHaveBeenCalledWith('before-chapter', undefined, 'before-chapter')
  expect('compile' in session!).toBe(false)
  let complete!: (value: CompileResult) => void
  vi.mocked(engine.compile).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  // Change the prefix to force a full canonical pass, independent of the fork.
  compiler.setFile('main.tex', source.replace('article', 'report'))
  const canonical = compiler.compile()
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  session!.setFile('chapter.tex', 'edited body')
  expect(await session!.previewPages(2)).toMatchObject({ pdf: result.pdf, pageLimit: 2 })
  expect(preview).toHaveBeenCalledWith(2, 'before-chapter')
  expect(fork.writeFile).toHaveBeenCalledWith('chapter.tex', 'edited body')
  expect(await compiler.createPagePreviewSession()).toBeNull()
  complete(result)
  await canonical
  session!.dispose()
  compiler.dispose()
})

it('retires a late fork after parent disposal and refuses dirty or unsupported baselines', async () => {
  const { compiler, create, fork, terminate } = await forkFixture()
  compiler.setFile('chapter.tex', 'dirty')
  expect(await compiler.createPagePreviewSession()).toBeNull()
  compiler.setFile('chapter.tex', 'body')
  await compiler.compile()
  create.mockResolvedValueOnce(null)
  expect(await compiler.createPagePreviewSession()).toBeNull()
  let finish!: (engine: WasmTexPdftexEngine) => void
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = compiler.createPagePreviewSession()
  compiler.dispose()
  finish(fork)
  expect(await pending).toBeNull()
  expect(terminate).toHaveBeenCalledTimes(1)
})

it('a project replacement fences a fork created from the preceding project', async () => {
  const { compiler, engine, create, fork, terminate } = await forkFixture()
  vi.spyOn(engine, 'flushCache').mockResolvedValue()
  let finish!: (engine: WasmTexPdftexEngine) => void
  create.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = compiler.createPagePreviewSession()
  await compiler.loadProject({ 'main.tex': source, 'other.tex': 'different project' })
  finish(fork)
  expect(await pending).toBeNull()
  expect(terminate).toHaveBeenCalledTimes(1)
  compiler.dispose()
})

it.each([
  false,
  true,
])('keeps earlier edit proof only when its state was admitted: %s', async (admitted) => {
  const chapter = 'First paragraph.\n\nSecond paragraph.\n'
  const { compiler, fork, preview, create } = await forkFixture(chapter, true)
  vi.spyOn(fork, 'pagePreviewFallbackId', 'get').mockReturnValue(
    admitted ? 'before-chapter' : undefined,
  )
  const session = await compiler.createPagePreviewSession({
    path: 'chapter.tex',
    offset: chapter.length,
  })
  expect(create).toHaveBeenCalledWith('inside-chapter', undefined, 'before-chapter')
  session!.setFile('chapter.tex', chapter.replace('Second', 'Edited'))
  expect(await session!.previewPages(2)).not.toBeNull()
  expect(preview).toHaveBeenLastCalledWith(2, 'inside-chapter')
  session!.setFile('chapter.tex', chapter.replace('First', 'Earlier'))
  expect(!!(await session!.previewPages(2))).toBe(admitted)
  if (admitted) expect(preview).toHaveBeenLastCalledWith(2, 'before-chapter')
  session!.setFile('main.tex', source.replace('article', 'report'))
  expect(await session!.previewPages(2)).toBeNull()
  session!.dispose()
  compiler.dispose()
})
