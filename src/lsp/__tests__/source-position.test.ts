import { describe, expect, it } from 'vitest'
import { buildLineStarts, offsetToLineCol } from '../source-position'

describe('buildLineStarts', () => {
  it('records the offset after each newline (line 0 starts at 0)', () => {
    expect(buildLineStarts('a\nbb\n\nc')).toEqual([0, 2, 5, 6])
  })
})

describe('offsetToLineCol', () => {
  const starts = buildLineStarts('a\nbb\nccc')

  it('maps offsets to 1-based line/column', () => {
    expect(offsetToLineCol(starts, 0)).toEqual({ line: 1, column: 1 })
    expect(offsetToLineCol(starts, 2)).toEqual({ line: 2, column: 1 }) // first char of line 2
    expect(offsetToLineCol(starts, 6)).toEqual({ line: 3, column: 2 })
  })

  it('clamps a negative offset to the start, never returning column ≤ 0', () => {
    expect(offsetToLineCol(starts, -5)).toEqual({ line: 1, column: 1 })
  })

  it('keeps an over-large offset on the last line with a 1-based column', () => {
    const pos = offsetToLineCol(starts, 999)
    expect(pos.line).toBe(3)
    expect(pos.column).toBeGreaterThanOrEqual(1)
  })
})
