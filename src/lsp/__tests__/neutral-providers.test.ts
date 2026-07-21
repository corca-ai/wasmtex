import { describe, expect, it } from 'vitest'
import { detectCompletionContext, provideDefinition, provideHover } from '../neutral-providers'
import { ProjectIndex } from '../project-index'
import type { NeutralDocument } from '../protocol'

function doc(line: string): NeutralDocument {
  return { path: 'main.tex', getText: () => line, lineAt: () => line }
}

describe('provideHover (neutral) command-name boundary', () => {
  it('treats a control word as letters-only when a digit immediately follows', () => {
    // `\foo2` is the control word \foo followed by the character "2" — not a command
    // named "foo2". Hover must identify the command as "foo" (matching go-to-def, which
    // uses [a-zA-Z@]+), otherwise the lookup misses an otherwise-known command.
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\foo}{bar}')
    const hover = provideHover(doc('\\foo2'), { line: 1, column: 3 }, index)
    expect(hover).not.toBeNull()
    expect(hover!.contents.join('\n')).toContain('foo')
  })
})

describe('provideDefinition (neutral) cite-key resolution', () => {
  it('resolves the key under the cursor when the cite has a braced optional arg', () => {
    const index = new ProjectIndex()
    index.updateBib([
      { key: 'alpha', type: 'book', location: { file: 'refs.bib', line: 2, column: 1 } },
      { key: 'beta', type: 'book', location: { file: 'refs.bib', line: 9, column: 1 } },
    ])
    // The optional arg `[{p.~5}]` contains a brace; locating the key group by the
    // FIRST '{' would point inside the optional arg and resolve the wrong key.
    const line = '\\cite[{p.~5}]{alpha,beta}'
    const col = line.indexOf('beta') + 2 // 1-based, landing mid-'beta'

    const target = provideDefinition(doc(line), { line: 1, column: col }, index)
    expect(target).not.toBeNull()
    expect(target!.range.startLine).toBe(9) // beta's entry, not alpha's
  })
})

describe('provideDefinition/provideHover (neutral) multi-target \\cref', () => {
  it('resolves the label under the cursor in a comma list, not the whole blob', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:a}\n\\label{fig:b}')
    const line = '\\cref{fig:a,fig:b}'
    const col = line.indexOf('fig:b') + 2 // 1-based, mid-'fig:b'
    const target = provideDefinition(doc(line), { line: 1, column: col }, index)
    expect(target).not.toBeNull()
    expect(target!.range.startLine).toBe(2) // fig:b's def, not fig:a's (line 1) and not null
  })

  it('hover over one label of a \\cref list shows its definition, not the unresolved blob', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:a}\n\\label{fig:b}')
    const line = '\\cref{fig:a,fig:b}'
    const col = line.indexOf('fig:b') + 2
    const hover = provideHover(doc(line), { line: 1, column: col }, index)
    expect(hover).not.toBeNull()
    const text = hover!.contents.join('\n')
    expect(text).toContain('Defined at')
    expect(text).not.toContain('fig:a,fig:b') // not the whole comma list as one label
  })

  it('still resolves a single-label \\cref (regression guard)', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:a}')
    const line = '\\cref{fig:a}'
    const target = provideDefinition(doc(line), { line: 1, column: 8 }, index)
    expect(target).not.toBeNull()
    expect(target!.range.startLine).toBe(1)
  })
})

describe('detectCompletionContext multi-key \\cref list', () => {
  it('uses only the segment after the last comma as the prefix', () => {
    // \cref/\Cref accept a comma list; completing must use the last segment, not the whole
    // "fig:a,fig:" blob (which startsWith-matches no label → zero suggestions).
    expect(detectCompletionContext('\\cref{fig:a,fig:', 17)).toEqual({
      type: 'ref',
      prefix: 'fig:',
    })
  })
  it('still handles a single-key \\ref', () => {
    expect(detectCompletionContext('\\ref{fig:', 10)).toEqual({ type: 'ref', prefix: 'fig:' })
  })
})

describe('detectCompletionContext \\usepackage comma list', () => {
  it('returns only the package segment under the cursor in a multi-package list', () => {
    // \usepackage takes a comma-separated list; completion must use the last segment,
    // not the whole "amsmath,amss" string (which matches no package name).
    const line = '\\usepackage{amsmath,amss'
    expect(detectCompletionContext(line, line.length + 1)).toEqual({
      type: 'usepackage',
      prefix: 'amss',
    })
  })
  it('still handles a single package', () => {
    expect(detectCompletionContext('\\usepackage{amss', 17)).toEqual({
      type: 'usepackage',
      prefix: 'amss',
    })
  })
})

describe('detectCompletionContext leading-whitespace trimming', () => {
  // A space after the opening brace (e.g. "\ref{ fig") must not poison the prefix —
  // consumers filter via name.startsWith(prefix), so a leading space yields zero matches.
  it('trims a leading space in a \\ref argument', () => {
    const line = '\\ref{ fig'
    expect(detectCompletionContext(line, line.length + 1)).toEqual({ type: 'ref', prefix: 'fig' })
  })
  it('trims a leading space in \\begin/\\end/\\include arguments', () => {
    const beginLine = '\\begin{ itemi'
    expect(detectCompletionContext(beginLine, beginLine.length + 1)).toEqual({
      type: 'begin',
      prefix: 'itemi',
    })
    const incLine = '\\include{ cha'
    expect(detectCompletionContext(incLine, incLine.length + 1)).toEqual({
      type: 'include',
      prefix: 'cha',
    })
  })
})
