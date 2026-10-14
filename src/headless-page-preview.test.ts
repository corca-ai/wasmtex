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
