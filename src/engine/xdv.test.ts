import { describe, expect, it } from 'vitest'
import type { FontGlyphGap } from '../types'
import { attachGlyphOutput, parseXdvGeometry, parseXdvNotdef } from './xdv'

// Real XDV captured from the #89 repro: Korean text (안녕하세요…) set in
// HaranoAjiMincho (a Japanese font with no Hangul) → 22 .notdef boxes on page 1.
const XDV_B64 =
  '9wcBg5LAHDsAAAAAA+gdIFhlVGVYIG91dHB1dCAyMDI2LjA2LjE2OjE0NDWLAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////vFHBkZjpwYWdlc2l6ZSBkZWZhdWx0oAJ5AACNoP2jAACgAj8AAI2g/eQAAI2RTQAA/AAAADUACgAAAAAgL3RleC9IYXJhbm9BamlNaW5jaG8tUmVndWxhci5vdGYAAAAA4P0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD8AAAAMQAKAAAAABVsbXJvbWFuMTAtcmVndWxhci5vdGYAAAAA3P0AAseuAAEAAAAAAAAAAABYkQRwpOD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA/QAKAAAAAQAAAAAAAAAAAAD9AAoAAAABAAAAAAAAAAAAAP0ACgAAAAEAAAAAAAAAAAAA3P0AAseuAAEAAAAAAAAAAABYjo6fHgAAjY2SAOgAAP0ABQAAAAEAAAAAAAAAAABSjo6OjPgAAAAsAYOSwBw7AAAAAAPoAnkAAAGXAAAAAwAB/AAAADUACgAAAAAgL3RleC9IYXJhbm9BamlNaW5jaG8tUmVndWxhci5vdGYAAAAA/AAAADEACgAAAAAVbG1yb21hbjEwLXJlZ3VsYXIub3RmAAAAAPkAAAKhB9/f39/f398='
const XDV = Uint8Array.from(atob(XDV_B64), (c) => c.charCodeAt(0))
const LOG = Array.from(
  { length: 22 },
  () => 'Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!',
).join('\n')

// Real XDV from a 2-page a5paper doc (margin 2cm) with a bordered tabular on page 1.
// Exercises the papersize special (`pdf:pagesize width ...pt height ...pt`), rules
// (the \hline/| borders) and multi-page geometry. See scripts/capture-geo-fixture.mjs.
const XDV_GEO_B64 =
  '9wcBg5LAHDsAAAAAA+gdIFhlVGVYIG91dHB1dCAyMDI2LjA2LjE2OjE2MTGLAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/////vMXBkZjpwYWdlc2l6ZSB3aWR0aCA0MjEuMTAwNzhwdCBoZWlnaHQgNTk3LjUwNzg3cHSgAfJVF42g/eVNmqAB/LJmjaD+J02ajZEBorH8AAAAMAAK8zMAABVsbXJvbWFuMTAtcmVndWxhci5vdGYAAAAA2/0AGKMzAAUAAAAAAAAAAAAINmYAAAAAAA0TBQAAAAAAEB5PAAAAAAATKZkAAAAAAD4AMgBIAEgAUZYDpXf9ACwg5QAIAAAAAAAAAAAABXmaAAAAAAAKVjgAAAAAAA/P0gAAAAAAGO7iAAAAAAAdy4EAAAAAACIN8wAAAAAAJljOAAAAAAA7ADIAUQBLADIAaQBgAHaT/QAcCDEABwAAAAAAAAAAAAYWlAAAAAAACSHeAAAAAAAMLSgAAAAAAA84cgAAAAAAFLIMAAAAAAAY/OcAAAAAAFQAQgBIAEgAHABgAFiOnxQxc42NjZEBorGf73ZoiQAAZmYAJbACpAmFHI2NkMzNpAQUfYQADZmZAABmZpEFzM6f++uD/QAINmYAAQAAAAAAAAAAABuRBczNoYQADZmZAABmZo6NkRo2aP0ABXmaAAEAAAAAAAAAAABSkQXMzZ8EFH2EAA2ZmQAAZmaOjqkEeuOJAABmZgAlsAKhjY2QzM2kBBR9hAANmZkAAGZmkQXMzp/764P9AAfAqgABAAAAAAAAAAAAIpEGQomhhAANmZkAAGZmjo2RGjZo/QAFeZoAAQAAAAAAAAAAAGuRBczNnwQUfYQADZmZAABmZo6OpokAAGZmACWwAo6Ojo6fHgAAjoyLAAAAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACzvMXBkZjpwYWdlc2l6ZSB3aWR0aCA0MjEuMTAwNzhwdCBoZWlnaHQgNTk3LjUwNzg3cHSgAfJVF42g/eVNmqAB/LJmjaD+J02ajZEBorHb/QAhdpQABgAAAAAAAAAAAAYWlAAAAAAACvMzAAAAAAAPz9IAAAAAABVJawAAAAAAG2AAAAAAAABhADIAKwBRAE0AL5EDpXf9ABjxsAAFAAAAAAAAAAAABhaUAAAAAAALkC4AAAAAABEJxwAAAAAAFeZmAAAAAABUABwAOwAyAFiOjp8eAACOjPgAAAK0AYOSwBw7AAAAAAPoAfJVFwEj7OAABwAC/AAAADAACvMzAAAVbG1yb21hbjEwLXJlZ3VsYXIub3RmAAAAAPkAAAO4B9/f398='
const XDV_GEO = Uint8Array.from(atob(XDV_GEO_B64), (c) => c.charCodeAt(0))

