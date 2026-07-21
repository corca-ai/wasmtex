import { describe, expect, it } from 'vitest'
import {
  getCodeActions,
  getDocumentHighlights,
  getDocumentLinks,
  getFoldingRanges,
  getInlayHints,
  getSemanticTokens,
  getSignatureHelp,
  getWorkspaceSymbols,
} from '../language-features'
import { ProjectIndex } from '../project-index'

function indexWith(files: Record<string, string>): ProjectIndex {
  const index = new ProjectIndex()
  for (const [path, content] of Object.entries(files)) index.updateFile(path, content)
  return index
}

describe('getSignatureHelp', () => {
  it('hints the first argument inside a command call', () => {
    const help = getSignatureHelp('\\href{', 1, 7)
    expect(help).not.toBeNull()
    expect(help!.activeParameter).toBe(0)
    expect(help!.parameters).toHaveLength(2)
  })

  it('advances the active parameter to the second argument', () => {
    const help = getSignatureHelp('\\href{x}{', 1, 10)
    expect(help!.activeParameter).toBe(1)
  })

  it('returns null when the cursor is outside any argument list', () => {
    expect(getSignatureHelp('\\href{x}{y} ', 1, 12)).toBeNull()
  })

  it('works across a multi-line argument list', () => {
    // The \href call opens on line 1; the cursor is in its second arg on line 2.
    const help = getSignatureHelp('\\href{https://x}\n{', 2, 2)
    expect(help).not.toBeNull()
    expect(help!.activeParameter).toBe(1)
  })
})

describe('getFoldingRanges', () => {
  it('folds environments', () => {
    const ranges = getFoldingRanges('\\begin{itemize}\n\\item a\n\\end{itemize}')
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3 })
  })

  it('folds % region / % endregion blocks', () => {
    const ranges = getFoldingRanges('% region setup\ncode\n% endregion')
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3, kind: 'region' })
  })

  it('folds section blocks up to the next same-level section', () => {
    const doc = '\\section{A}\ntext\n\\section{B}\nmore'
    const ranges = getFoldingRanges(doc)
    expect(ranges).toContainEqual({ startLine: 1, endLine: 2 })
  })

  it('keeps the env stack balanced when a line has both begin and end', () => {
    // The inline `\begin{x}...\end{x}` must not unbalance the outer fold.
    const doc = '\\begin{outer}\n\\begin{x}a\\end{x}\n\\end{outer}'
    expect(getFoldingRanges(doc)).toContainEqual({ startLine: 1, endLine: 3 })
  })

  it('handles two \\begin on one line', () => {
    const ranges = getFoldingRanges('\\begin{a}\\begin{b}\nx\n\\end{b}\n\\end{a}')
    // outer env (a) must still fold to its \end on line 4
    expect(ranges).toContainEqual({ startLine: 1, endLine: 4 })
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3 })
  })

  it('handles \\end then \\begin on one line as two separate folds', () => {
    // \end{a}\begin{b} on one line: the \end must close a (fold 1..3) and the later
    // \begin must open b for its own \end (fold 3..5) — not one fold spanning both.
    const ranges = getFoldingRanges('\\begin{a}\nx\n\\end{a}\\begin{b}\ny\n\\end{b}')
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3 })
    expect(ranges).toContainEqual({ startLine: 3, endLine: 5 })
  })

  it('handles two \\end on one line', () => {
    const ranges = getFoldingRanges(
      '\\begin{center}\\begin{tabular}\nx\n\\end{tabular}\\end{center}',
    )
    // both environments close on line 3 -> two folds
    expect(ranges.filter((r) => r.startLine === 1 && r.endLine === 3)).toHaveLength(2)
  })

  it('ignores a \\begin/\\end inside a comment', () => {
    const doc = '\\begin{itemize}\n% \\end{itemize}\n\\item a\n\\end{itemize}'
    const ranges = getFoldingRanges(doc)
    expect(ranges).toContainEqual({ startLine: 1, endLine: 4 })
    expect(ranges).not.toContainEqual({ startLine: 1, endLine: 2 })
  })

  it('ignores a \\begin inside a verbatim body (does not consume \\end{verbatim})', () => {
    const doc = '\\begin{verbatim}\n\\begin{foo}\n\\end{verbatim}\ntext'
    expect(getFoldingRanges(doc)).toContainEqual({ startLine: 1, endLine: 3 })
  })

  it('ignores a \\section inside a comment', () => {
    // A commented-out section command is inert LaTeX and must not anchor a fold.
    expect(getFoldingRanges('% \\section{commented}\ntext\nmore')).toEqual([])
  })

  it('ignores a \\section inside a verbatim body', () => {
    const doc = '\\begin{verbatim}\n\\section{inverb}\n\\end{verbatim}\nafter'
    const ranges = getFoldingRanges(doc)
    // The verbatim env fold must remain; the masked \section must not add a fold.
    expect(ranges).toContainEqual({ startLine: 1, endLine: 3 })
    expect(ranges).not.toContainEqual({ startLine: 2, endLine: 4 })
  })
})

