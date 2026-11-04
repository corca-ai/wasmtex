import { describe, expect, it, vi } from 'vitest'
import { LUATEX_PREVIEW_OUTPUT_DIR, luatexPreviewHook, WasmTexLuatexEngine } from './luatex-engine'
import { jobInputExtensions, PREVIEW_JOB_SUFFIX } from './tex-fmt-engine'
import type { CompileWorkerDriver } from './wasmtex-worker'

type Run = Awaited<ReturnType<CompileWorkerDriver['run']>>

function engine(run: (main: string, files: Map<string, string | Uint8Array>) => Run) {
  const instance = new WasmTexLuatexEngine({ texliveVersion: '2026' })
  const files = new Map<string, string | Uint8Array>([
    ['wasmtex-luatex.fmt', new Uint8Array(70000)],
  ])
  let main = 'main.tex'
  const driver = Reflect.get(instance, 'tex') as CompileWorkerDriver
  const directories: string[] = []
  vi.spyOn(driver, 'mkdir').mockImplementation((path) => {
    directories.push(path)
  })
  vi.spyOn(driver, 'writeFile').mockImplementation(async (path, content) => {
    files.set(path, content)
  })
  vi.spyOn(driver, 'readFile').mockImplementation(async (path) => {
    const content = files.get(path)
    return typeof content === 'string' ? content : null
  })
  vi.spyOn(driver, 'setMainFile').mockImplementation((path) => {
    main = path
  })
  vi.spyOn(driver, 'run').mockImplementation(async () => run(main, files))
  Reflect.set(instance, 'fmtBytes', new Uint8Array(70000))
  return { instance, files, directories, main: () => main }
}

const output = (inputFiles: string[], log = ''): Run =>
  ({
    success: true,
    out: new Uint8Array([1]),
    log,
    inputFiles,
    inputFilesComplete: true,
  }) as Run

