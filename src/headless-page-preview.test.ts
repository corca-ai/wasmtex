import { afterEach, expect, it, vi } from 'vitest'
import * as factory from './engine/compile-engine'
import { WasmTexLuatexEngine } from './engine/luatex-engine'
import type { ChapterPreviewResult } from './engine/tex-fmt-engine'
import { WasmTexPdftexEngine } from './engine/wasmtex-engine'
import { WasmTexXetexEngine } from './engine/xetex-engine'
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
  expect(compiler.supportsPagePreviewSessions()).toBe(true)
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

async function formatEngineFixture(
  preview: (
    pageLimit: number,
    options?: { chapter?: string; cold?: boolean },
  ) => Promise<ChapterPreviewResult | null>,
  kind: 'lualatex' | 'xelatex' = 'lualatex',
  files: Record<string, string> = {
    'main.tex': source,
    'chapter.tex': 'Chapter.',
    'macros.tex': '\\def\\x{}',
  },
) {
  const engine =
    kind === 'lualatex'
      ? new WasmTexLuatexEngine({ texliveVersion: '2026' })
      : new WasmTexXetexEngine({ texliveVersion: '2026' })
  vi.spyOn(engine, 'init').mockResolvedValue()
  vi.spyOn(engine, 'writeFile').mockResolvedValue()
  vi.spyOn(engine, 'mkdir').mockResolvedValue()
  vi.spyOn(engine, 'readFile').mockResolvedValue(null)
  vi.spyOn(engine, 'setMainFile').mockImplementation(() => {})
  vi.spyOn(engine, 'compile').mockResolvedValue(result)
  vi.spyOn(engine, 'readsInPreamble').mockImplementation((path) => path === 'macros.tex')
  const pages = vi.spyOn(engine, 'compilePagePreview').mockImplementation(preview)
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({ engine: kind, files })
  await compiler.init()
  return { compiler, pages, engine }
}

it.each([
  'lualatex',
  'xelatex',
] as const)('previews %s source edits as a stopped prefix after a full baseline', async (kind) => {
  const { compiler, pages } = await formatEngineFixture(async () => result, kind)
  expect(await compiler.previewPages(2)).toBeNull()
  await compiler.compile()
  compiler.setFile('main.tex', source.replace('A paragraph.', 'Edited paragraph.'))
  expect(await compiler.previewPages(2)).toEqual({
    pdf: result.pdf,
    synctex: null,
    compileTime: 12,
    pageLimit: 2,
  })
  expect(pages.mock.calls).toEqual([[2]])
  // Every prefix starts from the format, so an existing chapter needs no unread proof.
  compiler.setFile('chapter.tex', 'Edited chapter.')
  expect(await compiler.previewPages(3)).not.toBeNull()
  expect(pages.mock.calls).toEqual([[2], [3]])
  compiler.setFile('new.tex', 'A new file.')
  expect(await compiler.previewPages(2)).toBeNull()
  expect(pages).toHaveBeenCalledTimes(2)
  expect(compiler.supportsPagePreviewSessions()).toBe(false)
  compiler.dispose()
})

const book = (main = '', first = 'chapters/ch1') =>
  `\\documentclass{book}${main}\n\\begin{document}\n\\include{${first}}\n\\include{chapters/ch2}\n\\end{document}`

