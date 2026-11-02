import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE } from './backend-api'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

/** One engine filesystem: the aux files a TeX pass would have written. */
class AuxEngine {
  compileCount = 0
  constructor(
    public files: Record<string, string>,
    private readonly pass?: (files: Record<string, string>, count: number) => void,
  ) {}

  async compile(): Promise<CompileResult> {
    this.compileCount++
    this.pass?.(this.files, this.compileCount)
    return {
      success: true,
      pdf: new Uint8Array([1]),
      log: '',
      errors: [],
      compileTime: 1,
      synctex: null,
      inputFiles: ['/work/main.tex'],
      inputFilesComplete: true,
      telemetry: { diagnostics: [] },
    }
  }

  async readFile(path: string): Promise<string | null> {
    return this.files[path] ?? null
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    if (typeof content === 'string') this.files[path] = content
  }
  async mkdir(_path: string): Promise<void> {}
  setMainFile(_path: string): void {}
  terminate(): void {}
}

function install(compiler: WasmTexCompiler, engine: AuxEngine): WasmTexCompiler {
  const internals = compiler as unknown as { initialized: boolean; engine: AuxEngine }
  internals.initialized = true
  internals.engine = engine
  return compiler
}

function bibtexCompiler(engine: AuxEngine, files: Record<string, string>, version?: string) {
  const bibliography = vi.fn(async ({ aux }: { aux: string }) => `bbl for ${bibtexLines(aux)}`)
  const backends = new BackendRegistry()
  const backend = {
    id: 'test-bibtex',
    stage: BIBTEX_STAGE,
    location: 'server',
    run: bibliography,
    ...(version ? { version } : {}),
  } as const
  backends.register(BIBTEX_STAGE, backend)
  const compiler = install(new WasmTexCompiler({ backends, files }), engine)
  return { compiler, bibliography, backend }
}

const bibtexLines = (aux: string) =>
  aux.match(/\\(?:citation|bibdata|bibstyle)\{[^}]*\}/g)?.join(' ')

