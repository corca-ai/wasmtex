import { describe, expect, it } from 'vitest'
import {
  chooseBoundary,
  findPageBreaks,
  firstDifference,
  hashString,
  includePositions,
  splitAtBoundary,
} from './checkpoint-boundaries'

describe('findPageBreaks (#55)', () => {
  it('finds offsets just after each page-break command', () => {
    const src = 'A\\clearpage B\\newpage C\\cleardoublepage D'
    const breaks = findPageBreaks(src)
    expect(breaks).toHaveLength(3)
    // each offset is right after the command name
    expect(src.slice(0, breaks[0]).endsWith('\\clearpage')).toBe(true)
    expect(src.slice(0, breaks[1]).endsWith('\\newpage')).toBe(true)
    expect(src.slice(0, breaks[2]).endsWith('\\cleardoublepage')).toBe(true)
  })

  it('ignores commented-out page breaks', () => {
    const src = 'A\nreal text % \\clearpage in a comment\nmore\n\\newpage\nB'
    const breaks = findPageBreaks(src)
    expect(breaks).toHaveLength(1)
    expect(src.slice(0, breaks[0]).endsWith('\\newpage')).toBe(true)
  })

  it('does not match \\clearpagefoo (word boundary)', () => {
    expect(findPageBreaks('\\clearpagefoo')).toEqual([])
  })

  it('does not treat an escaped \\% as a comment', () => {
    const src = '50\\% complete \\clearpage rest' // \% is a literal percent, not a comment
    expect(findPageBreaks(src)).toHaveLength(1)
  })

  it('returns empty for a document with no page breaks', () => {
    expect(findPageBreaks('\\section{A} text \\section{B} text')).toEqual([])
  })

  it('treats \\include{...} as a page break (it forces \\clearpage)', () => {
    const src = 'pre \\include{ch1} mid \\include{ch2} end'
    const breaks = findPageBreaks(src)
    expect(breaks).toHaveLength(2)
    expect(src.slice(0, breaks[0]).endsWith('\\include{ch1}')).toBe(true)
    expect(src.slice(0, breaks[1]).endsWith('\\include{ch2}')).toBe(true)
  })
})

describe('includePositions (#55 multi-file)', () => {
  it('maps each include/input target name to its command offset', () => {
    const src = '\\include{ch1}\n\\input{intro.tex}\n\\include{parts/ch2}'
    const pos = includePositions(src)
    expect(pos.get('ch1')).toBe(0)
    expect(pos.get('intro')).toBe(src.indexOf('\\input')) // .tex stripped
    expect(pos.get('parts/ch2')).toBe(src.indexOf('\\include{parts/ch2}'))
  })

  it('ignores commented-out includes', () => {
    expect(includePositions('% \\include{skip}\n\\include{real}').get('skip')).toBeUndefined()
  })
})

describe('firstDifference (#55)', () => {
  it('returns the first divergent index', () => {
    expect(firstDifference('abcdef', 'abcXef')).toBe(3)
  })
  it('returns the shorter length when one is a prefix', () => {
    expect(firstDifference('abc', 'abcdef')).toBe(3)
    expect(firstDifference('abcdef', 'abc')).toBe(3)
  })
  it('returns length for equal strings', () => {
    expect(firstDifference('abc', 'abc')).toBe(3)
  })
})

describe('chooseBoundary (#55)', () => {
  it('picks the latest boundary at or before the edit', () => {
    expect(chooseBoundary([10, 50, 90], 60)).toBe(50)
  })
  it('respects the minimum head size', () => {
    expect(chooseBoundary([10, 50, 90], 60, 30)).toBe(50)
    expect(chooseBoundary([10, 20], 60, 30)).toBeNull() // both too early
  })
  it('returns null when no boundary is before the edit', () => {
    expect(chooseBoundary([90, 120], 60)).toBeNull()
  })
  it('returns null with no boundaries', () => {
    expect(chooseBoundary([], 60)).toBeNull()
  })
})

describe('splitAtBoundary (#55)', () => {
  it('splits head (incl. break) from tail', () => {
    const src = 'head stuff\\clearpage tail stuff'
    const offset = findPageBreaks(src)[0]!
    const { headText, tailText } = splitAtBoundary(src, offset)
    expect(headText).toBe('head stuff\\clearpage')
    expect(tailText).toBe(' tail stuff')
    expect(headText + tailText).toBe(src)
  })
})

describe('hashString (#55)', () => {
  it('is stable and differs for different content', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(hashString('abc')).not.toBe(hashString('abd'))
  })
})
