import { describe, expect, it } from 'vitest'
import { ProjectIndex } from '../project-index'
import { createDocumentSymbolProvider } from '../symbol-provider'
import { mockModel } from './test-helpers'

describe('createDocumentSymbolProvider', () => {
  // biome-ignore lint/suspicious/noExplicitAny: Monaco types too complex to fully mock
  function symbols(provider: any, model: any): any[] {
    return provider.provideDocumentSymbols(model)
  }

  it('returns sections as top-level symbols', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\section{Introduction}\n\\section{Methods}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(2)
    expect(result[0].name).toBe('Introduction')
    expect(result[1].name).toBe('Methods')
  })

  it('nests subsections under sections', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\section{Intro}\n\\subsection{Background}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('Intro')
    expect(result[0].children.length).toBe(1)
    expect(result[0].children[0].name).toBe('Background')
  })

  it('includes labels as symbols', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\label{fig:1}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('\\label{fig:1}')
    expect(result[0].detail).toBe('label')
  })

  it('includes commands as symbols', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\newcommand{\\myfunc}{body}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('\\myfunc')
    expect(result[0].detail).toBe('command')
  })

  it('includes environments as symbols', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\begin{theorem}\n\\end{theorem}')

    const result = symbols(provider, mockModel())

    // biome-ignore lint/suspicious/noExplicitAny: test helper
    expect(result.some((s: any) => s.name === 'theorem')).toBe(true)
  })

  it('returns empty for unknown file', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    const result = symbols(provider, mockModel([], 'unknown.tex'))

    expect(result).toEqual([])
  })

  it('nests labels under their parent section', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\section{Results}\n\\label{sec:results}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('Results')
    expect(result[0].children.length).toBe(1)
    expect(result[0].children[0].name).toBe('\\label{sec:results}')
  })

  it('handles deep nesting: section > subsection > subsubsection', () => {
    const index = new ProjectIndex()
    const provider = createDocumentSymbolProvider(index)

    index.updateFile('main.tex', '\\section{A}\n\\subsection{B}\n\\subsubsection{C}')

    const result = symbols(provider, mockModel())

    expect(result.length).toBe(1)
    expect(result[0].name).toBe('A')
    expect(result[0].children[0].name).toBe('B')
    expect(result[0].children[0].children[0].name).toBe('C')
  })
})
