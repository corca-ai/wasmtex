import type * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { createDefinitionProvider } from '../definition-provider'
import { ProjectIndex } from '../project-index'
import { type MockModel, mockModel } from './test-helpers'

interface DefinitionLocation {
  uri: { path: string }
}

describe('createDefinitionProvider', () => {
  const index = new ProjectIndex()
  const provider = createDefinitionProvider(index)

  function define(model: MockModel, line: number, col: number): DefinitionLocation {
    return provider.provideDefinition(
      model as unknown as monaco.editor.ITextModel,
      { lineNumber: line, column: col } as unknown as monaco.Position,
      undefined as unknown as monaco.CancellationToken,
    ) as unknown as DefinitionLocation
  }

  it('provides definition for \\input with .tex extension', () => {
    index.updateFile('sub.tex', 'content')
    const model = mockModel(['\\input{sub.tex}'])
    const result = define(model, 1, 8)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/sub.tex')
  })

  it('provides definition for \\input without .tex extension', () => {
    index.updateFile('sub.tex', 'content')
    const model = mockModel(['\\input{sub}'])
    const result = define(model, 1, 8)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/sub.tex')
  })

  it('resolves relative paths for \\input', () => {
    index.updateFile('chapters/intro.tex', 'content')
    const model = mockModel(['\\input{intro.tex}'], 'chapters/main.tex')
    const result = define(model, 1, 8)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/chapters/intro.tex')
  })

  it('provides definition when cursor is on the command itself', () => {
    index.updateFile('sub.tex', 'content')
    const model = mockModel(['\\input{sub.tex}'])
    const result = define(model, 1, 3)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/sub.tex')
  })

  it('returns fallback if file not in index', () => {
    const model = mockModel(['\\input{missing.tex}'])
    const result = define(model, 1, 8)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/missing.tex')
  })

  it('keeps a non-.tex extension in the unindexed-file fallback (does not append .tex)', () => {
    // \input loads the EXACT file given. Forcing `.tex` made the fallback navigate to the
    // bogus `macros.sty.tex` for an unindexed `macros.sty`. Only EXTENSIONLESS targets get
    // `.tex` appended (mirroring the LinkProvider in language-feature-providers).
    const model = mockModel(['\\input{macros.sty}'])
    const result = define(model, 1, 8)
    expect(result).toBeDefined()
    expect(result.uri.path).toBe('/macros.sty')
  })

  it('resolves the key under the cursor in a multi-key \\cite{a,b}', () => {
    index.updateBib([
      { key: 'alpha', type: 'book', location: { file: 'refs.bib', line: 2, column: 1 } },
      { key: 'beta', type: 'book', location: { file: 'refs.bib', line: 8, column: 1 } },
    ])
    const model = mockModel(['\\cite{alpha,beta}'])
    // cursor on 'beta' (1-based column ~14); whole-arg lookup of 'alpha,beta' would fail.
    const result = define(model, 1, 14)
    expect(result).toBeDefined()
    expect(
      (result as unknown as { range: { startLineNumber: number } }).range.startLineNumber,
    ).toBe(8)
  })

  it('resolves the first key when the cursor is on the command word of a multi-key \\cite{a,b}', () => {
    index.updateBib([
      { key: 'alpha', type: 'book', location: { file: 'refs.bib', line: 2, column: 1 } },
      { key: 'beta', type: 'book', location: { file: 'refs.bib', line: 8, column: 1 } },
    ])
    const model = mockModel(['\\cite{alpha,beta}'])
    const result = define(model, 1, 3) // column 3 -> on the letters of 'cite'
    expect(result).toBeDefined()
    expect(
      (result as unknown as { range: { startLineNumber: number } }).range.startLineNumber,
    ).toBe(2) // resolves to first key 'alpha'
  })

  it('resolves the second of two adjacent commands when the cursor is on its backslash', () => {
    // `\aaa\bbb` with the caret on the SECOND backslash (1-based column 5) must resolve to
    // \bbb, not \aaa. The shared boundary column belongs to the right-hand command — matching
    // the end-exclusive contract of the editor-neutral findAtCol in neutral-providers.ts.
    index.updateFile('a.tex', '\\newcommand{\\aaa}{A}')
    index.updateFile('b.tex', '\\newcommand{\\bbb}{B}')
    const model = mockModel(['\\aaa\\bbb'])
    expect(define(model, 1, 5).uri.path).toBe('/b.tex')
    // Guard: a caret inside the first command still resolves left.
    expect(define(model, 1, 2).uri.path).toBe('/a.tex')
  })
})
