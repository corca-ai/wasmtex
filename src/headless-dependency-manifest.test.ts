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
    private readonly idx = '',
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

interface CompilerInternals {
  initialized: boolean
  engine: FakeEngine
}

function installFakeEngine(compiler: WasmTexCompiler, engine: FakeEngine): void {
  const internals = compiler as unknown as CompilerInternals
  internals.initialized = true
  internals.engine = engine
}

describe('WasmTexCompiler dependency manifest composition', () => {
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
    expect(compiler.getFile('main.ind')).toBeNull()
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