describe('parseXdvNotdef (#89 L2b)', () => {
  it('finds every .notdef box with sane in-page coordinates', () => {
    const { placements, reliable } = parseXdvNotdef(XDV)
    expect(reliable).toBe(true)
    expect(placements).toHaveLength(22) // one per missing character
    for (const p of placements) {
      expect(p.page).toBe(1)
      expect(p.x).toBeGreaterThan(72) // right of the 1in left margin
      expect(p.y).toBeGreaterThan(72)
      expect(p.size).toBeGreaterThan(0)
    }
    // consecutive Hangul advance by ~1em (10pt CJK), same baseline
    expect(placements[1]!.x - placements[0]!.x).toBeCloseTo(placements[0]!.size, 0)
    expect(placements[1]!.y).toBeCloseTo(placements[0]!.y, 5)
  })

  it('returns empty for a non-XDV / empty buffer', () => {
    expect(parseXdvNotdef(new Uint8Array(0)).placements).toEqual([])
  })
})

describe('attachGlyphOutput (#89 L2b)', () => {
  it('zips XDV positions onto the matching gap occurrences', () => {
    const gaps: FontGlyphGap[] = [
      {
        font: 'HaranoAjiMincho-Regular.otf',
        script: 'Hangul',
        codepoints: [0xc548],
        count: 22,
        sample: '안',
      },
    ]
    attachGlyphOutput(gaps, XDV, LOG)
    expect(gaps[0]!.occurrences).toHaveLength(22)
    const first = gaps[0]!.occurrences![0]!
    expect(first.codepoint).toBe(0xc548)
    expect(first.output?.page).toBe(1)
    expect(first.output?.x).toBeGreaterThan(72)
    expect(first.output?.width).toBeGreaterThan(0)
  })

  it('attaches nothing when the counts do not match (avoids misaligned coords)', () => {
    const gaps: FontGlyphGap[] = [
      { font: 'HaranoAjiMincho-Regular.otf', codepoints: [0xc548], count: 1, sample: '안' },
    ]
    const shortLog =
      'Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!'
    attachGlyphOutput(gaps, XDV, shortLog) // 1 log occ vs 22 placements
    expect(gaps[0]!.occurrences).toBeUndefined()
  })
})

describe('parseXdvGeometry (#54 slice 3)', () => {
  it('returns one reliable page with positioned text runs', () => {
    const { pages, reliable } = parseXdvGeometry(XDV)
    expect(reliable).toBe(true)
    expect(pages).toHaveLength(1)
    const page = pages[0]!
    expect(page.page).toBe(1)
    expect(page.textRuns.length).toBeGreaterThan(0)
    for (const run of page.textRuns) {
      expect(run.x).toBeGreaterThan(72) // right of the 1in left margin
      expect(run.y).toBeGreaterThan(72)
      expect(run.width).toBeGreaterThan(0)
      expect(run.size).toBeGreaterThan(0)
      expect(run.glyphs).toBeGreaterThan(0)
    }
  })

  it('records the font name on runs and a content bounding box', () => {
    const page = parseXdvGeometry(XDV).pages[0]!
    expect(page.textRuns.some((r) => r.font === 'HaranoAjiMincho-Regular.otf')).toBe(true)
    const box = page.contentBox!
    expect(box).toBeDefined()
    expect(box.width).toBeGreaterThan(0)
    expect(box.height).toBeGreaterThan(0)
    // content box encloses every run origin
    for (const run of page.textRuns) {
      expect(run.x).toBeGreaterThanOrEqual(box.x)
      expect(run.x).toBeLessThanOrEqual(box.x + box.width + 0.001)
    }
  })

  it('returns no pages for a non-XDV / empty buffer', () => {
    expect(parseXdvGeometry(new Uint8Array(0)).pages).toEqual([])
  })

  it('never throws on a truncated XDV and flags it unreliable', () => {
    // This runs on every XeLaTeX compile now, so a malformed/truncated XDV must
    // degrade — not crash an otherwise-successful compile.
    let unreliable = 0
    for (let len = 40; len < XDV_GEO.length; len += 17) {
      const slice = XDV_GEO.subarray(0, len)
      let res: ReturnType<typeof parseXdvGeometry> | undefined
      expect(() => {
        res = parseXdvGeometry(slice)
      }).not.toThrow()
      if (res && !res.reliable) unreliable++
    }
    expect(unreliable).toBeGreaterThan(0) // the degrade-to-unreliable path is exercised
  })

  it('parses the media box, rules and multiple pages (a5 + tabular)', () => {
    const { pages, reliable } = parseXdvGeometry(XDV_GEO)
    expect(reliable).toBe(true)
    expect(pages).toHaveLength(2)
    // a5paper: 148mm × 210mm → 419.5bp × 595.3bp (from the papersize special)
    for (const p of pages) {
      expect(p.width).toBeCloseTo(419.5, 0)
      expect(p.height).toBeCloseTo(595.3, 0)
    }
    // page 1 carries the tabular's rules; page 2 has none
    expect(pages[0]!.rules.length).toBeGreaterThan(0)
    expect(pages[1]!.rules).toHaveLength(0)
    // \arrayrulewidth defaults to 0.4pt ≈ 0.4bp
    for (const rule of pages[0]!.rules) {
      expect(Math.min(rule.width, rule.height)).toBeCloseTo(0.4, 1)
    }
    // content sits right of the 2cm margin and fits inside the parsed media box —
    // cross-checks that run/rule coordinates and the page size share one frame
    const box = pages[0]!.contentBox!
    expect(box.x).toBeGreaterThan(50)
    expect(box.x + box.width).toBeLessThanOrEqual(pages[0]!.width! + 1)
    expect(box.y + box.height).toBeLessThanOrEqual(pages[0]!.height! + 1)
  })
})