describe('getDocumentHighlights', () => {
  it('highlights every occurrence of the symbol under the cursor', () => {
    const index = indexWith({ 'main.tex': '\\label{foo}\n\\ref{foo}' })
    const hl = getDocumentHighlights('main.tex', 1, 8, index) // on the label name
    expect(hl).toHaveLength(2)
    expect(hl.map((r) => r.startLine).sort()).toEqual([1, 2])
  })

  it('returns nothing when no symbol is under the cursor', () => {
    const index = indexWith({ 'main.tex': 'plain text' })
    expect(getDocumentHighlights('main.tex', 1, 3, index)).toEqual([])
  })
})

describe('getWorkspaceSymbols', () => {
  it('finds labels, sections, and commands matching the query', () => {
    const index = indexWith({
      'main.tex': '\\section{Intro}\n\\label{sec:intro}\n\\newcommand{\\foo}{x}',
    })
    expect(
      getWorkspaceSymbols('intro', index)
        .map((s) => s.kind)
        .sort(),
    ).toEqual(['label', 'section'])
    expect(getWorkspaceSymbols('foo', index)[0]).toMatchObject({ kind: 'command', name: 'foo' })
  })
})

describe('getInlayHints', () => {
  it('shows the resolved aux number next to a \\ref', () => {
    const index = new ProjectIndex()
    index.updateAuxData({ labels: new Map([['fig:x', '3.2']]), citations: new Set(), includes: [] })
    const hints = getInlayHints('See \\ref{fig:x} here', index)
    expect(hints).toHaveLength(1)
    expect(hints[0]!.label).toBe(' (3.2)')
  })

  it('does not hint a \\ref inside a comment', () => {
    const index = new ProjectIndex()
    index.updateAuxData({ labels: new Map([['x', '9']]), citations: new Set(), includes: [] })
    const hints = getInlayHints('% \\ref{x}\n\\ref{x}', index)
    expect(hints).toHaveLength(1)
    expect(hints[0]!.line).toBe(2)
  })
})

describe('getDocumentLinks', () => {
  it('links \\input files and \\href/\\url targets', () => {
    const links = getDocumentLinks('\\input{intro}\n\\href{https://x.io}{y}')
    expect(links.find((l) => l.kind === 'file')!.target).toBe('intro')
    expect(links.find((l) => l.kind === 'url')!.target).toBe('https://x.io')
  })

  it('ignores an \\input inside a comment', () => {
    expect(getDocumentLinks('% \\input{secret}\n\\input{real}').map((l) => l.target)).toEqual([
      'real',
    ])
  })

  it('ignores links inside a verbatim environment', () => {
    expect(getDocumentLinks('\\begin{verbatim}\n\\input{v}\n\\end{verbatim}')).toEqual([])
  })
})

describe('getSemanticTokens', () => {
  it('classifies commands, comments, verbatim, and math', () => {
    const types = new Set(
      getSemanticTokens('\\textbf{a} % c\n\\verb|v|\n$\\alpha$').map((t) => t.type),
    )
    expect(types.has('command')).toBe(true)
    expect(types.has('comment')).toBe(true)
    expect(types.has('verbatim')).toBe(true)
    expect(types.has('math')).toBe(true) // \alpha inside $...$
  })

  it('treats \\[ ... \\] and \\( ... \\) contents as math', () => {
    const display = getSemanticTokens('\\[\\alpha + \\beta\\]')
    expect(display.every((t) => t.type === 'math')).toBe(true)
    const inline = getSemanticTokens('text \\(\\gamma\\) text')
    expect(inline.some((t) => t.type === 'math')).toBe(true)
    expect(inline.some((t) => t.type === 'command')).toBe(false) // \gamma is math, not command
  })
})

describe('getCodeActions', () => {
  it('offers a non-breaking-space fix before \\cite', () => {
    const index = indexWith({ 'main.tex': 'see \\cite{a}' })
    const action = getCodeActions('see \\cite{a}', 'main.tex', 1, index).find((a) =>
      a.title.includes('non-breaking'),
    )
    expect(action).toBeDefined()
    expect(action!.edits[0]!.edit.newText).toBe('~')
    expect(action!.edits[0]!.edit.range.startColumn).toBe(4) // the space
  })

  it('offers to add a missing \\usepackage for an unloaded command', () => {
    const doc = '\\documentclass{article}\n\\includegraphics{fig}'
    const index = indexWith({ 'main.tex': doc })
    const action = getCodeActions(doc, 'main.tex', 2, index).find((a) =>
      a.title.includes('usepackage'),
    )
    expect(action).toBeDefined()
    expect(action!.title).toBe('Add \\usepackage{graphicx}')
  })

  it('offers to create a label for an undefined \\ref', () => {
    const index = indexWith({ 'main.tex': '\\ref{missing}' })
    const action = getCodeActions('\\ref{missing}', 'main.tex', 1, index).find((a) =>
      a.title.includes('Create'),
    )
    expect(action).toBeDefined()
    expect(action!.edits[0]!.edit.newText).toContain('\\label{missing}')
  })
})
