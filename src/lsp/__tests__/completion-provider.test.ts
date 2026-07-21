import type * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { VirtualFS } from '../../fs/virtual-fs'
import { createCompletionProvider } from '../completion-provider'
import { ProjectIndex } from '../project-index'

interface MockModel {
  getLineContent(lineNumber: number): string
  uri: { path: string }
}

interface Suggestion {
  label: string
  detail?: string
  insertText?: string
  insertTextRules?: number
  sortText?: string
}

interface CompletionResult {
  suggestions: Suggestion[]
}

function mockModel(lines: string[]): MockModel {
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    uri: { path: '/main.tex' },
  }
}

function complete(
  provider: ReturnType<typeof createCompletionProvider>,
  model: MockModel,
  line: number,
  col: number,
): CompletionResult {
  return provider.provideCompletionItems(
    model as unknown as monaco.editor.ITextModel,
    { lineNumber: line, column: col } as unknown as monaco.Position,
    undefined as unknown as monaco.languages.CompletionContext,
    undefined as unknown as monaco.CancellationToken,
  ) as CompletionResult
}

describe('createCompletionProvider', () => {
  const index = new ProjectIndex()
  const fs = new VirtualFS({ empty: true })
  fs.writeFile('main.tex', '')
  fs.writeFile('chapters/intro.tex', '')
  const provider = createCompletionProvider(index, fs)

  it('provides command completions after backslash', () => {
    const result = complete(provider, mockModel(['\\fra']), 1, 5)
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s) => s.label === '\\frac')).toBe(true)
  })

  it('provides only matching commands', () => {
    const result = complete(provider, mockModel(['\\sec']), 1, 5)
    for (const s of result.suggestions) {
      expect((s.label as string).startsWith('\\sec')).toBe(true)
    }
  })

  it('ranks a loaded package command as available', () => {
    const idx = new ProjectIndex()
    idx.updateFile('main.tex', '\\usepackage{amsmath}')
    const fs2 = new VirtualFS({ empty: true })
    fs2.writeFile('main.tex', '\\usepackage{amsmath}')
    const result = complete(createCompletionProvider(idx, fs2), mockModel(['\\dfra']), 1, 6)
    const dfrac = result.suggestions.find((s) => s.label === '\\dfrac')
    expect(dfrac).toBeDefined()
    expect(dfrac!.sortText).toMatch(/^0a_/) // amsmath loaded
  })

  it('lower-ranks a command whose package is not loaded', () => {
    const idx = new ProjectIndex()
    idx.updateFile('main.tex', 'no packages here')
    const fs2 = new VirtualFS({ empty: true })
    fs2.writeFile('main.tex', 'no packages here')
    const result = complete(createCompletionProvider(idx, fs2), mockModel(['\\dfra']), 1, 6)
    const dfrac = result.suggestions.find((s) => s.label === '\\dfrac')
    expect(dfrac).toBeDefined()
    expect(dfrac!.sortText).toMatch(/^0b_/) // amsmath not loaded
  })

  it('provides label completions after \\ref{', () => {
    index.updateFile('main.tex', '\\label{fig:arch}\n\\label{eq:euler}')
    const result = complete(provider, mockModel(['\\ref{']), 1, 6)
    expect(result.suggestions).toHaveLength(2)
    expect(result.suggestions.map((s) => s.label).sort()).toEqual(['eq:euler', 'fig:arch'])
  })

  it('filters label completions by prefix', () => {
    index.updateFile('main.tex', '\\label{fig:one}\n\\label{fig:two}\n\\label{eq:three}')
    const result = complete(provider, mockModel(['\\ref{fig:']), 1, 10)
    expect(result.suggestions).toHaveLength(2)
  })

  it('provides resolved label info from .aux', () => {
    index.updateFile('main.tex', '\\label{sec:intro}')
    index.updateAux('\\newlabel{sec:intro}{{1}{1}}')
    const result = complete(provider, mockModel(['\\ref{']), 1, 6)
    const s = result.suggestions.find((s) => s.label === 'sec:intro')
    expect(s).toBeDefined()
    expect(s!.detail).toContain('[1]')
  })

  it('provides citation completions after \\cite{', () => {
    index.updateAux('\\bibcite{knuth84}{1}\n\\bibcite{lamport94}{2}')
    const result = complete(provider, mockModel(['\\cite{']), 1, 7)
    expect(result.suggestions.length).toBeGreaterThanOrEqual(2)
  })

  it('provides environment completions after \\begin{', () => {
    const result = complete(provider, mockModel(['\\begin{eq']), 1, 10)
    expect(result.suggestions.some((s) => s.label === 'equation')).toBe(true)
  })

  it('provides package completions after \\usepackage{', () => {
    const result = complete(provider, mockModel(['\\usepackage{ams']), 1, 16)
    expect(result.suggestions.some((s) => s.label === 'amsmath')).toBe(true)
    expect(result.suggestions.some((s) => s.label === 'amssymb')).toBe(true)
  })

  it('provides file completions after \\input{', () => {
    const result = complete(provider, mockModel(['\\input{']), 1, 8)
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1)
  })

  it('provides user-defined command completions', () => {
    index.updateFile('macros.tex', '\\newcommand{\\myop}{\\operatorname{myop}}')
    const result = complete(provider, mockModel(['\\my']), 1, 4)
    expect(result.suggestions.some((s) => s.label === '\\myop')).toBe(true)
  })

  it('returns empty for no context', () => {
    const result = complete(provider, mockModel(['just plain text']), 1, 10)
    expect(result.suggestions).toHaveLength(0)
  })

  it('handles \\cite with optional arg', () => {
    index.updateAux('\\bibcite{ref1}{1}')
    const result = complete(provider, mockModel(['\\cite[p.~5]{']), 1, 13)
    expect(result.suggestions.some((s) => s.label === 'ref1')).toBe(true)
  })

  it('handles comma in \\cite{a,', () => {
    index.updateAux('\\bibcite{alpha}{1}\n\\bibcite{beta}{2}')
    const result = complete(provider, mockModel(['\\cite{alpha,']), 1, 13)
    expect(result.suggestions.length).toBeGreaterThanOrEqual(2)
  })

  it('shows categorized engine commands', () => {
    index.updateEngineCommands(['mymacro\t113\t0', 'hbox\t21\t-1', 'oldcmd'])
    const result = complete(provider, mockModel(['\\']), 1, 2)
    const macro = result.suggestions.find((s) => s.label === '\\mymacro')
    const prim = result.suggestions.find((s) => s.label === '\\hbox')
    const unknown = result.suggestions.find((s) => s.label === '\\oldcmd')
    expect(macro?.detail).toBe('Package macro')
    expect(prim?.detail).toBe('TeX primitive')
    expect(unknown?.detail).toBe('Package command')
  })

  it('generates snippet completions for macros with args', () => {
    index.updateEngineCommands(['myfrac\t113\t2', 'mysqrt\t113\t1', 'mypar\t113\t0'])
    const result = complete(provider, mockModel(['\\my']), 1, 4)
    const frac = result.suggestions.find((s) => s.label === '\\myfrac')
    expect(frac).toBeDefined()
    expect(frac!.insertText).toBe('myfrac{$1}{$2}')
    expect(frac!.insertTextRules).toBe(4) // InsertAsSnippet
    expect(frac!.detail).toBe('Package macro (2 args)')

    const sqrt = result.suggestions.find((s) => s.label === '\\mysqrt')
    expect(sqrt).toBeDefined()
    expect(sqrt!.insertText).toBe('mysqrt{$1}')
    expect(sqrt!.insertTextRules).toBe(4)
    expect(sqrt!.detail).toBe('Package macro (1 arg)')

    const par = result.suggestions.find((s) => s.label === '\\mypar')
    expect(par).toBeDefined()
    expect(par!.insertText).toBe('mypar')
    expect(par!.insertTextRules).toBeUndefined()
    expect(par!.detail).toBe('Package macro')
  })

  it('shows arg count in engine environment detail', () => {
    index.updateEngineCommands(['mytab\t113\t1', 'endmytab\t113\t0'])
    const result = complete(provider, mockModel(['\\begin{my']), 1, 10)
    const mytab = result.suggestions.find(
      (s) => s.label === 'mytab' && s.detail?.includes('Package environment'),
    )
    expect(mytab).toBeDefined()
    expect(mytab!.detail).toBe('Package environment (1 arg)')
  })

  it('provides engine environment completions in \\begin{', () => {
    index.updateEngineCommands(['myenv', 'endmyenv', 'myother', 'endmyother'])
    const result = complete(provider, mockModel(['\\begin{my']), 1, 10)
    const myenv = result.suggestions.find(
      (s) => s.label === 'myenv' && s.detail === 'Package environment',
    )
    expect(myenv).toBeDefined()
    expect(myenv!.sortText).toBe('2_myenv')
  })

  it('deduplicates engine environments with static environments', () => {
    index.updateEngineCommands(['equation', 'endequation'])
    const result = complete(provider, mockModel(['\\begin{eq']), 1, 10)
    const equations = result.suggestions.filter((s) => s.label === 'equation')
    // Should only appear once (from static DB, not duplicated by engine)
    expect(equations).toHaveLength(1)
  })
})
