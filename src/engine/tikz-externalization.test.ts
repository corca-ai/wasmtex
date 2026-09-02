import { describe, expect, it } from 'vitest'
import {
  countPictures,
  defaultFigureWorkers,
  detectAutoBlocker,
  detectTikzExternalization,
  documentExternalizationMode,
  documentExternalizes,
  type FigureCompiler,
  figureJobSource,
  findBeginDocument,
  loadsTikz,
  mainJobSource,
  parseFigureList,
  parseFigureMd5,
  TikzFigurePool,
} from './tikz-externalization'

const DOC = [
  '\\documentclass{article}',
  '\\usepackage{tikz}',
  '\\usetikzlibrary{external}\\tikzexternalize',
  '\\begin{document}',
  '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}',
  '\\end{document}',
  '',
].join('\n')

describe('detection', () => {
  it('finds the uncommented \\begin{document}', () => {
    expect(findBeginDocument('% \\begin{document}\n\\begin{document}')).toBe(19)
    expect(findBeginDocument('\\documentclass{article}')).toBe(-1)
  })

  it('honours a document that calls \\tikzexternalize outside comments', () => {
    expect(documentExternalizes(DOC)).toBe(true)
    expect(documentExternalizes(DOC.replace('\\tikzexternalize', '% \\tikzexternalize'))).toBe(
      false,
    )
    // Only the preamble counts: \tikzexternalize in the body is not the library's contract.
    expect(
      documentExternalizes(
        DOC.replace('\\tikzexternalize\n', '\n').replace(
          '\\end{document}',
          '\\tikzexternalize\\end{document}',
        ),
      ),
    ).toBe(false)
  })

  it('recognises tikz/pgfplots loads for auto mode', () => {
    expect(loadsTikz('\\usepackage{tikz}')).toBe(true)
    expect(loadsTikz('\\usepackage[compat=1.18]{pgfplots}')).toBe(true)
    expect(loadsTikz('\\usepackage{amsmath,tikz}')).toBe(true)
    expect(loadsTikz('\\usepackage{tikzducks-not}')).toBe(false)
    expect(loadsTikz('% \\usepackage{tikz}')).toBe(false)
  })

  it('lets a magic comment in the main file override the host mode', () => {
    const plain = DOC.replace('\\usetikzlibrary{external}\\tikzexternalize', '')
    expect(
      detectTikzExternalization(`% !WASMTEX tikz-externalization = off\n${DOC}`, 'auto'),
    ).toBeNull()
    expect(
      detectTikzExternalization(`% !WASMTEX tikz-externalization: auto\n${plain}`, 'off'),
    ).toBe('inject')
    expect(
      detectTikzExternalization(`%!WASMTEX tikz-externalisation=document\n${plain}`, 'auto'),
    ).toBeNull()
    expect(documentExternalizationMode('% !TEX program = pdflatex')).toBeNull()
  })

  it('maps mode to kind', () => {
    const plain = DOC.replace('\\usetikzlibrary{external}\\tikzexternalize', '')
    expect(detectTikzExternalization(DOC, 'document')).toBe('document')
    expect(detectTikzExternalization(DOC, 'auto')).toBe('document')
    expect(detectTikzExternalization(DOC, 'off')).toBeNull()
    expect(detectTikzExternalization(plain, 'document')).toBeNull()
    expect(detectTikzExternalization(plain, 'auto')).toBe('inject')
    expect(
      detectTikzExternalization('\\documentclass{article}\\usepackage{tikz}', 'auto'),
    ).toBeNull()
  })
})

