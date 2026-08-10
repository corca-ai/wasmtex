import { describe, expect, it } from 'vitest'
import {
  createLatexLanguageService,
  InMemoryTexResourceCatalogProvider,
  LatexLanguageService,
  type TexResourceCatalogIdentity,
  type TexResourceCatalogShard,
} from './lsp-service'
import { LatexSyntaxService } from './syntax'

const resourceIdentity = {
  schemaVersion: 1,
  texliveYear: '2025',
  mirrorRevision: '2025-0123456789abcdef',
} as const satisfies TexResourceCatalogIdentity

function classCatalog(name: string) {
  const shard: TexResourceCatalogShard = {
    ...resourceIdentity,
    kind: 'tex-class',
    resources: [
      {
        name,
        fileName: `${name}.cls`,
        extension: '.cls',
        key: `${name}.cls`,
        format: 1,
        bytes: 1,
        sha256: 'a'.repeat(64),
        texliveYear: resourceIdentity.texliveYear,
        mirrorRevision: resourceIdentity.mirrorRevision,
        sourcePath: `tex/latex/base/${name}.cls`,
        texlivePackage: 'latex',
        packageRevision: '1',
        catalogue: 'latex',
      },
    ],
  }
  return new InMemoryTexResourceCatalogProvider(resourceIdentity, [shard])
}

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

  it('atomically replaces profile-bound completion sources without rebuilding the index', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': '\\documentclass{bo' },
      resourceCatalog: classCatalog('book'),
    })
    const index = service.getProjectIndex()

    expect(service.getCompletions('main.tex', 1, 18).map((item) => item.label)).toEqual(['book'])
    service.configureCompletion({
      completionProfile: {
        id: 'second-profile',
        texliveYear: '2025',
        mirrorRevision: resourceIdentity.mirrorRevision,
      },
      resourceCatalog: classCatalog('bookest'),
    })

    expect(service.getProjectIndex()).toBe(index)
    expect(service.getCompletions('main.tex', 1, 18).map((item) => item.label)).toEqual(['bookest'])
    expect(service.getCompletionSnapshotState()).toEqual({ status: 'absent' })
  })

  it('reuses one stable syntax snapshot for document lifecycle and LSP queries', () => {
    const syntaxService = new LatexSyntaxService()
    const service = new LatexLanguageService({ syntaxService })

    const syntax = service.updateDocument({
      fileId: 'doc-1',
      path: 'old.tex',
      content: '\\section{Intro}\n\\label{sec:intro}',
      documentVersion: 4,
    })

    expect(service.getSyntaxService()).toBe(syntaxService)
    expect(service.getProjectIndex()).toBe(syntaxService.getProjectIndex())
    expect(syntaxService.getStats()).toMatchObject({ documents: 1, parseCount: 1 })
    expect(service.getOutline('old.tex')[0]?.title).toBe('Intro')
    expect(syntax.macros.some((event) => event.name === 'section')).toBe(true)

    // A duplicate delivery of the same version is a no-op, not a second parse.
    expect(
      service.updateDocument({
        fileId: 'doc-1',
        path: 'old.tex',
        content: '\\section{Intro}\n\\label{sec:intro}',
        documentVersion: 4,
      }),
    ).toBe(syntax)
    expect(syntaxService.getStats().parseCount).toBe(1)

    service.moveDocument('doc-1', 'chapter.tex')
    expect(service.getFile('old.tex')).toBeNull()
    expect(service.getOutline('chapter.tex')[0]?.title).toBe('Intro')
    expect(syntaxService.getStats().parseCount).toBe(2)

    expect(service.removeDocument('doc-1')).toBe(true)
    expect(service.getProjectIndex().hasFile('chapter.tex')).toBe(false)
    expect(service.removeDocument('doc-1')).toBe(false)
    expect(() => service.moveDocument('missing', 'next.tex')).toThrow('unknown fileId')
  })

  it('keeps Markdown syntax isolated and resolves path identity conflicts', () => {
    const syntaxService = new LatexSyntaxService()
    const service = new LatexLanguageService({ syntaxService })

    service.updateFile('notes.md', '$first$')
    service.updateFile('notes.md', '$second$')
    expect(syntaxService.getFile('path:notes.md')?.documentVersion).toBe(2)
    expect(service.getProjectIndex().hasFile('notes.md')).toBe(false)

    service.updateDocument({
      fileId: 'replacement',
      path: 'notes.md',
      content: '$third$',
      documentVersion: 8,
      language: 'markdown',
    })
    expect(syntaxService.getFile('path:notes.md')).toBeNull()
    expect(syntaxService.getFile('replacement')?.documentVersion).toBe(8)

    service.updateFile('notes.md', new Uint8Array([1]))
    expect(syntaxService.getFile('replacement')).toBeNull()
  })
})
