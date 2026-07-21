import { describe, expect, it } from 'vitest'
import type { FontGlyphGap } from '../types'
import { SCRIPT_FONTS } from './font-scripts'
import { enrichGlyphSuggestions } from './glyph-suggestions'

describe('enrichGlyphSuggestions (#89 L1b)', () => {
  it('suggests mirror fonts that cover the gap script (Hangul → Korean fonts)', () => {
    const gaps: FontGlyphGap[] = [
      {
        font: 'HaranoAjiMincho-Regular.otf',
        script: 'Hangul',
        codepoints: [0xc548],
        count: 1,
        sample: '안',
      },
    ]
    enrichGlyphSuggestions(gaps)
    expect(gaps[0]!.suggestions?.length).toBeGreaterThan(0)
    expect(gaps[0]!.suggestions).toEqual(SCRIPT_FONTS.Hangul) // the JP font isn't in the Hangul set
  })

  it('never suggests the gap font itself', () => {
    const own = SCRIPT_FONTS.Hangul![0]! // a real Korean font from the catalog
    const gaps: FontGlyphGap[] = [
      { font: own, script: 'Hangul', codepoints: [0xc548], count: 1, sample: '안' },
    ]
    enrichGlyphSuggestions(gaps)
    expect(gaps[0]!.suggestions ?? []).not.toContain(own)
  })

  it('leaves suggestions unset for an unknown / undetected script', () => {
    const gaps: FontGlyphGap[] = [{ font: 'X.otf', codepoints: [0x41], count: 1, sample: 'A' }]
    enrichGlyphSuggestions(gaps)
    expect(gaps[0]!.suggestions).toBeUndefined()
  })

  it('every catalog script maps to a non-empty font list', () => {
    for (const [script, fonts] of Object.entries(SCRIPT_FONTS)) {
      expect(fonts.length, script).toBeGreaterThan(0)
    }
  })
})