it.each([
  { main: '', ch1: 'One.', edits: ['chapters/ch2.tex'], chapter: 'chapters/ch2' },
  {
    main: '\\includeonly{chapters/ch2}',
    ch1: 'One.',
    edits: ['chapters/ch2.tex'],
    chapter: undefined,
  },
  { main: '% \\includeonly{x}', ch1: 'One.', edits: ['chapters/ch2.tex'], chapter: 'chapters/ch2' },
  { main: '', ch1: '\\appendix One.', edits: ['chapters/ch2.tex'], chapter: undefined },
  { main: '', ch1: '\\newcommand{\\x}{y} One.', edits: ['chapters/ch2.tex'], chapter: undefined },
  { main: '', ch1: 'One.', edits: ['chapters/ch2.tex', 'notes.tex'], chapter: undefined },
  { main: '', ch1: 'One.', edits: ['notes.tex'], chapter: undefined },
])('previews one edited \\include chapter alone: $main $ch1 $edits', async ({
  main,
  ch1,
  edits,
  chapter,
}) => {
  const { compiler, pages } = await formatEngineFixture(
    async (_limit, options) => ({ ...result, firstPage: options?.chapter ? 7 : 1 }),
    'lualatex',
    {
      'main.tex': book(main),
      'chapters/ch1.tex': ch1,
      'chapters/ch2.tex': 'Two.',
      'notes.tex': 'N.',
    },
  )
  await compiler.compile()
  for (const path of edits) compiler.setFile(path, 'Edited.')
  const preview = await compiler.previewPages(8, { placement: true })
  expect(pages.mock.calls).toEqual([[8, ...(chapter ? [{ chapter }] : [])]])
  expect(preview?.firstPage).toBe(chapter ? 7 : 1)
  compiler.dispose()
})

it('keeps prefixes for hosts that do not ask for placement, and for unnormalized names', async () => {
  for (const [main, placement] of [
    [book(), false],
    [book('', './chapters/ch1'), true],
  ] as const) {
    const { compiler, pages } = await formatEngineFixture(async () => result, 'xelatex', {
      'main.tex': main,
      'chapters/ch1.tex': 'One.',
      'chapters/ch2.tex': 'Two.',
    })
    await compiler.compile()
    compiler.setFile('chapters/ch2.tex', 'Edited.')
    const preview = await compiler.previewPages(8, { placement })
    expect(pages.mock.calls).toEqual([[8]])
    expect(preview?.firstPage).toBe(placement ? 1 : undefined)
    compiler.dispose()
    vi.restoreAllMocks()
  }
})

it('refuses a chapter that fails alone and falls back to a prefix', async () => {
  const { compiler, pages, engine } = await formatEngineFixture(
    async (_limit, options) =>
      options?.chapter ? { ...result, success: false, pdf: null } : result,
    'xelatex',
    { 'main.tex': book(), 'chapters/ch1.tex': 'One.', 'chapters/ch2.tex': 'Two.' },
  )
  const refuse = vi.spyOn(engine, 'refuseChapter')
  await compiler.compile()
  compiler.setFile('chapters/ch2.tex', 'Edited.')
  expect(await compiler.previewPages(8, { placement: true })).toMatchObject({ firstPage: 1 })
  expect(pages.mock.calls).toEqual([[8, { chapter: 'chapters/ch2' }], [8]])
  expect(refuse).toHaveBeenCalledWith('chapters/ch2')
  compiler.dispose()
})

it('keeps a chapter that was not placeable at this page limit', async () => {
  const { compiler, pages, engine } = await formatEngineFixture(
    async (limit, options) => (options?.chapter && limit < 20 ? null : result),
    'lualatex',
    { 'main.tex': book(), 'chapters/ch1.tex': 'One.', 'chapters/ch2.tex': 'Two.' },
  )
  const refuse = vi.spyOn(engine, 'refuseChapter')
  await compiler.compile()
  compiler.setFile('chapters/ch2.tex', 'Edited.')
  await compiler.previewPages(8, { placement: true })
  await compiler.previewPages(20, { placement: true })
  expect(pages.mock.calls).toEqual([
    [8, { chapter: 'chapters/ch2' }],
    [8],
    [20, { chapter: 'chapters/ch2' }],
  ])
  expect(refuse).not.toHaveBeenCalled()
  compiler.dispose()
})

it.each([
  'lualatex',
  'xelatex',
] as const)('shows the first pages of a cold %s document before its first full compile', async (kind) => {
  const { compiler, pages } = await formatEngineFixture(async () => result, kind)
  expect(await compiler.previewPages(2)).toBeNull()
  expect(await compiler.previewColdPages(2)).toMatchObject({ pdf: result.pdf, pageLimit: 2 })
  expect(pages.mock.calls).toEqual([[2, { cold: true }]])
  await compiler.compile()
  expect(await compiler.previewColdPages(2)).toBeNull()
  expect(pages).toHaveBeenCalledOnce()
  compiler.dispose()
})