describe('source rewriting', () => {
  it('switches the main job to list and make without moving a line', () => {
    const main = mainJobSource(DOC, 'document')
    expect(main.split('\n').length).toBe(DOC.split('\n').length)
    expect(main).toContain('\\begin{document}\\tikzset{external/mode=list and make}\n')
    expect(main.indexOf('\\begin{document}')).toBe(DOC.indexOf('\\begin{document}'))
  })

  it('activates the library at the end of the preamble for inject', () => {
    const plain = DOC.replace('\\usetikzlibrary{external}\\tikzexternalize', '')
    const main = mainJobSource(plain, 'inject')
    expect(main.split('\n').length).toBe(plain.split('\n').length)
    expect(main).toContain(
      '\\usetikzlibrary{external}\\tikzexternalize[mode=list and make]\\begin{document}',
    )
  })

  it('builds a figure job that pins the real job, fakes \\jobname and selects the picture', () => {
    const fig = figureJobSource(DOC, 'document', '_preamble', '_preamble-figure3')
    expect(fig.split('\n').length).toBe(DOC.split('\n').length)
    expect(
      fig.startsWith(
        '\\def\\tikzexternalrealjob{_preamble}\\def\\jobname{wasmtex-figure}\\documentclass',
      ),
    ).toBe(true)
    expect(fig).toContain('\\begin{document}\\def\\pgfactualjobname{_preamble-figure3}')
    // The mode switch lives in the shared preamble-independent body, so the sibling
    // compiler's preamble is the same for every figure (its snapshot is reused).
    const other = figureJobSource(DOC, 'document', '_preamble', '_preamble-figure4')
    expect(fig.slice(0, fig.indexOf('\\begin{document}'))).toBe(
      other.slice(0, other.indexOf('\\begin{document}')),
    )
  })
})

describe('library file parsing', () => {
  it('parses a figlist in order, deduplicated', () => {
    expect(parseFigureList('main-figure0\nmain-figure1\n\nmain-figure0\nfigures/plot 1\n')).toEqual(
      ['main-figure0', 'main-figure1'],
    )
    expect(parseFigureList(null)).toEqual([])
  })

  it('parses the md5 key', () => {
    expect(parseFigureMd5('\\tikzexternallastkey{ 0B3F9 }%\n')).toBe('0B3F9')
    expect(parseFigureMd5('')).toBeNull()
    expect(parseFigureMd5(null)).toBeNull()
  })

  it('sizes the pool below the core count and to one on small devices', () => {
    expect(defaultFigureWorkers(undefined)).toBe(1)
    expect(defaultFigureWorkers(2)).toBe(1)
    expect(defaultFigureWorkers(4)).toBe(3)
    expect(defaultFigureWorkers(16)).toBe(3)
    expect(defaultFigureWorkers(16, 4)).toBe(1)
    expect(defaultFigureWorkers(16, 8)).toBe(3)
  })
})

describe('auto-mode blockers', () => {
  const pic = '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\n'
  const main = (body: string, cls = 'article') =>
    `\\documentclass{${cls}}\\usepackage{tikz}\\begin{document}\n${body}\\end{document}\n`

  it('counts pictures outside comments across files', () => {
    expect(countPictures([pic + pic, `% ${pic}`, pic])).toBe(3)
    expect(countPictures(['\\tikz{\\draw (0,0);} \\tikz[baseline]{x}'])).toBe(2)
  })

  it('needs enough pictures to pay for a worker', () => {
    expect(detectAutoBlocker(main(pic + pic), [main(pic + pic)])).toBe('too-few-pictures')
    expect(detectAutoBlocker(main(pic), [main(pic), pic + pic])).toBeNull()
    // A loop can multiply the count; the first compile's figure list decides then.
    const looped = main(`\\foreach \\i in {1,...,5}{${pic}}`)
    expect(detectAutoBlocker(looped, [looped])).toBeNull()
  })

  it('refuses beamer and page-anchored pictures', () => {
    const three = pic + pic + pic
    expect(detectAutoBlocker(main(three, 'beamer'), [main(three, 'beamer')])).toBe('beamer')
    for (const bad of [
      '\\begin{tikzpicture}[remember picture, overlay]\\end{tikzpicture}',
      '\\begin{tikzpicture}[overlay]\\end{tikzpicture}',
      '\\node at (current page.center) {};',
      '\\tikzmark{a}',
      '\\usetikzlibrary{tikzmark}',
    ]) {
      expect(detectAutoBlocker(main(three), [main(three), bad]), bad).toBe('remember-picture')
    }
    // Prose mentioning an overlay is not a picture option.
    expect(detectAutoBlocker(main(three), [main(three), 'The overlay network is fast.'])).toBeNull()
    // Commented-out uses do not count.
    expect(detectAutoBlocker(main(three), [main(three), '% [overlay]'])).toBeNull()
  })

  it('refuses pictures wrapped in user-defined environments or commands', () => {
    const three = pic + pic + pic
    expect(
      detectAutoBlocker(main(three), [
        main(three),
        '\\newenvironment{fig}{\\begin{tikzpicture}}{\\end{tikzpicture}}',
      ]),
    ).toBe('wrapped-environment')
    expect(
      detectAutoBlocker(main(three), [
        main(three),
        '\\newcommand{\\dot}{\\begin{tikzpicture}\\fill circle(1pt);\\end{tikzpicture}}',
      ]),
    ).toBe('wrapped-environment')
    expect(
      detectAutoBlocker(main(three), [main(three), '\\newcommand{\\R}{\\mathbb{R}}']),
    ).toBeNull()
  })
})

