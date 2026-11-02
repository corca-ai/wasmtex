import { describe, expect, it, vi } from 'vitest'
import { PREVIEW_JOB_SUFFIX } from './tex-fmt-engine'
import type { CompileWorkerDriver } from './wasmtex-worker'
import { WasmTexXetexEngine, xetexPreviewHook } from './xetex-engine'

type Run = Awaited<ReturnType<CompileWorkerDriver['run']>>

/** One XeTeX worker filesystem plus the dvipdfmx worker's conversions. */
function engine(xetex: (main: string, files: Map<string, string | Uint8Array>) => Run) {
  const instance = new WasmTexXetexEngine({ texliveVersion: '2026' })
  const files = new Map<string, string | Uint8Array>()
  let main = 'main.tex'
  const tex = Reflect.get(instance, 'tex') as CompileWorkerDriver
  vi.spyOn(tex, 'writeFile').mockImplementation(async (path, content) => {
    files.set(path, content)
  })
  vi.spyOn(tex, 'readFile').mockImplementation(async (path) => {
    const content = files.get(path)
    return typeof content === 'string' ? content : null
  })
  vi.spyOn(tex, 'setMainFile').mockImplementation((path) => {
    main = path
  })
  vi.spyOn(tex, 'run').mockImplementation(async () => xetex(main, files))
  const dvipdfm = Reflect.get(instance, 'dvipdfm') as CompileWorkerDriver
  const conversions: string[] = []
  vi.spyOn(dvipdfm, 'writeFile').mockResolvedValue()
  vi.spyOn(dvipdfm, 'setMainFile').mockImplementation((path) => {
    conversions.push(path)
  })
  vi.spyOn(dvipdfm, 'run').mockResolvedValue({
    success: true,
    out: new Uint8Array([2]),
    log: '',
  } as Run)
  Reflect.set(instance, 'fmtBytes', new Uint8Array(70000))
  return { instance, files, conversions, main: () => main }
}

const output = (inputFiles: string[], log = ''): Run =>
  ({ success: true, out: new Uint8Array([1]), log, inputFiles, inputFilesComplete: true }) as Run