describe('WasmTexCompiler bibliography stage', () => {
  it('follows the aux files of included chapters, where their citations live', async () => {
    const engine = new AuxEngine({
      'main.aux': String.raw`\relax
\@input{chapters/ch1.aux}
\bibstyle{plain}
\bibdata{refs}`,
      'chapters/ch1.aux': String.raw`\relax
\citation{knuth}
\@writefile{toc}{\contentsline {chapter}{1}{1}}`,
    })
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': String.raw`\documentclass{book}\begin{document}\include{chapters/ch1}\bibliographystyle{plain}\bibliography{refs}\end{document}`,
      'chapters/ch1.tex': String.raw`\chapter{One}\cite{knuth}`,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })

    await compiler.compile()

    expect(bibliography).toHaveBeenCalledOnce()
    const [request] = bibliography.mock.calls[0]!
    expect(bibtexLines(request.aux)).toBe(
      String.raw`\citation{knuth} \bibstyle{plain} \bibdata{refs}`,
    )
    expect(request.aux).not.toContain('\\@input')
    expect(compiler.getFile('main.bbl')).toContain('\\citation{knuth}')
    expect(engine.compileCount).toBe(2)
  })

  const article = String.raw`\documentclass{article}\begin{document}\cite{knuth} Prose.\bibliographystyle{plain}\bibliography{refs}\end{document}`
  const citing = (keys: string) =>
    new AuxEngine({
      'main.aux': `${keys}\n\\bibstyle{plain}\n\\bibdata{refs}\n\\newlabel{x}{{1}{1}}`,
    })

  it('keeps the generated bibliography across prose edits that cite the same works', async () => {
    const engine = citing('\\citation{knuth}')
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()
    expect(engine.compileCount).toBe(2)

    compiler.setFile('main.tex', article.replace('Prose.', 'Edited prose.'))
    engine.files['main.aux'] = engine.files['main.aux']!.replace('{{1}{1}}', '{{1}{2}}')
    await compiler.compile()

    expect(engine.compileCount).toBe(3)
    expect(bibliography).toHaveBeenCalledOnce()
    expect(compiler.getFile('main.bbl')).toBe(
      String.raw`bbl for \citation{knuth} \bibstyle{plain} \bibdata{refs}`,
    )
  })

  it('reruns BibTeX for new citations and a database edit, adding a pass only for a changed result', async () => {
    const engine = citing('\\citation{knuth}')
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()

    compiler.setFile('main.tex', article.replace('\\cite{knuth}', '\\cite{knuth,lamport}'))
    engine.files['main.aux'] = engine.files['main.aux']!.replace(
      '\\citation{knuth}',
      '\\citation{knuth,lamport}',
    )
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledTimes(2)
    expect(engine.compileCount).toBe(4)

    // The stub's output depends only on the aux commands, so this request yields the same file.
    compiler.setFile('refs.bib', '@book{knuth,title={TAOCP}}\n@book{lamport,title={LaTeX}}')
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledTimes(3)
    expect(engine.compileCount).toBe(5)
  })

  it('does not rerun Biber while the control file and databases are unchanged', async () => {
    const engine = new AuxEngine({ 'main.bcf': '<bcf:citekey>knuth</bcf:citekey>' })
    const biber = vi.fn(async ({ bcf }: { bcf: string }) => `biber bbl for ${bcf}`)
    const backends = new BackendRegistry()
    backends.register(BIBER_STAGE, {
      id: 'test-biber',
      stage: BIBER_STAGE,
      location: 'client',
      run: biber,
    })
    const source = String.raw`\documentclass{article}\usepackage[backend=biber]{biblatex}\addbibresource{refs.bib}\begin{document}\cite{knuth}\printbibliography\end{document}`
    const compiler = new WasmTexCompiler({
      backends,
      files: { 'main.tex': source, 'refs.bib': '@book{knuth,title={TAOCP}}' },
    })
    const internals = compiler as unknown as { initialized: boolean; engine: AuxEngine }
    internals.initialized = true
    internals.engine = engine
    await compiler.compile()
    expect(engine.compileCount).toBe(2)

    compiler.setFile(
      'main.tex',
      source.replace('\\printbibliography', 'More prose.\\printbibliography'),
    )
    await compiler.compile()
    expect(biber).toHaveBeenCalledOnce()
    expect(engine.compileCount).toBe(3)

    engine.files['main.bcf'] = '<bcf:citekey>knuth</bcf:citekey><bcf:citekey>lamport</bcf:citekey>'
    compiler.setFile('main.tex', source.replace('\\cite{knuth}', '\\cite{knuth,lamport}'))
    await compiler.compile()
    expect(biber).toHaveBeenCalledTimes(2)
    expect(engine.compileCount).toBe(5)
  })

  it('empties a generated bibliography once the last citation is gone', async () => {
    const engine = citing('\\citation{knuth}')
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()

    compiler.setFile('main.tex', article.replace('\\cite{knuth}', ''))
    engine.files['main.aux'] = engine.files['main.aux']!.replace('\\citation{knuth}\n', '')
    await compiler.compile()

    expect(bibliography).toHaveBeenCalledOnce()
    expect(compiler.getFile('main.bbl')).toBe('')
    expect(engine.files['main.bbl']).toBe('')
    expect(engine.compileCount).toBe(4)
  })

  it('never replaces an authored bibliography, even one written over a generated file', async () => {
    const engine = citing('\\citation{knuth}')
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()
    compiler.setFile('main.bbl', 'authored')
    compiler.setFile('refs.bib', '@book{knuth,title={Volume 1}}')
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledOnce()
    expect(compiler.getFile('main.bbl')).toBe('authored')
  })

  it('reruns for a backend version change and a citation added only in a chapter', async () => {
    const engine = new AuxEngine({
      'main.aux': '\\@input{ch1.aux}\n\\bibstyle{plain}\n\\bibdata{refs}',
      'ch1.aux': '\\citation{knuth}',
    })
    const files = {
      'main.tex': article,
      'ch1.tex': '\\cite{knuth}',
      'refs.bib': '@book{knuth,title={TAOCP}}',
    }
    const { compiler, bibliography, backend } = bibtexCompiler(engine, files, '1')
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledOnce()

    Object.assign(backend, { version: '2' })
    compiler.setFile('main.tex', `${article}%`)
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledTimes(2)

    compiler.setFile('ch1.tex', '\\cite{knuth,lamport}')
    engine.files['ch1.aux'] = '\\citation{knuth}\n\\citation{lamport}'
    await compiler.compile()
    expect(bibliography).toHaveBeenCalledTimes(3)
    expect(compiler.getFile('main.bbl')).toContain('\\citation{lamport}')
  })

  it('keeps the databases in the dependency manifest when the stage is skipped', async () => {
    const engine = citing('\\citation{knuth}')
    const { compiler } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()
    compiler.setFile('main.tex', article.replace('Prose.', 'Edited prose.'))
    const result = await compiler.compile()
    expect(result.telemetry?.dependencyManifest?.projectInputs).toContain('refs.bib')
    expect(result.telemetry?.dependencyManifest?.coverage).toContainEqual({
      stage: 'bibliography',
      source: 'backend-request',
      complete: true,
    })
  })

  it('takes another pass when a cited document changes its table of contents', async () => {
    let title = 'Intro'
    const engine = new AuxEngine(
      { 'main.aux': '\\citation{knuth}\n\\bibstyle{plain}\n\\bibdata{refs}' },
      (files) => {
        files['main.toc'] = `\\contentsline{section}{${title}}{1}`
      },
    )
    const { compiler, bibliography } = bibtexCompiler(engine, {
      'main.tex': article,
      'refs.bib': '@book{knuth,title={TAOCP}}',
    })
    await compiler.compile()
    expect(engine.compileCount).toBe(2)

    compiler.setFile('main.tex', `${article}%`)
    await compiler.compile()
    expect(engine.compileCount).toBe(3)

    title = 'Introduction'
    compiler.setFile('main.tex', `${article}%%`)
    await compiler.compile()
    expect(engine.compileCount).toBe(5)
    expect(bibliography).toHaveBeenCalledOnce()
  })

  it('leaves a Biber document to Biber even when stale aux files still cite', async () => {
    const engine = new AuxEngine({
      'main.bcf': '<bcf:citekey>knuth</bcf:citekey>',
      'main.aux': '\\citation{knuth}\n\\bibdata{main-blx,refs}',
    })
    const biber = vi.fn(async () => 'biber bbl')
    const bibtex = vi.fn(async () => 'bibtex bbl')
    const backends = new BackendRegistry()
    backends.register(BIBER_STAGE, {
      id: 'biber',
      stage: BIBER_STAGE,
      location: 'client',
      run: biber,
    })
    backends.register(BIBTEX_STAGE, {
      id: 'bibtex',
      stage: BIBTEX_STAGE,
      location: 'server',
      run: bibtex,
    })
    const source = String.raw`\documentclass{article}\usepackage{biblatex}\addbibresource{refs.bib}\begin{document}\cite{knuth}\printbibliography\end{document}`
    const compiler = install(
      new WasmTexCompiler({
        backends,
        files: { 'main.tex': source, 'refs.bib': '@book{knuth,title={TAOCP}}' },
      }),
      engine,
    )
    await compiler.compile()
    compiler.setFile('main.tex', `${source}%`)
    await compiler.compile()
    expect(bibtex).not.toHaveBeenCalled()
    expect(biber).toHaveBeenCalledOnce()
    expect(engine.compileCount).toBe(3)
  })
})