class FakeCompiler implements FigureCompiler {
  files = new Map<string, string | Uint8Array>()
  compiles = 0
  constructor(
    readonly id: number,
    private readonly fail: Set<string> = new Set(),
  ) {}
  async init(): Promise<void> {}
  setFile(path: string, content: string | Uint8Array): void {
    this.files.set(path, content)
  }
  async compile() {
    this.compiles++
    const main = String(this.files.get('main.tex'))
    const name = /\\pgfactualjobname\{([^}]*)\}/.exec(main)?.[1] ?? '?'
    await new Promise((r) => setTimeout(r, 1))
    if (this.fail.has(name)) return { success: false, pdf: null, log: `! failed ${name}` }
    return { success: true, pdf: new TextEncoder().encode(`pdf:${name}:${this.id}`), log: 'ok' }
  }
  async readOutput(path: string): Promise<string | null> {
    return path.endsWith('.dpth') ? `depth ${path}` : null
  }
  dispose(): void {}
}

describe('TikzFigurePool', () => {
  it('spreads jobs over workers, caches by md5 and reports failures', async () => {
    const spawned: FakeCompiler[] = []
    const pool = new TikzFigurePool(
      () => {
        const c = new FakeCompiler(spawned.length, new Set(['f2']))
        spawned.push(c)
        return c
      },
      2,
      'main.tex',
    )
    const jobs = [
      { name: 'f0', md5: 'a' },
      { name: 'f1', md5: 'b' },
      { name: 'f2', md5: 'c' },
    ]
    const project: Array<[string, string]> = [
      ['main.tex', 'ignored'],
      ['chapter.tex', 'x'],
    ]
    const run = await pool.render(
      jobs,
      (f) => `\\def\\pgfactualjobname{${f}}`,
      () => project,
    )
    expect(spawned.length).toBe(2)
    expect([...run.rendered.keys()].sort()).toEqual(['f0', 'f1'])
    expect(run.failures).toEqual([{ name: 'f2', log: '! failed f2' }])
    expect(run.rendered.get('f0')?.dpth).toBe('depth f0.dpth')
    expect(spawned[0]!.files.get('chapter.tex')).toBe('x')
    expect(pool.isCurrent('f0', 'a')).toBe(true)
    expect(pool.isCurrent('f0', 'z')).toBe(false)
    expect(pool.isCurrent('f2', 'c')).toBe(false)
    expect(pool.isCurrent('f0', null)).toBe(false)

    // A second run only re-sends changed project files; unchanged ones are skipped.
    const before = spawned.map((c) => c.compiles)
    project[1] = ['chapter.tex', 'y']
    await pool.render(
      [{ name: 'f1', md5: 'b2' }],
      (f) => `\\def\\pgfactualjobname{${f}}`,
      () => project,
    )
    expect(spawned.reduce((n, c) => n + c.compiles, 0)).toBe(before.reduce((a, b) => a + b, 0) + 1)
    expect(pool.isCurrent('f1', 'b2')).toBe(true)

    pool.retain(['f1'])
    expect(pool.cache.has('f0')).toBe(false)
    pool.dispose()
    expect(pool.cache.size).toBe(0)
  })
})