describe('XeTeX page previews', () => {
  it('runs as a separate job seeded from the full pass and converts only its pages', async () => {
    const job = `main${PREVIEW_JOB_SUFFIX}`
    let staleOutput: unknown
    const { instance, files, conversions, main } = engine((current, fs) => {
      if (current === 'main.tex')
        return output(['./main.tex', './main.aux', './main.toc', './ch1.aux'])
      staleOutput = fs.get(`${job}.xdv`)
      // The stop leaves an included chapter's aux file partly written.
      fs.set('ch1.aux', '\\relax')
      return output(['./main.tex'], `(./${current}\n! Undefined control sequence.\nl.4 \\foo\n)`)
    })
    files.set('main.aux', '\\newlabel{x}{{1}{1}}')
    files.set('main.toc', 'contents')
    files.set('ch1.aux', '\\newlabel{y}{{2}{2}}')
    files.set(`${job}.xdv`, new Uint8Array([9]))
    await instance.writeFile('main.tex', '\\documentclass{article}')
    instance.setMainFile('main.tex')
    await instance.compile()

    const preview = await instance.compilePagePreview(2)

    expect(staleOutput).toEqual(new Uint8Array())
    expect(files.get(`${job}.aux`)).toBe('\\newlabel{x}{{1}{1}}')
    expect(files.get(`${job}.toc`)).toBe('contents')
    expect(files.get(`${job}.tex`)).toBe(`${xetexPreviewHook(2)}\\documentclass{article}`)
    expect(files.get('ch1.aux')).toBe('\\newlabel{y}{{2}{2}}')
    expect(files.get('main.aux')).toBe('\\newlabel{x}{{1}{1}}')
    expect(conversions).toEqual(['main.xdv', `${job}.xdv`])
    expect(main()).toBe('main.tex')
    expect(preview?.success).toBe(true)
    expect(preview?.errors).toEqual([
      expect.objectContaining({
        message: 'Undefined control sequence.',
        file: 'main.tex',
        line: 4,
      }),
    ])
  })

  it('converts only an included chapter, places it, and restores its aux file', async () => {
    const entry = '\\@writefile{toc}{\\contentsline {chapter}{\\numberline {2}Two}{3}{}}'
    const { instance, files, conversions } = engine((current, fs) => {
      if (current === 'main.tex')
        return output(
          ['./main.tex', './main.aux', './ch2.aux'],
          '(./main.tex [1] (./ch1.tex [2]) (./ch2.tex [3] [4]))\nOutput written on main.xdv (4 pages).',
        )
      fs.set('ch2.aux', entry)
      return output([], `(./${current} (./ch2.tex [3] [4]))`)
    })
    files.set('ch2.aux', `${entry}\n\\@setckpt{ch2}{}`)
    await instance.writeFile('main.tex', 'Body')
    instance.setMainFile('main.tex')
    await instance.compile()
    const preview = await instance.compilePagePreview(10, { chapter: 'ch2' })
    expect(preview?.firstPage).toBe(3)
    expect(conversions.at(-1)).toBe(`main${PREVIEW_JOB_SUFFIX}.xdv`)
    expect(files.get(`main${PREVIEW_JOB_SUFFIX}.tex`)).toBe(
      `${xetexPreviewHook(10, { name: 'ch2', cap: 8 })}Body`,
    )
    expect(files.get('ch2.aux')).toBe(`${entry}\n\\@setckpt{ch2}{}`)
    expect(xetexPreviewHook(10, { name: 'ch2', cap: 8 })).toContain('\\batchmode\\read16 to')
  })

  it('names a nested main file job by its basename and maps its errors back', async () => {
    const job = `paper${PREVIEW_JOB_SUFFIX}`
    const { instance, files, conversions } = engine((current) =>
      current === 'chapter/paper.tex'
        ? output(['./chapter/paper.tex', './paper.aux'])
        : output([], `(./${current}\n! Undefined control sequence.\nl.2 \\foo\n)`),
    )
    files.set('paper.aux', '\\relax')
    await instance.writeFile('chapter/paper.tex', 'Body')
    instance.setMainFile('chapter/paper.tex')
    await instance.compile()
    const preview = await instance.compilePagePreview(1)
    expect(files.get(`chapter/${job}.tex`)).toBe(`${xetexPreviewHook(1)}Body`)
    expect(files.get(`${job}.aux`)).toBe('\\relax')
    expect(conversions.at(-1)).toBe(`${job}.xdv`)
    expect(preview?.errors[0]?.file).toBe('chapter/paper.tex')
  })

  it('restores chapter aux files and the main file when the worker fails', async () => {
    const { instance, files, main } = engine((current, fs) => {
      if (current === 'main.tex') return output(['./main.tex', './main.aux', './ch1.aux'])
      fs.set('ch1.aux', 'partial')
      throw new Error('worker lost')
    })
    files.set('ch1.aux', 'complete')
    await instance.writeFile('main.tex', 'Body')
    instance.setMainFile('main.tex')
    await instance.compile()
    await expect(instance.compilePagePreview(1)).rejects.toThrow('worker lost')
    expect(files.get('ch1.aux')).toBe('complete')
    expect(main()).toBe('main.tex')
  })

  it('reports failed shipping or conversion, and offers nothing before a full pass', async () => {
    const failing = engine((current) =>
      current === 'main.tex'
        ? output(['./main.tex'])
        : ({ success: false, out: null, log: 'fatal', inputFiles: [] } as unknown as Run),
    )
    await failing.instance.writeFile('main.tex', 'Body')
    failing.instance.setMainFile('main.tex')
    expect(await failing.instance.compilePagePreview(1)).toBeNull()
    await failing.instance.compile()
    expect((await failing.instance.compilePagePreview(1))?.pdf).toBeNull()

    const unconverted = engine(() => output(['./main.tex']))
    await unconverted.instance.writeFile('main.tex', 'Body')
    unconverted.instance.setMainFile('main.tex')
    await unconverted.instance.compile()
    const dvipdfm = Reflect.get(unconverted.instance, 'dvipdfm') as CompileWorkerDriver
    vi.spyOn(dvipdfm, 'run').mockResolvedValue({
      success: false,
      out: null,
      log: 'dvipdfmx failed',
    } as unknown as Run)
    const preview = await unconverted.instance.compilePagePreview(1)
    expect(preview?.success).toBe(false)
    expect(preview?.pdf).toBeNull()
  })
})
