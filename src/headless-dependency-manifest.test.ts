import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, INDEX_STAGE } from './backend-api'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

const pdfResult = (inputFiles: string[]): CompileResult => ({
  success: true,
  pdf: new Uint8Array([1]),
  log: '',
  errors: [],
  compileTime: 1,
  synctex: null,
  inputFiles,
  inputFilesComplete: true,
  telemetry: { diagnostics: [] },
})

class FakeEngine {
  compileCount = 0
  constructor(
    private readonly aux: string,
    private readonly bcf = '',
    public idx = '',
  ) {}

  async compile(): Promise<CompileResult> {
    this.compileCount++
    const generated = this.compileCount > 1 ? ['/work/main.bbl', '/work/main.ind'] : []
    return pdfResult(['/work/main.tex', ...generated])
  }

  async readFile(path: string): Promise<string | null> {
    if (path === 'main.aux') return this.aux
    if (path === 'main.bcf') return this.bcf
    if (path === 'main.idx') return this.idx
    return null
  }

  async writeFile(_path: string, _content: string | Uint8Array): Promise<void> {}
  async mkdir(_path: string): Promise<void> {}
  setMainFile(_path: string): void {}
  terminate(): void {}
}

class CompletionFakeEngine extends FakeEngine {
  override async compile(): Promise<CompileResult> {
    const result = await super.compile()
    result.engineCommands = [
      'runtimecommand\t111\t1',
      'runtimeenvironment\t111\t0',
      'endruntimeenvironment\t111\t0',
    ]
    result.engineCommandsComplete = true
    result.engineCommandsDropped = 0
    return result
  }

  getCompletionObservation() {
    return {
      counters: ['runtimecounter'],
      colors: ['runtimecolor'],
      keyFamilies: [{ name: 'runtimefamily', keys: ['runtimekey'] }],
      complete: true,
    }
  }
}

interface CompilerInternals {
  initialized: boolean
  engine: FakeEngine
}

function installFakeEngine(compiler: WasmTexCompiler, engine: FakeEngine): void {
  const internals = compiler as unknown as CompilerInternals
  internals.initialized = true
  internals.engine = engine
}

function indexedCompiler(engine: FakeEngine, index: (request: { idx: string }) => Promise<string>) {
  const source = String.raw`\documentclass{book}\makeindex\begin{document}\printindex\end{document}`
  const backends = new BackendRegistry()
  backends.register(INDEX_STAGE, {
    id: 'index',
    stage: INDEX_STAGE,
    location: 'server',
    run: index,
  })
  const compiler = new WasmTexCompiler({ files: { 'main.tex': source }, backends })
  installFakeEngine(compiler, engine)
  return { source, compiler }
}

