import { describe, expect, it } from 'vitest'
import { createLatexLanguageService, LatexLanguageService } from './lsp-service'

describe('LatexLanguageService', () => {
  it('indexes project files and exposes diagnostics and outline', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\section{Intro}\nSee \\ref{sec:intro}\n',
      },
    })

    expect(service.listFiles()).toEqual(['main.tex'])
    expect(service.getOutline('main.tex')).toMatchObject([
      { level: 'section', title: 'Intro', location: { file: 'main.tex', line: 1 } },
    ])
    expect(service.getDiagnostics().map((diag) => diag.code)).toContain('undefined-ref')

    service.updateFile('chapter.tex', '\\label{sec:intro}')

    expect(service.getDiagnostics().map((diag) => diag.code)).not.toContain('undefined-ref')
  })

  it('surfaces linter diagnostics alongside index diagnostics', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': '\\section{Intro}\nsee \\ref{a} pages 10-20\n\\label{a}' },
    })
    expect(service.getDiagnostics().map((d) => d.code)).toEqual(
      expect.arrayContaining(['nbsp-before-ref', 'en-dash-range']),
    )
  })

  it('disables the linter when lint: false', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': 'see \\ref{a} pages 10-20\n\\label{a}' },
      lint: false,
    })
    const codes = service.getDiagnostics().map((d) => d.code)
    expect(codes).not.toContain('nbsp-before-ref')
    expect(codes).not.toContain('en-dash-range')
  })

  it('renames labels across files without Monaco', () => {
    const service = new LatexLanguageService({
      files: {
        'main.tex': 'See \\ref{sec:intro}',
        'chapter.tex': '\\label{sec:intro}',
      },
    })

    const edit = service.getRenameEdits('main.tex', 1, 10, 'sec:overview')

    expect(edit).toBeDefined()
    expect(edit!.edits).toHaveLength(2)
    expect(new Set(edit!.edits.map((item) => item.file))).toEqual(
      new Set(['main.tex', 'chapter.tex']),
    )
    expect(edit!.edits.every((item) => item.newText === 'sec:overview')).toBe(true)
  })

  it('keeps BibTeX entries in sync when bib files change', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\cite{knuth84}',
        'refs.bib': '@book{knuth84, title = {The TeXbook}}',
      },
    })

    expect(service.getDiagnostics().map((diag) => diag.code)).not.toContain('undefined-cite')

    service.updateFile('refs.bib', '@book{lamport94, title = {LaTeX}}')

    expect(service.getDiagnostics().map((diag) => diag.code)).toContain('undefined-cite')
  })

  it('drops BibTeX entries when a bibliography file becomes binary', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\cite{knuth84}',
        'refs.bib': '@book{knuth84, title = {The TeXbook}}',
      },
    })

    service.updateFile('refs.bib', new Uint8Array([0]))

    expect(service.getDiagnostics().map((diag) => diag.code)).toContain('undefined-cite')
  })

  it('exposes the editor-neutral language features', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': '\\section{Intro}\n\\label{a}\n\\ref{a}\n\\begin{x}\ny\n\\end{x}' },
    })
    expect(service.getWorkspaceSymbols('Intro').map((s) => s.kind)).toContain('section')
    expect(service.getFoldingRanges('main.tex')).toContainEqual({ startLine: 4, endLine: 6 })
    expect(service.getDocumentHighlights('main.tex', 3, 6).length).toBeGreaterThan(0)
    expect(service.getSemanticTokens('main.tex').some((t) => t.type === 'command')).toBe(true)
  })
})
