import { describe, expect, it, vi } from 'vitest'
import {
  LUATEX_PREVIEW_JOB_SUFFIX,
  LUATEX_PREVIEW_OUTPUT_DIR,
  luatexJobInputExtensions,
  luatexPreviewHook,
  WasmTexLuatexEngine,
} from './luatex-engine'
import type { CompileWorkerDriver } from './wasmtex-worker'

type Run = Awaited<ReturnType<CompileWorkerDriver['run']>>

function engine(run: (main: string) => Run) {
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
  vi.spyOn(driver, 'run').mockImplementation(async () => run(main))
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
      luatexJobInputExtensions(
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
    expect(luatexJobInputExtensions(undefined, 'main')).toEqual([])
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

    const job = `main${LUATEX_PREVIEW_JOB_SUFFIX}`
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

  it('keeps nested main files beside their job and restores them after a failure', async () => {
    const { instance, files, main } = engine((current) => {
      if (current.endsWith(`${LUATEX_PREVIEW_JOB_SUFFIX}.tex`)) throw new Error('worker lost')
      return output(['./paper.tex'])
    })
    await instance.writeFile('chapter/paper.tex', 'Body')
    instance.setMainFile('chapter/paper.tex')
    await expect(instance.compilePagePreview(1)).rejects.toThrow('worker lost')
    expect(files.has(`chapter/paper${LUATEX_PREVIEW_JOB_SUFFIX}.tex`)).toBe(true)
    expect(main()).toBe('chapter/paper.tex')
  })
})
