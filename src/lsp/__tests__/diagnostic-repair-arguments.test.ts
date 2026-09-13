import { describe, expect, it } from 'vitest'
import { consumeRepairArguments } from '../diagnostic-repair-arguments'
import { parseLatexFile } from '../latex-parser'
import { getCommandSignature } from '../package-db'
import { getStructuralSelectionIndex } from '../structural-selection'

function consume(source: string, name: string) {
  const index = getStructuralSelectionIndex(parseLatexFile(source, 'main.tex'))!
  const token = index.commands.find((token) => token.value === name)!
  return consumeRepairArguments(
    source,
    index,
    new Map(index.commands.map((token) => [token.start, token])),
    token.end,
    getCommandSignature(name)!,
  )
}

describe('source-backed required argument consumption', () => {
  it('accepts unbraced tokens and omitted optional arguments', () => {
    for (const source of [String.raw`\frac12`, String.raw`\frac1{2}`, String.raw`\frac{1}2`])
      expect(consume(source, 'frac')?.missing).toEqual([])
    expect(consume(String.raw`\sqrt x`, 'sqrt')?.missing).toEqual([])
    expect(consume(String.raw`\sqrt[3]{x}`, 'sqrt')?.missing).toEqual([])
  })

  it('reports only required empty slots at a proven end of input or closing group', () => {
    expect(consume(String.raw`{\frac{x}}`, 'frac')).toMatchObject({
      missing: [{ kind: 'required', placeholder: 'denominator' }],
      insertOffset: 9,
    })
    expect(consume(String.raw`\frac`, 'frac')?.missing).toHaveLength(2)
    expect(consume(String.raw`\sqrt[3]`, 'sqrt')?.missing).toHaveLength(1)
  })

  it('does not expand a command token while gathering another command arguments', () => {
    const result = consume(String.raw`\frac\sqrt{x}`, 'frac')
    expect(result?.missing).toEqual([])
    expect(result?.arguments[0]).toMatchObject({ commandOffset: 5, start: 5, end: 10 })
    expect(result?.arguments[1]).toMatchObject({ start: 10, end: 13, grouped: true })
    expect(consume(String.raw`\frac{a}\sqrt`, 'frac')?.arguments[1]?.commandOffset).toBe(8)
  })

  it('keeps nested groups intact and ignores comment text while preserving command tokens', () => {
    expect(consume(String.raw`\frac{{a}{b}}{c}`, 'frac')?.missing).toEqual([])
    const source = '\\frac{a}% a comment with } and \\sqrt\n'
    expect(consume(source, 'frac')).toMatchObject({
      insertOffset: 8,
      missing: [{ kind: 'required' }],
    })
    expect(consume(String.raw`\frac{a}\verb|x|`, 'frac')?.missing).toEqual([])
    expect(consume(String.raw`\frac{a}\iffalse b\fi`, 'frac')?.missing).toEqual([])
  })

  it('refuses incomplete groups, paragraphs, math shifts and active or ambiguous tokens', () => {
    for (const source of [
      String.raw`\frac{a`,
      String.raw`\frac{a}$`,
      '\\frac{a}\n\n',
      String.raw`\frac{a}~`,
      String.raw`\frac{a}한`,
    ])
      expect(consume(source, 'frac')).toBeNull()
    expect(consume(String.raw`\sqrt[3`, 'sqrt')).toBeNull()
  })
})
