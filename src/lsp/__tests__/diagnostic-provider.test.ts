import { describe, expect, it } from 'vitest'
import { computeDiagnostics } from '../diagnostic-provider'
import { ProjectIndex } from '../project-index'
import { parseTraceFile } from '../trace-parser'

describe('computeDiagnostics', () => {
  it('returns empty for clean project', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\section{Hello}')
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('detects undefined ref', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', 'See \\ref{missing}')
    const diags = computeDiagnostics(index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('undefined-ref')
    expect(diags[0]!.message).toContain('missing')
    expect(diags[0]!.severity).toBe('warning')
  })

  it('does not flag ref when label exists', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{sec:one}\n\\ref{sec:one}')
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('does not flag ref resolved via aux', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{sec:aux}')
    index.updateAux('\\newlabel{sec:aux}{{1}{1}}')
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('detects undefined citation', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{noexist}')
    const diags = computeDiagnostics(index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('undefined-cite')
    expect(diags[0]!.message).toContain('noexist')
  })

  it('does not flag cite resolved via aux', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{knuth84}')
    index.updateAux('\\bibcite{knuth84}{1}')
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('does not flag cite resolved via bibitem', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{knuth84}')
    index.updateFile('refs.tex', '\\bibitem{knuth84} TeXbook.')
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('does not flag cite resolved via bib entries', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{knuth84}')
    index.updateBib([
      { key: 'knuth84', type: 'book', location: { file: 'refs.bib', line: 1, column: 1 } },
    ])
    expect(computeDiagnostics(index)).toEqual([])
  })

  it('flags an unused bib entry with its location', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{used}')
    index.updateBib([
      { key: 'used', type: 'book', location: { file: 'refs.bib', line: 1, column: 1 } },
      { key: 'orphan', type: 'article', location: { file: 'refs.bib', line: 5, column: 9 } },
    ])
    const unused = computeDiagnostics(index).filter((d) => d.code === 'unused-bib-entry')
    expect(unused).toHaveLength(1)
    expect(unused[0]!.message).toContain('orphan')
    expect(unused[0]!.severity).toBe('info')
    expect(unused[0]!.line).toBe(5)
    expect(unused[0]!.column).toBe(9)
  })

  it('treats \\nocite{*} as citing every entry (no undefined-cite, no unused-bib)', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\nocite{*}')
    index.updateBib([
      { key: 'a', type: 'book', location: { file: 'refs.bib', line: 1, column: 1 } },
      { key: 'b', type: 'article', location: { file: 'refs.bib', line: 5, column: 1 } },
    ])
    const diags = computeDiagnostics(index)
    // `*` is the cite-all wildcard, never an undefined citation...
    expect(diags.filter((d) => d.code === 'undefined-cite')).toEqual([])
    // ...and it marks every bib entry as cited, so none are "unused".
    expect(diags.filter((d) => d.code === 'unused-bib-entry')).toEqual([])
  })

  it('underlines the whole \\include{...} command (not a hard-coded \\input width)', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\include{missing}')
    const diag = computeDiagnostics(index).find((d) => d.code === 'missing-include')!
    expect(diag).toBeDefined()
    // column points at the backslash; the underline must reach the end of the path.
    expect(diag.endColumn).toBe(diag.column + '\\include{'.length + 'missing'.length)
  })

  it('detects duplicate labels', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{dup}')
    index.updateFile('b.tex', '\\label{dup}')
    const diags = computeDiagnostics(index)
    const dupDiags = diags.filter((d) => d.code === 'duplicate-label')
    expect(dupDiags).toHaveLength(1)
    expect(dupDiags[0]!.message).toContain('dup')
    expect(dupDiags[0]!.file).toBe('b.tex')
  })

  it('detects multiple issues together', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{missing}\n\\cite{noexist}\n\\label{a}\n\\label{a}')
    const diags = computeDiagnostics(index)
    const codes = new Set(diags.map((d) => d.code))
    expect(codes).toContain('duplicate-label')
    expect(codes).toContain('undefined-cite')
    expect(codes).toContain('undefined-ref')
    expect(codes).toContain('unreferenced-label')
  })

  // --- Unreferenced labels ---

  it('detects unreferenced label', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{unused}')
    const diags = computeDiagnostics(index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('unreferenced-label')
    expect(diags[0]!.severity).toBe('info')
    expect(diags[0]!.message).toContain('unused')
  })

  it('does not flag label that has a ref', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{used}\n\\ref{used}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'unreferenced-label')).toHaveLength(0)
  })

  it('detects unreferenced label across files', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{sec:intro}')
    index.updateFile('ch1.tex', '\\ref{sec:intro}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'unreferenced-label')).toHaveLength(0)
  })

  // --- Missing includes ---

  it('detects missing include file', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{missing}')
    const diags = computeDiagnostics(index)
    expect(diags).toHaveLength(1)
    expect(diags[0]!.code).toBe('missing-include')
    expect(diags[0]!.severity).toBe('warning')
    expect(diags[0]!.message).toContain('missing.tex')
  })

  it('does not flag include when file is indexed', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{chapter1}')
    index.updateFile('chapter1.tex', '\\section{Chapter 1}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'missing-include')).toHaveLength(0)
  })

  it('handles include with .tex extension', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{chapter1.tex}')
    index.updateFile('chapter1.tex', '\\section{Chapter 1}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'missing-include')).toHaveLength(0)
  })

  it('does not flag an include resolved relative to the including file directory', () => {
    const index = new ProjectIndex()
    index.updateFile('chapters/main.tex', '\\input{intro}')
    index.updateFile('chapters/intro.tex', 'content')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'missing-include')).toHaveLength(0)
  })

  it('does not flag an \\input with an explicit non-.tex extension when the file is indexed', () => {
    // \input loads the EXACT file with whatever extension is given. Blindly forcing `.tex`
    // onto `macros.sty` searched for `macros.sty.tex` and never the real `macros.sty`, so an
    // indexed, present file was reported missing. Mirrors go-to-definition's resolveInput and
    // the link provider, which only append `.tex` to an extensionless target.
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{macros.sty}')
    index.updateFile('macros.sty', '\\newcommand{\\foo}{bar}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'missing-include')).toHaveLength(0)
  })

  it('does not flag a dir-relative \\input with a non-.tex extension when indexed', () => {
    const index = new ProjectIndex()
    index.updateFile('chapters/main.tex', '\\input{data.txt}')
    index.updateFile('chapters/data.txt', 'raw data')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'missing-include')).toHaveLength(0)
  })

  // --- Diagnostic ranges ---

  it('undefined-ref range covers only the name, not past the closing brace', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{abc}') // 9-char line; `}` is column 9
    const d = computeDiagnostics(index).find((x) => x.code === 'undefined-ref')!
    expect(d.column).toBe(6) // 'abc' starts at column 6
    expect(d.endColumn).toBe(9) // end-exclusive name span = 6 + 3
  })

  it('undefined-cite range covers only the key, not past the closing brace', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\cite{abc}') // 10-char line; `}` is column 10
    const d = computeDiagnostics(index).find((x) => x.code === 'undefined-cite')!
    expect(d.column).toBe(7)
    expect(d.endColumn).toBe(10)
  })

  it('label diagnostic ranges cover only the name, not past the closing brace', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{dup}') // 11-char line; `}` is column 11
    index.updateFile('b.tex', '\\label{dup}')
    const diags = computeDiagnostics(index)
    const dup = diags.find((x) => x.code === 'duplicate-label')!
    expect(dup.column).toBe(8)
    expect(dup.endColumn).toBe(11)
    const unref = diags.find((x) => x.code === 'unreferenced-label')!
    expect(unref.column).toBe(8)
    expect(unref.endColumn).toBe(11)
  })

  // --- Semantic trace integration ---

  it('suppresses undefined-ref when trace has the label', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{macro-label}')
    // No static \label{macro-label} anywhere → normally would be undefined-ref
    index.updateSemanticTrace(parseTraceFile('L:macro-label'))
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'undefined-ref')).toHaveLength(0)
  })

  it('suppresses unreferenced-label when trace has the ref', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{lonely}')
    // No static \ref{lonely} → normally would be unreferenced-label
    index.updateSemanticTrace(parseTraceFile('R:lonely'))
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'unreferenced-label')).toHaveLength(0)
  })

  it('generates engine-only-label info diagnostic', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\section{Hello}')
    // Trace has a label not in static parse or aux
    index.updateSemanticTrace(parseTraceFile('L:generated-key'))
    const diags = computeDiagnostics(index)
    const eol = diags.filter((d) => d.code === 'engine-only-label')
    expect(eol).toHaveLength(1)
    expect(eol[0]!.severity).toBe('info')
    expect(eol[0]!.message).toContain('generated-key')
    expect(eol[0]!.message).toContain('macro expansion')
  })

  it('engine-only-label diagnostic does not use placeholder file or invalid 0 position', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\section{Hello}')
    index.updateSemanticTrace(parseTraceFile('L:generated-key'))
    const eol = computeDiagnostics(index).find((d) => d.code === 'engine-only-label')!
    expect(eol).toBeDefined()
    // file must not be the bogus '?' placeholder (it makes applyMarkers drop it and
    // makes main.ts render a clickable '?:0' entry navigating to revealLine(0,'?')).
    expect(eol.file).not.toBe('?')
    // positions must honor the 1-based contract used by every other diagnostic.
    expect(eol.line).toBeGreaterThanOrEqual(1)
    expect(eol.column).toBeGreaterThanOrEqual(1)
    expect(eol.endColumn).toBeGreaterThanOrEqual(eol.column)
  })

  it('suppresses engine-only-label when label is referenced', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{gen-key}')
    index.updateSemanticTrace(parseTraceFile('L:gen-key'))
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'engine-only-label')).toHaveLength(0)
  })

  it('does not generate engine-only-label for statically known labels', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{known}')
    index.updateSemanticTrace(parseTraceFile('L:known'))
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'engine-only-label')).toHaveLength(0)
  })

  it('does not generate engine-only-label for aux labels', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\section{Hi}')
    index.updateAux('\\newlabel{aux-label}{{1}{1}}')
    index.updateSemanticTrace(parseTraceFile('L:aux-label'))
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'engine-only-label')).toHaveLength(0)
  })

  it('no trace → no engine-only-label diagnostics', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{normal}')
    const diags = computeDiagnostics(index)
    expect(diags.filter((d) => d.code === 'engine-only-label')).toHaveLength(0)
  })
})