describe('LuaTeX page previews', () => {
  it('stops after the requested pages without shifting the author first line', () => {
    const hook = luatexPreviewHook(3)
    expect(hook).not.toContain('\n')
    expect(hook).toContain('shipout/after')
    expect(hook).toContain('>=3 then tex.finish()')
    expect(hook).toContain(
      `find_write_file",function(_,name) return "${LUATEX_PREVIEW_OUTPUT_DIR}/"`,
    )
  })

  it('selects job-named inputs the full pass read', () => {
    expect(
      jobInputExtensions(
        [
          'wasmtex-luatex.fmt',
          './main.tex',
          './main.aux',
          './main.toc',
          './main.out',
          './other.aux',
          './main.d/x',
          '/tex/article.cls',
        ],
        'main',
      ),
    ).toEqual(['aux', 'toc', 'out'])
    expect(jobInputExtensions(undefined, 'main')).toEqual([])
  })

  it('runs as a separate job seeded from the full pass and restores the main file', async () => {
    const { instance, files, directories, main } = engine((current) =>
      current === 'main.tex'
        ? output(['./main.tex', './main.aux', './main.toc'])
        : output([], '(\\end occurred inside a group at level 1)\n'),
    )
    await instance.writeFile('main.tex', '% !TEX program = lualatex\n\\documentclass{article}')
    instance.setMainFile('main.tex')
    await instance.compile()
    files.set('main.aux', '\\relax')
    files.set('main.toc', 'contents')

    const preview = await instance.compilePagePreview(2)

    const job = `main${PREVIEW_JOB_SUFFIX}`
    expect(files.get(`${job}.aux`)).toBe('\\relax')
    expect(files.get(`${job}.toc`)).toBe('contents')
    expect(files.get(`${job}.tex`)).toBe(
      `${luatexPreviewHook(2)}% !TEX program = lualatex\n\\documentclass{article}`,
    )
    expect(directories).toEqual([LUATEX_PREVIEW_OUTPUT_DIR])
    expect(main()).toBe('main.tex')
    expect(preview?.success).toBe(true)
    expect(preview?.log).not.toContain('occurred inside a group')
    expect(files.get('main.aux')).toBe('\\relax')
  })

  it('reports errors in the author source under the real main file', async () => {
    const { instance } = engine((current) =>
      output(
        ['./main.tex'],
        current === 'main.tex' ? '' : `(./${current}\n! Undefined control sequence.\nl.3 \\foo\n)`,
      ),
    )
    await instance.writeFile('main.tex', '\\documentclass{article}')
    instance.setMainFile('main.tex')
    await instance.compile()

    const preview = await instance.compilePagePreview(1)

    expect(preview?.errors).toEqual([
      expect.objectContaining({
        message: 'Undefined control sequence.',
        file: 'main.tex',
        line: 3,
      }),
    ])
  })

  it('maps a chapter preview onto the full PDF and refuses one that disagrees', async () => {
    const entry = '\\@writefile{toc}{\\contentsline {chapter}{\\numberline {2}Two}{5}{chapter.2}}'
    const full =
      '(./main.tex [1] [2] (./chapters/ch1.tex [3] [4]) (./chapters/ch2.tex [5] [6]))\nOutput written on main.pdf (6 pages).'
    let previewLog = '(./main-wasmtex-preview.tex (./chapters/ch2.tex [5] [6]))'
    const { instance, files } = engine((current, fs) => {
      if (current !== 'main.tex') fs.set(`${LUATEX_PREVIEW_OUTPUT_DIR}/chapters__ch2.aux`, entry)
      return output(['./main.tex', './main.aux'], current === 'main.tex' ? full : previewLog)
    })
    files.set('chapters/ch2.aux', entry)
    await instance.writeFile('main.tex', '\\documentclass{book}')
    instance.setMainFile('main.tex')
    await instance.compile()

    expect((await instance.compilePagePreview(10, { chapter: 'chapters/ch2' }))?.firstPage).toBe(5)
    expect(files.get(`main${PREVIEW_JOB_SUFFIX}.tex`)).toBe(
      `${luatexPreviewHook(10, { name: 'chapters/ch2', cap: 6 })}\\documentclass{book}`,
    )
    // A chapter starting after the page limit is never typeset alone.
    expect(await instance.compilePagePreview(4, { chapter: 'chapters/ch2' })).toBeNull()
    // A discarded blank page before the heading shifts the placement by one.
    previewLog = '(./main-wasmtex-preview.tex (./chapters/ch2.tex [6]))'
    expect((await instance.compilePagePreview(10, { chapter: 'chapters/ch2' }))?.firstPage).toBe(6)
    // A first page the full pass does not have there refuses the chapter until the next pass.
    previewLog = '(./main-wasmtex-preview.tex (./chapters/ch2.tex [9] [10]))'
    expect(await instance.compilePagePreview(10, { chapter: 'chapters/ch2' })).toBeNull()
    previewLog = '(./main-wasmtex-preview.tex (./chapters/ch2.tex [5] [6]))'
    expect(await instance.compilePagePreview(10, { chapter: 'chapters/ch2' })).toBeNull()
    expect((await instance.compilePagePreview(2))?.firstPage).toBe(1)
    await instance.compile()
    expect((await instance.compilePagePreview(10, { chapter: 'chapters/ch2' }))?.firstPage).toBe(5)
  })

  it('refuses a chapter preview whose contents entry differs, and pages from stateful packages', async () => {
    const full =
      '(./main.tex [1] (./ch1.tex [2]) (./ch2.tex [3]))\nOutput written on main.pdf (3 pages).'
    let inputs = ['./main.tex', './main.aux']
    const { instance, files } = engine((current, fs) => {
      if (current !== 'main.tex')
        fs.set(
          `${LUATEX_PREVIEW_OUTPUT_DIR}/ch2.aux`,
          '\\@writefile{toc}{\\contentsline {chapter}{\\numberline {A}Two}{3}{}}',
        )
      return output(inputs, current === 'main.tex' ? full : '(./ch2.tex [3])')
    })
    files.set('ch2.aux', '\\@writefile{toc}{\\contentsline {chapter}{\\numberline {2}Two}{3}{}}')
    await instance.writeFile('main.tex', 'Body')
    instance.setMainFile('main.tex')
    await instance.compile()
    expect(await instance.compilePagePreview(5, { chapter: 'ch2' })).toBeNull()

    inputs = ['./main.tex', '/tex/biblatex.sty', './main.aux']
    await instance.compile()
    expect(await instance.compilePagePreview(5, { chapter: 'ch2' })).toBeNull()
    expect(files.has(`main${PREVIEW_JOB_SUFFIX}.tex`)).toBe(true)
  })

  it('runs a cold preview from the format before any full pass, copying nothing', async () => {
    const { instance, files } = engine(() => output(['./main.tex']))
    await instance.writeFile('main.tex', '\\documentclass{article}')
    instance.setMainFile('main.tex')
    expect((await instance.compilePagePreview(2, { cold: true }))?.success).toBe(true)
    expect(files.get(`main${PREVIEW_JOB_SUFFIX}.tex`)).toBe(
      `${luatexPreviewHook(2)}\\documentclass{article}`,
    )
    // Only the preview job's own aux exists, emptied so an earlier cold run cannot leak in.
    expect([...files.keys()].filter((path) => path.endsWith('.aux'))).toEqual([
      `main${PREVIEW_JOB_SUFFIX}.aux`,
    ])
    expect(files.get(`main${PREVIEW_JOB_SUFFIX}.aux`)).toBe('')
  })

  it('offers no preview from a worker that has not finished a full pass', async () => {
    const { instance, files } = engine(() => output(['./main.tex']))
    await instance.writeFile('main.tex', '\\documentclass{article}')
    instance.setMainFile('main.tex')
    expect(await instance.compilePagePreview(2)).toBeNull()
    expect(files.has(`main${PREVIEW_JOB_SUFFIX}.tex`)).toBe(false)
  })

  it('keeps nested main files beside their job and restores them after a failure', async () => {
    const { instance, files, main } = engine((current) => {
      if (current.endsWith(`${PREVIEW_JOB_SUFFIX}.tex`)) throw new Error('worker lost')
      return output(['./paper.tex'])
    })
    await instance.writeFile('chapter/paper.tex', 'Body')
    instance.setMainFile('chapter/paper.tex')
    await instance.compile()
    await expect(instance.compilePagePreview(1)).rejects.toThrow('worker lost')
    expect(files.has(`chapter/paper${PREVIEW_JOB_SUFFIX}.tex`)).toBe(true)
    expect(main()).toBe('chapter/paper.tex')
  })
})