it('offers no cold preview with an error', async () => {
  const { compiler } = await formatEngineFixture(async () => ({
    ...result,
    errors: [{ line: 1, message: 'Undefined control sequence.', severity: 'error' }],
  }))
  expect(await compiler.previewColdPages(2)).toBeNull()
  compiler.dispose()
})

it('runs a pdfTeX cold preview without a preamble format, and none after a compile', async () => {
  const { compiler, engine, pages } = await fixture()
  const snapshot = vi.mocked(engine.setPreambleSnapshot)
  expect(await compiler.previewColdPages(2)).not.toBeNull()
  expect(pages.mock.calls).toEqual([[2]])
  expect(snapshot).toHaveBeenLastCalledWith(false)
  await compiler.compile()
  expect(await compiler.previewColdPages(2)).toBeNull()
  compiler.dispose()
})

it('forgets a finished full compile when the project or main file changes', async () => {
  const { compiler, pages } = await formatEngineFixture(async () => result, 'xelatex')
  await compiler.compile()
  expect(await compiler.previewColdPages(2)).toBeNull()
  compiler.setMainFile('chapter.tex')
  expect(await compiler.previewColdPages(2)).not.toBeNull()
  await compiler.compile()
  await compiler.loadProject({ 'main.tex': source })
  expect(await compiler.previewColdPages(2)).not.toBeNull()
  expect(pages).toHaveBeenCalledTimes(2)
  compiler.dispose()
})

it('requires a full compile after an edit to a file the preamble reads', async () => {
  const { compiler, pages } = await formatEngineFixture(async () => result, 'xelatex')
  await compiler.compile()
  compiler.setFile('macros.tex', '\\def\\x{y}')
  expect(await compiler.previewPages(2)).toBeNull()
  expect(pages).not.toHaveBeenCalled()
  compiler.dispose()
})

it('keeps a LuaLaTeX preview when the main file already had the same error', async () => {
  const engine = new WasmTexLuatexEngine({ texliveVersion: '2026' })
  const tex = Reflect.get(engine, 'tex') as {
    run: () => Promise<unknown>
    writeFile: () => Promise<void>
    readFile: () => Promise<string | null>
    mkdir: () => void
    setMainFile: (path: string) => void
  }
  let main = 'main.tex'
  const error = (file: string) =>
    `(./${file}\n! Undefined control sequence.\nl.3 \\undefinedmacro\n)`
  vi.spyOn(tex, 'writeFile').mockResolvedValue()
  vi.spyOn(tex, 'readFile').mockResolvedValue(null)
  vi.spyOn(tex, 'mkdir').mockImplementation(() => {})
  vi.spyOn(tex, 'setMainFile').mockImplementation((path) => {
    main = path
  })
  vi.spyOn(tex, 'run').mockImplementation(async () => ({
    success: true,
    out: new Uint8Array([1]),
    log: error(main),
    inputFiles: ['./main.tex', './main.aux'],
    inputFilesComplete: true,
  }))
  vi.spyOn(engine, 'init').mockResolvedValue()
  Reflect.set(engine, 'fmtBytes', new Uint8Array(70000))
  vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({ engine: 'lualatex', files: { 'main.tex': source } })
  await compiler.init()
  const full = await compiler.compile()
  expect(full.errors[0]?.file).toBe('main.tex')
  compiler.setFile('main.tex', source.replace('A paragraph.', 'Edited paragraph.'))
  expect(await compiler.previewPages(2)).not.toBeNull()
  compiler.dispose()
})

it('rejects a LuaTeX prefix that reports a new error', async () => {
  const { compiler } = await formatEngineFixture(async () => ({
    ...result,
    errors: [{ line: 3, message: 'Undefined control sequence.', severity: 'error' }],
  }))
  await compiler.compile()
  compiler.setFile('main.tex', source.replace('A paragraph.', '\\broken'))
  expect(await compiler.previewPages(2)).toBeNull()
  compiler.dispose()
})