describe('WasmTexCompiler dependency manifest composition', () => {
  it('settles changing PDF outlines even when label/ref command names are unchanged', async () => {
    const compiler = new WasmTexCompiler({ files: { 'main.tex': '\\documentclass{book}' } })
    const engine = new FakeEngine('')
    const compile = engine.compile.bind(engine)
    vi.spyOn(engine, 'compile').mockImplementation(async () => ({
      ...(await compile()),
      semanticTrace: 'L:unchanged-label-name',
      log: engine.compileCount < 3 ? 'Rerun to get outlines right' : '',
    }))
    const read = engine.readFile.bind(engine)
    vi.spyOn(engine, 'readFile').mockImplementation(async (path) =>
      path === 'main.out' ? `outline-${Math.min(engine.compileCount, 2)}` : read(path),
    )
    installFakeEngine(compiler, engine)
    const result = await compiler.compile()
    expect(engine.compileCount).toBe(3)
    expect(result.telemetry?.referencesSettled).toBe(true)
    compiler.dispose()
  })

  it('attaches only compile-produced runtime evidence and stales it immediately on edit', async () => {
    const source = '\\documentclass{article}\\begin{document}x\\end{document}'
    const compiler = new WasmTexCompiler({
      files: { 'main.tex': source },
      completionProfile: { id: 'headless-test', mirrorRevision: 'revision-1' },
    })
    const engine = new CompletionFakeEngine('')
    installFakeEngine(compiler, engine)

    const result = await compiler.compile()

    const snapshot = result.telemetry?.completionSnapshot
    expect(snapshot).toMatchObject({
      version: 1,
      identity: {
        root: 'main.tex',
        engine: 'pdflatex',
        profile: { id: 'headless-test', texliveYear: '2025', mirrorRevision: 'revision-1' },
      },
      fields: {
        commands: { status: 'observed', complete: true },
        colors: { status: 'observed', complete: true },
      },
    })
    expect(compiler.getCompletionSnapshotState().status).toBe('fresh')
    expect(engine.compileCount).toBe(1)

    compiler.setFile('main.tex', `${source}\n% changed`)
    expect(compiler.getCompletionSnapshotState().status).toBe('stale')
    expect(engine.compileCount).toBe(1)
  })

  it('combines classic BibTeX, custom BST, all forwarded BIB files, and index inputs', async () => {
    const bibliography = vi.fn(async () => '\\begin{thebibliography}{1}\\end{thebibliography}')
    const index = vi.fn(async () => '\\begin{theindex}\\end{theindex}')
    const backends = new BackendRegistry()
    backends.register(BIBTEX_STAGE, {
      id: 'test-bibtex',
      stage: BIBTEX_STAGE,
      location: 'server',
      run: bibliography,
    })
    backends.register(INDEX_STAGE, {
      id: 'test-index',
      stage: INDEX_STAGE,
      location: 'server',
      run: index,
    })
    const source = String.raw`\documentclass{article}
\usepackage{makeidx}\makeindex
\begin{document}
\cite{x}\bibliographystyle{styles/custom}\bibliography{refs}
\index{term}\printindex
\end{document}`
    const compiler = new WasmTexCompiler({
      backends,
      files: {
        'main.tex': source,
        'refs/primary.bib': '@book{x,title={X}}',
        'refs/forwarded.bib': '@book{y,title={Y}}',
        'styles/custom.bst': 'ENTRY{}{}{}',
        'unrelated.md': 'not an input',
      },
    })
    installFakeEngine(
      compiler,
      new FakeEngine(
        String.raw`\citation{x}
\bibdata{refs/primary}
\bibstyle{styles/custom}`,
        '',
        String.raw`\indexentry{term}{1}`,
      ),
    )

    const result = await compiler.compile()
    const manifest = result.telemetry?.dependencyManifest
    expect(manifest?.complete).toBe(true)
    expect(manifest?.projectInputs).toEqual([
      'main.tex',
      'refs/forwarded.bib',
      'refs/primary.bib',
      'styles/custom.bst',
    ])
    expect(manifest?.projectInputs).not.toContain('main.bbl')
    expect(manifest?.projectInputs).not.toContain('main.ind')
    expect(manifest?.coverage).toEqual([
      { stage: 'latex', source: 'recorder', complete: true },
      { stage: 'bibliography', source: 'backend-request', complete: true },
      { stage: 'index', source: 'backend-request', complete: true },
    ])
    expect(bibliography).toHaveBeenCalledWith(
      expect.objectContaining({
        bibFiles: {
          'refs/forwarded.bib': '@book{y,title={Y}}',
          'refs/primary.bib': '@book{x,title={X}}',
        },
        bstFiles: { 'styles/custom.bst': 'ENTRY{}{}{}' },
      }),
    )
    expect(index).toHaveBeenCalledOnce()

    const reusedArtifacts = await compiler.compile()
    expect(reusedArtifacts.telemetry?.dependencyManifest?.projectInputs).toEqual(
      manifest?.projectInputs,
    )
    expect(bibliography).toHaveBeenCalledOnce()
    expect(index).toHaveBeenCalledOnce()

    compiler.setFile('styles/custom.bst', 'ENTRY{author}{}{}')
    expect(compiler.getFile('main.bbl')).toBeNull()
    expect(compiler.getFile('main.ind')).toBe('\\begin{theindex}\\end{theindex}')
  })

  it('reuses generated index inputs after prose edits and regenerates changed page numbers', async () => {
    const engine = new FakeEngine('', '', String.raw`\indexentry{term}{1}`)
    const index = vi.fn(async ({ idx }: { idx: string }) => `index: ${idx}`)
    const { source, compiler } = indexedCompiler(engine, index)

    await compiler.compile()
    expect(engine.compileCount).toBe(2)
    compiler.setFile('main.tex', `${source}\n% prose edit`)
    const repeated = await compiler.compile()
    expect(engine.compileCount).toBe(3)
    expect(index).toHaveBeenCalledTimes(1)
    expect(repeated.telemetry?.dependencyManifest?.complete).toBe(true)
    expect(repeated.telemetry?.dependencyManifest?.projectInputs).not.toContain('main.ind')

    engine.idx = String.raw`\indexentry{term}{2}`
    compiler.setFile('main.tex', `${source}\n% page changed`)
    await compiler.compile()
    expect(engine.compileCount).toBe(5)
    expect(index).toHaveBeenCalledTimes(2)
    expect(compiler.getFile('main.ind')).toContain('{2}')

    engine.idx = ''
    compiler.setFile('main.tex', `${source}\n% last entry removed`)
    await compiler.compile()
    expect(engine.compileCount).toBe(7)
    expect(compiler.getFile('main.ind')).toBe('')
    const empty = await compiler.compile()
    expect(engine.compileCount).toBe(8)
    expect(empty.telemetry?.dependencyManifest?.complete).toBe(true)
    expect(empty.telemetry?.dependencyManifest?.projectInputs).not.toContain('main.ind')
    engine.idx = String.raw`\indexentry{restored}{4}`
    compiler.setFile('main.tex', `${source}\n% restored entry`)
    await compiler.compile()
    expect(engine.compileCount).toBe(10)
    expect(compiler.getFile('main.ind')).toContain('restored')
    compiler.dispose()
  })

  it('bounds nonconverging index pages and does not reuse a replaced project artifact', async () => {
    const engine = new FakeEngine('')
    const compile = engine.compile.bind(engine)
    vi.spyOn(engine, 'compile').mockImplementation(async () => {
      engine.idx = `\\indexentry{term}{${engine.compileCount + 1}}`
      return compile()
    })
    const index = vi.fn(async ({ idx }: { idx: string }) => idx)
    const { source, compiler } = indexedCompiler(engine, index)
    const result = await compiler.compile()
    expect(engine.compileCount).toBe(6)
    expect(result.telemetry?.referencesSettled).toBe(false)

    Object.assign(engine, { flushCache: async () => {} })
    await compiler.loadProject({ 'main.tex': source })
    vi.mocked(engine.compile).mockImplementation(compile)
    const previousCalls = index.mock.calls.length
    await compiler.compile()
    expect(index.mock.calls.length).toBe(previousCalls + 1)
    expect(compiler.getFile('main.ind')).toBe(engine.idx)
    compiler.dispose()
  })

  it('does not rerun TeX when changed index input produces identical output', async () => {
    const engine = new FakeEngine('', '', String.raw`\indexentry{term}{1}`)
    const index = vi.fn(async () => 'same sorted index')
    const { source, compiler } = indexedCompiler(engine, index)
    await compiler.compile()
    engine.idx += '\n' // Whitespace/order can change without changing the sorted output.
    compiler.setFile('main.tex', `${source}\n% changed`)
    await compiler.compile()
    expect(engine.compileCount).toBe(3)
    expect(index).toHaveBeenCalledTimes(2)

    compiler.setFile('main.ind', 'author supplied index')
    engine.idx = String.raw`\indexentry{other}{3}`
    await compiler.compile()
    expect(engine.compileCount).toBe(4)
    expect(index).toHaveBeenCalledTimes(2)
    expect(compiler.getFile('main.ind')).toBe('author supplied index')
    compiler.dispose()
  })

  it('invalidates index reuse when the registered backend or its version changes', async () => {
    const engine = new FakeEngine('', '', String.raw`\indexentry{term}{1}`)
    const backends = new BackendRegistry()
    const first = vi.fn(async () => 'old index')
    backends.register(INDEX_STAGE, {
      id: 'index',
      version: '1',
      stage: INDEX_STAGE,
      location: 'server',
      run: first,
    })
    const source = String.raw`\documentclass{book}\makeindex\begin{document}\printindex\end{document}`
    const compiler = new WasmTexCompiler({ files: { 'main.tex': source }, backends })
    installFakeEngine(compiler, engine)
    await compiler.compile()

    const next = vi.fn(async () => 'new index')
    const backend = {
      id: 'index',
      version: '2',
      stage: 'index' as const,
      location: 'server' as const,
      run: next,
    }
    backends.register(INDEX_STAGE, backend)
    compiler.setFile('main.tex', `${source}\n% prose edit`)
    await compiler.compile()
    expect(next).toHaveBeenCalledOnce()
    expect(compiler.getFile('main.ind')).toBe('new index')

    backend.version = '3'
    next.mockResolvedValue('version 3 index')
    await compiler.compile()
    expect(next).toHaveBeenCalledTimes(2)
    expect(compiler.getFile('main.ind')).toBe('version 3 index')
    compiler.dispose()
  })

  it('settles index page numbers that change after the table of contents appears', async () => {
    const engine = new FakeEngine('')
    const compile = engine.compile.bind(engine)
    vi.spyOn(engine, 'compile').mockImplementation(async () => {
      engine.idx = `\\indexentry{term}{${engine.compileCount === 0 ? 1 : 2}}`
      return compile()
    })
    const index = vi.fn(async ({ idx }: { idx: string }) => idx)
    const { compiler } = indexedCompiler(engine, index)
    const result = await compiler.compile()
    expect(engine.compileCount).toBe(3)
    expect(index).toHaveBeenCalledTimes(2)
    expect(compiler.getFile('main.ind')).toContain('{2}')
    expect(result.telemetry?.referencesSettled).toBe(true)
    compiler.dispose()
  })

  it.each([
    ['biblatex-lite', undefined],
    [
      'server Biber',
      {
        id: 'test-biber',
        stage: BIBER_STAGE as typeof BIBER_STAGE,
        location: 'server' as const,
        run: async () => '\\begin{refsection}\\end{refsection}',
      },
    ],
  ])('tracks every BIB file for %s', async (_name, biber) => {
    const backends = new BackendRegistry()
    if (biber) backends.register(BIBER_STAGE, biber)
    const compiler = new WasmTexCompiler({
      backends,
      files: {
        'main.tex':
          '\\documentclass{article}\\usepackage{biblatex}\\begin{document}x\\end{document}',
        'one.bib': '@book{x,title={X}}',
        'nested/two.bib': '@book{y,title={Y}}',
      },
    })
    installFakeEngine(compiler, new FakeEngine('', '<bcf:citekey order="1">x</bcf:citekey>'))

    const result = await compiler.compile()
    expect(result.telemetry?.dependencyManifest).toMatchObject({
      complete: true,
      projectInputs: ['main.tex', 'nested/two.bib', 'one.bib'],
    })
    expect(result.telemetry?.dependencyManifest?.coverage).toContainEqual({
      stage: 'bibliography',
      source: 'backend-request',
      complete: true,
    })
  })
})
