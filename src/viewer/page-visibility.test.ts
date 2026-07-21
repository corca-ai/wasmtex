import { describe, expect, it } from 'vitest'
import { pickMostVisiblePage } from './page-visibility'

describe('pickMostVisiblePage', () => {
  it('picks the page with the greatest visible height', () => {
    expect(
      pickMostVisiblePage(
        new Map([
          [1, 100],
          [2, 300],
          [3, 50],
        ]),
      ),
    ).toBe(2)
  })

  it('works when no page reaches half visibility (pages taller than the viewport)', () => {
    // Both pages are taller than the viewport (ratio < 0.5 for both); page 2 shows more.
    expect(
      pickMostVisiblePage(
        new Map([
          [1, 200],
          [2, 250],
        ]),
      ),
    ).toBe(2)
  })

  it('breaks ties toward the smaller page number', () => {
    expect(
      pickMostVisiblePage(
        new Map([
          [2, 100],
          [1, 100],
        ]),
      ),
    ).toBe(1)
  })

  it('returns null when nothing is visible', () => {
    expect(pickMostVisiblePage(new Map())).toBeNull()
    expect(
      pickMostVisiblePage(
        new Map([
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toBeNull()
  })
})
