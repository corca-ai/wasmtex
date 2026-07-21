import type * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { ProjectIndex } from '../project-index'
import { createReferenceProvider } from '../reference-provider'
import { type MockModel, mockModel } from './test-helpers'

describe('createReferenceProvider', () => {
  type ReferenceLocations = monaco.languages.Location[]

  function refs(
    provider: ReturnType<typeof createReferenceProvider>,
    model: MockModel,
    line: number,
    col: number,
  ): ReferenceLocations {
    return provider.provideReferences(
      model as unknown as monaco.editor.ITextModel,
      { lineNumber: line, column: col } as unknown as monaco.Position,
      undefined as unknown as monaco.languages.ReferenceContext,
      undefined as unknown as monaco.CancellationToken,
    ) as unknown as ReferenceLocations
  }

  it('finds all refs for a \\label definition', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\label{fig:a}\n\\ref{fig:a}')
    index.updateFile('other.tex', '\\ref{fig:a}')

    const model = mockModel(['\\label{fig:a}', '\\ref{fig:a}'])
    const result = refs(provider, model, 1, 9)

    // \label{fig:a} -> finds all \ref{fig:a} usages
    expect(result.length).toBe(2)
  })

  it('finds definition + all refs for a \\ref command', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\label{sec:1}\n\\ref{sec:1}')
    index.updateFile('other.tex', '\\ref{sec:1}')

    const model = mockModel(['\\label{sec:1}', '\\ref{sec:1}'])
    const result = refs(provider, model, 2, 7)

    // \ref{sec:1} -> label def + all refs
    expect(result.length).toBe(3)
  })

  it('returns empty for plain text', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', 'Hello world')

    const model = mockModel(['Hello world'])
    const result = refs(provider, model, 1, 3)

    expect(result).toEqual([])
  })

  it('finds the definition and every call site of a user command', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\newcommand{\\myfunc}{body}\n\\myfunc and \\myfunc')

    const model = mockModel(['\\newcommand{\\myfunc}{body}', '\\myfunc and \\myfunc'])
    const result = refs(provider, model, 1, 15) // cursor on the definition's name

    // definition token + 2 call sites
    expect(result.length).toBe(3)
  })

  it('does not treat a builtin command as a renamable/referencable symbol', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\textbf{hi} and \\textbf{bye}')

    const model = mockModel(['\\textbf{hi} and \\textbf{bye}'])
    // \textbf has no user definition → not a tracked symbol.
    expect(refs(provider, model, 1, 3)).toEqual([])
  })

  it('handles \\eqref as a ref command', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\label{eq:1}\n\\eqref{eq:1}')

    const model = mockModel(['\\label{eq:1}', '\\eqref{eq:1}'])
    const result = refs(provider, model, 2, 10)

    // eqref -> label def + this eqref ref
    expect(result.length).toBeGreaterThanOrEqual(2)
  })

  it('finds all references for a citation key (cite sites + bib entry)', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('main.tex', '\\cite{knuth84}')
    index.updateFile('ch.tex', '\\cite{knuth84}')
    index.updateBib([
      { key: 'knuth84', type: 'article', location: { file: 'refs.bib', line: 1, column: 1 } },
    ])

    const model = mockModel(['\\cite{knuth84}'])
    // cursor inside the key (1-based column ~8)
    const result = refs(provider, model, 1, 8)

    // two \cite sites + the bib entry
    expect(result.length).toBe(3)
  })

  it('returns refs from multiple files', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    index.updateFile('a.tex', '\\label{tbl:1}')
    index.updateFile('b.tex', '\\ref{tbl:1}')
    index.updateFile('c.tex', '\\ref{tbl:1}')

    const model = mockModel(['\\label{tbl:1}'], 'a.tex')
    const result = refs(provider, model, 1, 9)

    expect(result.length).toBe(2)
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    const files = result.map((r: any) => r.uri.path)
    expect(files).toContain('/b.tex')
    expect(files).toContain('/c.tex')
  })

  it('trims whitespace inside \\label{ name } when finding references', () => {
    const index = new ProjectIndex()
    const provider = createReferenceProvider(index)

    // The index stores the trimmed label/ref name; the provider must trim too,
    // or `\label{ fig:a }` matches none of the `\ref{fig:a}` usages.
    index.updateFile('main.tex', '\\label{ fig:a }\n\\ref{fig:a}')
    index.updateFile('other.tex', '\\ref{fig:a}')

    const model = mockModel(['\\label{ fig:a }', '\\ref{fig:a}'])
    const result = refs(provider, model, 1, 10) // cursor inside the spaced label name

    expect(result.length).toBe(2)
  })
})
