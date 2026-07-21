import { describe, expect, it } from 'vitest'
import {
  clampScale,
  computeRestoredScrollTop,
  computeTargetOffsetTop,
  MAX_SCALE,
  MIN_SCALE,
  rescaleInPageOffset,
} from './scale'

describe('computeTargetOffsetTop', () => {
  // 3 uniform pages: intrinsic width 400, aspect-ratio "400 / 600" → 600px tall at scale 1.
  const sizes = [
    { width: 400, aspectRatio: '400 / 600' },
    { width: 400, aspectRatio: '400 / 600' },
    { width: 400, aspectRatio: '400 / 600' },
  ]

  it('sums the NEW-scale heights of pages before the visible page', () => {
    // Page 2 at scale 3 sits below one 1800px-tall page — NOT the stale-scale 900 the live
    // offsetTop would report before renderRemainingPages rescales page 1.
    expect(computeTargetOffsetTop(sizes, 2, 3)).toBe(1800)
    expect(computeTargetOffsetTop(sizes, 3, 3)).toBe(3600)
  })

  it('is zero for the first page (nothing precedes it)', () => {
    expect(computeTargetOffsetTop(sizes, 1, 3)).toBe(0)
  })

  it('skips pages with no cached size or an unusable aspect-ratio', () => {
    const mixed = [
      undefined,
      { width: 400, aspectRatio: 'bad' },
      { width: 400, aspectRatio: '400 / 600' },
    ]
    expect(computeTargetOffsetTop(mixed, 3, 2)).toBe(0) // pages 1,2 contribute nothing
    expect(computeTargetOffsetTop(mixed, 4, 2)).toBe(1200) // page 3: 400*2*(600/400)
  })
})

describe('clampScale', () => {
  it('passes through an in-range scale unchanged', () => {
    expect(clampScale(1)).toBe(1)
    expect(clampScale(2.5)).toBe(2.5)
  })

  it('clamps below the minimum and above the maximum', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE)
    expect(clampScale(99)).toBe(MAX_SCALE)
  })

  it('a fit-to-width scale beyond the relative-zoom range survives a relative zoom step', () => {
    // Before unification, setScale allowed up to 5 but the +/- zoom clamped to 3, so a
    // fit-to-width of 4.2 jumped to 3 on the next zoom-out. With one shared range it steps.
    const fit = clampScale(4.2)
    expect(fit).toBe(4.2)
    expect(clampScale(fit - 0.25)).toBeCloseTo(3.95, 5)
  })
})

describe('rescaleInPageOffset', () => {
  it('keeps the same page fraction under the viewport top when zooming', () => {
    // half-way-down a 600px page (offset 300) must stay half-way-down the zoomed 1200px page
    expect(rescaleInPageOffset(300, 1.5, 3.0)).toBe(600)
    expect(rescaleInPageOffset(300, 3.0, 1.5)).toBe(150) // zoom out
  })

  it('is a no-op at unchanged scale (the recompile path)', () => {
    expect(rescaleInPageOffset(300, 1.0, 1.0)).toBe(300)
    expect(rescaleInPageOffset(0, 2.0, 4.0)).toBe(0)
  })

  it('guards divide-by-zero', () => {
    expect(rescaleInPageOffset(300, 0, 2)).toBe(300)
  })
})

describe('computeRestoredScrollTop', () => {
  it('preserves the within-page offset on a same-scale recompile', () => {
    // Viewing page 2 (top at 1000), scrolled 300px into it. Page 2 in the new DOM is at 980.
    expect(
      computeRestoredScrollTop({
        scrollTop: 1300,
        oldPageOffsetTop: 1000,
        newTargetOffsetTop: 980,
        oldScale: 1.5,
        newScale: 1.5,
        anchorToTop: false,
      }),
    ).toBe(1280) // 980 + (1300 - 1000)
  })

  it('rescales the within-page offset across a zoom', () => {
    // 300px into a page at 1.5x → 600px into the same page at 3x.
    expect(
      computeRestoredScrollTop({
        scrollTop: 1300,
        oldPageOffsetTop: 1000,
        newTargetOffsetTop: 2000,
        oldScale: 1.5,
        newScale: 3.0,
        anchorToTop: false,
      }),
    ).toBe(2600) // 2000 + rescale(300, 1.5, 3) = 2000 + 600
  })

  it('anchors the target page at its top when the viewed page no longer exists (shrink clamp)', () => {
    // User was scrolled far down a 5-page doc (scrollTop 4000); the recompile produced a
    // 1-page doc, currentPage was clamped to 1 → the stale multi-page offset must be discarded.
    expect(
      computeRestoredScrollTop({
        scrollTop: 4000,
        oldPageOffsetTop: 0, // old page 1's top (visiblePage reset to 1), NOT where the user was
        newTargetOffsetTop: 0,
        oldScale: 1.5,
        newScale: 1.5,
        anchorToTop: true,
      }),
    ).toBe(0) // not 4000 — the viewer would otherwise scroll past the now-short document
  })

  it('anchors at the target top when no old wrapper was found', () => {
    expect(
      computeRestoredScrollTop({
        scrollTop: 4000,
        oldPageOffsetTop: null,
        newTargetOffsetTop: 250,
        oldScale: 1.5,
        newScale: 1.5,
        anchorToTop: false,
      }),
    ).toBe(250)
  })
})