describe('LuaTeX heap checkpoints', () => {
  function heapEngine(supported: boolean, preview = true) {
    const instance = new WasmTexLuatexEngine({
      texliveVersion: '2026',
      luatexHeapCheckpoints: true,
    })
    const driver = Reflect.get(instance, 'tex') as CompileWorkerDriver
    vi.spyOn(driver, 'writeFile').mockResolvedValue()
    vi.spyOn(driver, 'supportsHeapCheckpoints', 'get').mockReturnValue(supported)
    vi.spyOn(driver, 'supportsPagePreview', 'get').mockReturnValue(preview)
    const run = vi.spyOn(driver, 'run').mockResolvedValue({
      ...output(['./main.tex']),
      log: 'Output written.\n(\\end occurred inside a group at level 1)',
      message: {
        heapCheckpoints: [
          {
            id: 'p',
            line: 9,
            bytes: 8192,
            ms: 2,
            inputs: ['/work/main.tex'],
            inputsComplete: true,
          },
        ],
        heapCheckpointRefusals: [
          { id: 'q', reason: 'stack' },
          { id: 'r', reason: 'other' },
        ],
      },
    } as Run)
    Reflect.set(instance, 'fmtBytes', new Uint8Array(70000))
    return { instance, driver, run }
  }

  it('selects the checkpoint build only for LuaTeX workers that ask for it', () => {
    const { driver } = heapEngine(true)
    expect(Reflect.get(driver, 'enginePath')).toMatch(
      /wasmtex-luatex\.worker\.js\?engine=checkpoint$/,
    )
    const plain = Reflect.get(new WasmTexLuatexEngine({ texliveVersion: '2026' }), 'tex')
    expect(Reflect.get(plain, 'enginePath')).toMatch(/wasmtex-luatex\.worker\.js$/)
  })

  it('arms, resumes and previews with the budget and reports the worker records', async () => {
    const { instance, run } = heapEngine(true)
    instance.setCheckpointBudget(1, 200 * 1024 * 1024)
    const budget = { maxCount: 1, maxBytes: 200 * 1024 * 1024 }
    const armed = await instance.compile({ checkpoints: [{ id: 'p', line: 9 }] })
    expect(run).toHaveBeenLastCalledWith('compilelatex', {
      checkpoints: [{ id: 'p', line: 9 }],
      checkpointBudget: budget,
    })
    expect(armed.heapCheckpoints?.map((record) => record.id)).toEqual(['p'])
    expect(armed.heapCheckpointRefusals).toEqual([{ id: 'q', reason: 'stack' }])
    await instance.compileFromHeapCheckpoint('p')
    expect(run).toHaveBeenLastCalledWith('compileheapcheckpoint', {
      id: 'p',
      checkpointBudget: budget,
    })
    const preview = await instance.compileHeapPreview(4, 'p')
    expect(run).toHaveBeenLastCalledWith('compilepagepreview', { pageLimit: 4, id: 'p' })
    expect(preview?.log).toBe('Output written.')
  })

  it('refuses checkpoint commands on the plain build', async () => {
    const { instance, run } = heapEngine(false)
    await expect(instance.compileFromHeapCheckpoint('p')).rejects.toThrow(/not supported/)
    expect(await instance.compileHeapPreview(4, 'p')).toBeNull()
    expect(run).not.toHaveBeenCalled()
    const noLimit = heapEngine(true, false)
    expect(await noLimit.instance.compileHeapPreview(4, 'p')).toBeNull()
  })
})
