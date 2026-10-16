import { describe, expect, it } from 'vitest'
import { normalizeNavigationText, normalizeVisibleText } from './visible-text-normalize'

describe('visible text normalization preserves source coordinates', () => {
  it('collapses whitespace while keeping original UTF-16 spans', () => {
    const source = '  Alpha\n  beta  '
    const view = normalizeNavigationText(source)
    expect(view.text).toBe('alpha beta')
    expect(source.slice(view.starts[5], view.ends[5])).toBe('\n  ')
    expect(source.slice(view.starts[6], view.ends[9])).toBe('beta')
  })

  it('maps ligature expansion, composed accents, Korean and surrogate pairs', () => {
    const source = 'ﬃ e\u0301 선형 😀'
    const view = normalizeNavigationText(source)
    expect(view.text).toBe('ffi é 선형 😀')
    expect([...view.starts.slice(0, 3)]).toEqual([0, 0, 0])
    expect([...view.ends.slice(0, 3)]).toEqual([1, 1, 1])
    expect(source.slice(view.starts[4], view.ends[4])).toBe('e\u0301')
    const emoji = view.text.indexOf('😀')
    expect(source.slice(view.starts[emoji], view.ends[emoji + 1])).toBe('😀')
    expect(view.starts.length).toBe(view.text.length)
  })

  it('retains original invocations for rendered symbols and punctuation', () => {
    const view = normalizeVisibleText([
      { text: '&', start: 8, end: 10 },
      { text: '—', start: 10, end: 13 },
    ])
    expect(view.text).toBe('&—')
    expect([...view.starts]).toEqual([8, 10])
    expect([...view.ends]).toEqual([10, 13])
    expect(normalizeNavigationText('  \u00ad ').text).toBe('')
  })
})
