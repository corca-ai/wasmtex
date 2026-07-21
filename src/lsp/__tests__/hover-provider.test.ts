import type * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { createHoverProvider } from '../hover-provider'
import { ProjectIndex } from '../project-index'

interface MockModel {
  getLineContent(lineNumber: number): string
}

interface HoverResult {
  contents: Array<{ value: string }>
}

function mockModel(lines: string[]): MockModel {
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
  }
}

function getHover(
  provider: ReturnType<typeof createHoverProvider>,
  model: MockModel,
  line: number,
  col: number,
): HoverResult | null {
  return provider.provideHover!(
    model as unknown as monaco.editor.ITextModel,
    { lineNumber: line, column: col } as unknown as monaco.Position,
    undefined as unknown as monaco.CancellationToken,
  ) as HoverResult | null
}

describe('createHoverProvider', () => {
  it('shows the argument signature and source package for a bundled command', () => {
    const provider = createHoverProvider(new ProjectIndex())
    const hover = getHover(provider, mockModel(['\\dfrac{a}{b}']), 1, 3)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values.some((v) => v.includes('\\dfrac{}{}'))).toBe(true) // 2 required args
    expect(values.some((v) => v.includes('amsmath'))).toBe(true)
  })

  it('shows arg count for macros with args', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['myfrac\t113\t2'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\myfrac']), 1, 2)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('Package macro')
    expect(values[1]).toBe('Arguments: 2')
  })

  it('shows "Arguments: none" for 0-arg macros', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['mypar\t113\t0'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\mypar']), 1, 2)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('Package macro')
    expect(values[1]).toBe('Arguments: none')
  })

  it('does not show arg info for primitives', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['myprim\t21\t-1'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\myprim']), 1, 2)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('TeX primitive')
    expect(values).toHaveLength(1)
  })

  it('shows arg count for engine environments', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['mytab\t113\t1', 'endmytab\t113\t0'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\begin{mytab}']), 1, 9)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('Package environment')
    expect(values[1]).toBe('Arguments: 1')
  })

  it('enriches static DB command hover with engine arg count', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['frac\t113\t2'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\frac']), 1, 2)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('frac')
    expect(values.some((c) => c === 'Arguments: 2')).toBe(true)
  })

  it('enriches static DB environment hover with engine arg count', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['tabular\t113\t1', 'endtabular\t113\t0'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\begin{tabular}']), 1, 9)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('tabular')
    expect(values.some((c) => c === 'Arguments: 1')).toBe(true)
  })

  it('no arg line for engine env with unknown arg count', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['myenv', 'endmyenv'])
    const provider = createHoverProvider(index)
    const hover = getHover(provider, mockModel(['\\begin{myenv}']), 1, 9)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values[0]).toContain('Package environment')
    expect(values).toHaveLength(1)
  })

  it('shows the bibliography preview when hovering a cite key with an optional argument', () => {
    const index = new ProjectIndex()
    index.updateBib([
      {
        key: 'knuth',
        type: 'book',
        location: { file: 'refs.bib', line: 1, column: 1 },
        author: 'Knuth',
        year: '1984',
        title: 'TeX',
      },
    ])
    const provider = createHoverProvider(index)
    // Column 13 (1-based) is the 'n' in 'knuth' inside `\cite[p.5]{knuth}`.
    const hover = getHover(provider, mockModel(['\\cite[p.5]{knuth}']), 1, 13)
    expect(hover).not.toBeNull()
    const values = hover!.contents.map((c) => c.value)
    expect(values.some((v) => v.includes('**[knuth]** book'))).toBe(true)
    expect(values.some((v) => v.includes('Knuth (1984). *TeX*'))).toBe(true)
  })
})
