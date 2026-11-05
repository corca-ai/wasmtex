import { afterEach, expect, it, vi } from 'vitest'
import type { AssetDownloadSession } from './engine/asset-download'
import * as factory from './engine/compile-engine'
import { WasmTexLuatexEngine } from './engine/luatex-engine'
import { WasmTexCompiler, type WasmTexCompilerOptions } from './headless'
import type { CompileResult, HeapCheckpointArm } from './types'

const paragraphs = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} has some text.`)
const source = (edit = '') =>
  `\\documentclass{article}\n\\begin{document}\n${paragraphs
    .map((text, i) => (i === 9 ? `${text}${edit}` : text))
    .join('\n\n')}\n\\end{document}\n`
const result = (extra: Partial<CompileResult> = {}): CompileResult => ({
  success: true,
  pdf: new Uint8Array([1]),
  synctex: null,
  log: '',
  errors: [],
  compileTime: 12,
  inputFiles: ['./main.tex', './main.aux'],
  inputFilesComplete: true,
  ...extra,
})

async function fixture(options: WasmTexCompilerOptions, supported = true) {
  const engine = new WasmTexLuatexEngine({ texliveVersion: '2026' })
  for (const method of ['init', 'writeFile', 'mkdir', 'dropHeapCheckpoints'] as const)
    vi.spyOn(engine, method).mockResolvedValue()
  vi.spyOn(engine, 'readFile').mockResolvedValue(null)
  vi.spyOn(engine, 'setMainFile').mockReturnValue()
  vi.spyOn(engine, 'readsInPreamble').mockReturnValue(false)
  for (const getter of [
    'supportsHeapCheckpoints',
    'supportsLineCheckpoints',
    'supportsFileCheckpoints',
    'supportsResumeRecorder',
  ] as const)
    vi.spyOn(engine, getter, 'get').mockReturnValue(supported)
  const compile = vi
    .spyOn(engine, 'compile')
    .mockImplementation(async (opts?: { checkpoints?: HeapCheckpointArm[] }) =>
      result({
        heapCheckpoints: (opts?.checkpoints ?? []).map((arm) => ({
          ...arm,
          bytes: 1024,
          ms: 1,
          inputs: ['/work/main.tex'],
          inputsComplete: true,
        })),
      }),
    )
  const resume = vi.spyOn(engine, 'compileFromHeapCheckpoint').mockResolvedValue(result())
  const heapPreview = vi.spyOn(engine, 'compileHeapPreview').mockResolvedValue(result())
  const prefix = vi.spyOn(engine, 'compilePagePreview').mockResolvedValue(result())
  const create = vi.spyOn(factory, 'createCompileEngine').mockReturnValue(engine)
  const compiler = new WasmTexCompiler({
    engine: 'lualatex',
    files: { 'main.tex': source() },
    ...options,
  })
  await compiler.init()
  return { compiler, compile, resume, heapPreview, prefix, create }
}

afterEach(() => vi.restoreAllMocks())

/** A compiler whose second full compile armed a checkpoint before paragraph 10. */
async function edited(options: WasmTexCompilerOptions = {}, supported = true) {
  const parts = await fixture(
    { luatexHeapCheckpoints: { maxCheckpoints: 1, minHeadBytes: 0 }, ...options },
    supported,
  )
  await parts.compiler.compile()
  parts.compiler.setFile('main.tex', source(' One.'))
  await parts.compiler.compile()
  return parts
}

it('loads the LuaLaTeX checkpoint build only when the host asks for it', async () => {
  const plain = await fixture({ incremental: true })
  expect(plain.create.mock.calls[0]?.[1]).toMatchObject({ luatexHeapCheckpoints: false })
  expect(Reflect.get(plain.compiler, 'heap')).toBeNull()
  plain.compiler.dispose()
  vi.restoreAllMocks()

  const lua = await fixture({ luatexHeapCheckpoints: { maxCheckpoints: 1, minHeadBytes: 0 } })
  expect(lua.create.mock.calls[0]?.[1]).toMatchObject({ luatexHeapCheckpoints: true })
  expect(Reflect.get(lua.compiler, 'heap')).not.toBeNull()
  expect(lua.compiler.supportsPagePreviewSessions()).toBe(false)
  lua.compiler.dispose()
})

it('resumes canonical compiles and previews from the checkpoint before an edit', async () => {
  const { compiler, compile, resume, heapPreview, prefix } = await edited()
  const armed = compile.mock.calls.at(-1)?.[0]?.checkpoints
  expect(armed?.length).toBeGreaterThan(0)

  compiler.setFile('main.tex', source(' One. Two.'))
  expect(await compiler.previewPages(2)).not.toBeNull()
  expect(heapPreview).toHaveBeenCalledWith(2, armed?.[0]?.id)
  expect(prefix).not.toHaveBeenCalled()

  await compiler.compile()
  expect(resume).toHaveBeenCalledWith(armed?.[0]?.id, expect.anything())
  compiler.dispose()
})

it('falls back to the prefix job when the checkpoint preview fails', async () => {
  const { compiler, heapPreview, prefix } = await edited()
  heapPreview.mockResolvedValueOnce(result({ success: false, pdf: null }))
  compiler.setFile('main.tex', source(' One. Two.'))
  expect(await compiler.previewPages(2)).not.toBeNull()
  expect(heapPreview).toHaveBeenCalledTimes(1)
  expect(prefix).toHaveBeenCalledWith(2)
  compiler.dispose()
})

it('keeps prefix previews when the worker loaded the plain build', async () => {
  const { compiler, compile, heapPreview, prefix } = await edited({}, false)
  expect(compile.mock.calls.every((call) => !call[0]?.checkpoints)).toBe(true)
  compiler.setFile('main.tex', source(' One. Two.'))
  expect(await compiler.previewPages(2)).not.toBeNull()
  expect(heapPreview).not.toHaveBeenCalled()
  expect(prefix).toHaveBeenCalledWith(2)
  compiler.dispose()
})

it('validates the LuaLaTeX budget and keeps helper compilers on the plain build', () => {
  expect(() => new WasmTexCompiler({ luatexHeapCheckpoints: { maxBytes: -1 } })).toThrow(RangeError)
  const compiler = new WasmTexCompiler({
    engine: 'lualatex',
    luatexHeapCheckpoints: { maxCheckpoints: 1 },
  })
  for (const spawn of ['spawnExportCompiler', 'spawnFigureCompiler']) {
    const helper = (Reflect.get(compiler, spawn) as () => WasmTexCompiler).call(compiler)
    expect(Reflect.get(helper, 'opts').luatexHeapCheckpoints, spawn).toBeUndefined()
    helper.dispose()
  }
  compiler.dispose()
})

it('keeps chapter and prefix previews for a secondary-source edit', async () => {
  const { compiler } = await edited({ files: { 'main.tex': source(), 'chapter.tex': 'Chapter.' } })
  // A retained checkpoint covers the chapter (never read before it), but a format
  // engine still previews the chapter edit itself.
  compiler.setFile('chapter.tex', 'Edited chapter.')
  expect(Reflect.get(compiler, 'pagePreviewRequiresCheckpoint')).toBe(false)
  expect([...(Reflect.get(compiler, 'previewEdits') as Set<string>)]).toEqual(['chapter.tex'])
  expect(await compiler.previewPages(2)).not.toBeNull()
  compiler.dispose()
})

it('stops resuming previews from a checkpoint the worker no longer holds', async () => {
  const { compiler, heapPreview, prefix } = await edited()
  heapPreview.mockResolvedValueOnce(
    result({ success: false, pdf: null, log: 'no such heap checkpoint' }),
  )
  for (const edit of [' One. Two.', ' One. Two. Three.']) {
    compiler.setFile('main.tex', source(edit))
    expect(await compiler.previewPages(2)).not.toBeNull()
  }
  expect(heapPreview).toHaveBeenCalledTimes(1)
  expect(prefix).toHaveBeenCalledTimes(2)
  compiler.dispose()
})

it('shares the owning attempt with repeated automatic figure compiles', async () => {
  const { compiler } = await fixture({})
  const session = Reflect.get(compiler, 'assetDownloads') as AssetDownloadSession
  session.reserveRetries().settle(0)
  const figure = (Reflect.get(compiler, 'spawnFigureCompiler') as () => WasmTexCompiler).call(
    compiler,
  )
  figure.setFile('main.tex', source())
  try {
    await figure.init()
    expect(Reflect.get(figure, 'assetDownloads')).toBe(session)
    await figure.compile()
    await figure.compile()
    expect(session.reserveRetries().limit).toBe(0)
  } finally {
    figure.dispose()
    compiler.dispose()
  }
})
