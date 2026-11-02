import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, BIBTEX_STAGE } from './backend-api'
import { WasmTexCompiler } from './headless'
import type { CompileResult } from './types'

/** One engine filesystem: the aux files a TeX pass would have written. */
class AuxEngine {
  compileCount = 0
  constructor(public files: Record<string, string>) {}

  async compile(): Promise<CompileResult> {
    this.compileCount++
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

function bibtexCompiler(engine: AuxEngine, files: Record<string, string>) {
  const bibliography = vi.fn(async ({ aux }: { aux: string }) => `bbl for ${bibtexLines(aux)}`)
  const backends = new BackendRegistry()
  backends.register(BIBTEX_STAGE, {
    id: 'test-bibtex',
    stage: BIBTEX_STAGE,
    location: 'server',
    run: bibliography,
  })
  const compiler = new WasmTexCompiler({ backends, files })
  const internals = compiler as unknown as { initialized: boolean; engine: AuxEngine }
  internals.initialized = true
  internals.engine = engine
  return { compiler, bibliography }
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
})
