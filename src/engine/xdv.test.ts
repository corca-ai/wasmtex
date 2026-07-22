import { describe, expect, it } from 'vitest'
import type { FontGlyphGap } from '../types'
import { attachGlyphOutput, parseXdv, parseXdvGeometry, parseXdvNotdef } from './xdv'

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

// ── Crafted XDV byte buffers for opcode/branch edge cases ──────────────────────
// The captured fixtures above exercise the common path; these hand-built buffers
// reach the rarer opcodes and malformed/boundary inputs. PRE sets num/den to
// 254000/72 so `dvi2pts` is exactly 1 — every DVI unit reads straight out as a
// point, so a run at cursor h=100 lands at x = 72 (the 1in origin) + 100.
class Xdv {
  private b: number[] = []
  u8(v: number) {
    this.b.push(v & 0xff)
    return this
  }
  u16(v: number) {
    this.b.push((v >>> 8) & 0xff, v & 0xff)
    return this
  }
  u32(v: number) {
    this.b.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff)
    return this
  }
  s32(v: number) {
    return this.u32(v >>> 0) // two's-complement round-trips through Reader.sint
  }
  zeros(n: number) {
    for (let i = 0; i < n; i++) this.b.push(0)
    return this
  }
  ascii(str: string) {
    for (let i = 0; i < str.length; i++) this.u8(str.charCodeAt(i))
    return this
  }
  utf16(str: string) {
    for (let i = 0; i < str.length; i++) this.u16(str.charCodeAt(i))
    return this
  }
  pre() {
    return this.u8(247).u8(7).u32(254000).u32(72).u32(1000).u8(0) // → dvi2pts = 1
  }
  bop(page: number) {
    return this.u8(139).s32(page).zeros(40) // \count1..9 + prev-bop pointer
  }
  eop() {
    return this.u8(140)
  }
  post() {
    return this.u8(248)
  }
  special(str: string) {
    return this.u8(239).u8(str.length).ascii(str) // XXX1
  }
  /** Shared body of both glyph-run opcodes: width, then (x,y) per glyph, then a
   *  glyph id per glyph. */
  private glyphBody(width: number, runs: Array<[number, number, number]>) {
    this.s32(width).u16(runs.length)
    for (const [x, y] of runs) this.s32(x).s32(y)
    for (const [, , g] of runs) this.u16(g)
    return this
  }
  /** XDV_GLYPHS: run width, then (x,y) per glyph, then a glyph id per glyph. */
  glyphs(width: number, runs: Array<[number, number, number]>) {
    return this.u8(253).glyphBody(width, runs)
  }
  /** XDV_TEXT_AND_GLYPHS: leading UTF-16BE text, then the glyph run. */
  textGlyphs(text: string, width: number, runs: Array<[number, number, number]>) {
    return this.u8(254).u16(text.length).utf16(text).glyphBody(width, runs)
  }
  done() {
    return Uint8Array.from(this.b)
  }
}

/** Cap a builder with a single-glyph run (`.notdef` when glyph=0) + eop + post,
 *  parse it, assert the walk stayed reliable, and return the sole text run. */
function runFromGlyph(builder: Xdv, width: number, glyph: number) {
  const xdv = builder
    .glyphs(width, [[0, 0, glyph]])
    .eop()
    .post()
    .done()
  const { pages, reliable } = parseXdv(xdv)
  expect(reliable).toBe(true)
  return pages[0]!.textRuns[0]!
}

describe('parseXdv opcode/branch edge cases (crafted buffers)', () => {
  it('records a glyph run with no active font (size 0, no font name)', () => {
    // curFont starts at -1 with no native-font def, so fontSize/fontName miss.
    const run = runFromGlyph(new Xdv().pre().bop(1), 64, 7)
    expect(run.glyphs).toBe(1)
    expect(run.width).toBe(64) // dvi2pts = 1
    expect(run.size).toBe(0) // no font size known → the `?? 0` fallback
    expect(run.font).toBeUndefined() // no font name → run.font left off
  })

  it('drops a glyph run emitted before any bop (no current page)', () => {
    // Malformed order: a .notdef glyph before bop. pushTextRun must bail (no page),
    // but the placement is still collected against page 0.
    const xdv = new Xdv()
      .pre()
      .glyphs(20, [[0, 0, 0]])
      .post()
      .done()
    const { pages, placements, reliable } = parseXdv(xdv)
    expect(reliable).toBe(true)
    expect(pages).toHaveLength(0) // pushTextRun returned early (s.cur null)
    expect(placements).toHaveLength(1)
    expect(placements[0]!.page).toBe(0)
    expect(placements[0]!.x).toBe(72)
    expect(placements[0]!.y).toBe(72)
  })

  it('decodes a native font with all optional params + a text+glyph run', () => {
    // flags 0x7200 = colored|extend|slant|embolden → 4 extra 4-byte params to skip
    // (16), plus the 4-byte face index = 20 trailing zero bytes.
    const xdv = new Xdv()
      .pre()
      .bop(1)
      .u8(252) // XDV_NATIVE_FONT_DEF
      .s32(0) // texId
      .u32(10) // point size (dvi2pts=1 → run.size = 10)
      .u16(0x7200) // colored | extend | slant | embolden
      .u8(15)
      .ascii('/tex/MyFont.otf') // path → basename on the run
      .zeros(20)
      .u8(171) // FNT_NUM_0 → select font 0
      .textGlyphs('Hi', 24, [[0, 0, 5]]) // non-.notdef glyph, real text
      .eop()
      .post()
      .done()
    const { pages, placements, reliable } = parseXdv(xdv)
    expect(reliable).toBe(true)
    expect(placements).toHaveLength(0) // glyph id 5 ≠ 0
    const run = pages[0]!.textRuns[0]!
    expect(run.text).toBe('Hi')
    expect(run.font).toBe('MyFont.otf') // directory stripped
    expect(run.size).toBe(10)
    expect(run.width).toBe(24)
    expect(run.glyphs).toBe(1)
  })

  it('follows x-family cursor movements (x1 sets, x0 repeats)', () => {
    // x1 operand 50 → h=50 & x=50; x0 repeats → h=100; glyph lands at 72+100.
    const xdv = new Xdv()
      .pre()
      .bop(1)
      .u8(153)
      .u8(50) // X1, 1-byte operand
      .u8(152) // X0 (repeat last x)
      .glyphs(10, [[0, 0, 3]])
      .eop()
      .post()
      .done()
    const run = parseXdv(xdv).pages[0]!.textRuns[0]!
    expect(run.x).toBe(172) // 72 + 50 + 50
  })

  it('marks the walk unreliable on set_char / set / put opcodes', () => {
    // A TFM-width char (op≤127), a set1, and a put1: cursor width is unknown, so
    // the parse must degrade to unreliable.
    const xdv = new Xdv()
      .pre()
      .bop(1)
      .u8(65) // set_char 'A' (op ≤ 127)
      .u8(128)
      .u8(0) // SET1 + 1 skipped byte
      .u8(133)
      .u8(0) // PUT1 + 1 skipped byte (places, no advance)
      .eop()
      .post()
      .done()
    const { pages, reliable } = parseXdv(xdv)
    expect(pages).toHaveLength(1)
    expect(reliable).toBe(false)
  })

  it('skips a TFM font def and selects it via fnt1 (no glyph metrics)', () => {
    // FNT_DEF1: 1-byte font num, 12 bytes checksum/scale/design, a=3 + l=4 name
    // bytes; then FNT1 selects font 3 — a TFM font carries no name/size.
    const builder = new Xdv()
      .pre()
      .bop(1)
      .u8(243) // FNT_DEF1
      .u8(3) // font number
      .zeros(12) // checksum + scale + design size
      .u8(3) // a (area length)
      .u8(4) // l (name length)
      .zeros(7) // area + name bytes
      .u8(235)
      .u8(3) // FNT1 → curFont = 3
    const run = runFromGlyph(builder, 32, 9)
    expect(run.width).toBe(32)
    expect(run.font).toBeUndefined() // TFM font: no native name
    expect(run.size).toBe(0) // TFM font: no native size
  })

  it('handles nop, an empty-stack pop, then an unknown opcode', () => {
    // nop is inert; pop with nothing pushed must not throw; an undefined opcode
    // (255) halts the walk and flags it unreliable.
    const xdv = new Xdv()
      .pre()
      .bop(1)
      .u8(138) // NOP
      .u8(142) // POP with empty stack
      .u8(255) // unknown opcode → 'no'
      .done()
    const { pages, reliable } = parseXdv(xdv)
    expect(pages).toHaveLength(1) // bop's page survives
    expect(reliable).toBe(false)
  })

  it('skips a zero-height rule (running/invisible rules are not boxes)', () => {
    // SET_RULE height 0: pushRule bails, but the reference point still advances.
    const xdv = new Xdv()
      .pre()
      .bop(1)
      .u8(132)
      .s32(0)
      .s32(10) // SET_RULE height=0 width=10
      .eop()
      .post()
      .done()
    const { pages, reliable } = parseXdv(xdv)
    expect(reliable).toBe(true)
    expect(pages[0]!.rules).toHaveLength(0)
  })

  it('applies a papersize special seen before bop, ignores non-size + zero-dim ones', () => {
    // A color special (not a page size) is ignored; a valid papersize before bop
    // (no current page yet) still seeds the media box for the next page; an
    // in-page papersize with a zero dimension is rejected.
    const xdv = new Xdv()
      .pre()
      .special('color push rgb 1 0 0') // not a page size → ignored
      .special('papersize=100bp,200bp') // valid, but s.cur is still null here
      .bop(1)
      .special('papersize=0bp,50bp') // zero width → rejected, box unchanged
      .eop()
      .post()
      .done()
    const { pages, reliable } = parseXdv(xdv)
    expect(reliable).toBe(true)
    expect(pages[0]!.width).toBe(100)
    expect(pages[0]!.height).toBe(200)
  })
})

describe('attachPlacements branch edge cases', () => {
  it('attaches nothing when there are no placements to zip', () => {
    const gaps: FontGlyphGap[] = [
      { font: 'Whatever.otf', codepoints: [0x41], count: 1, sample: 'A' },
    ]
    attachGlyphOutput(gaps, new Uint8Array(0), '') // empty parse → 0 placements
    expect(gaps[0]!.occurrences).toBeUndefined()
  })

  it('leaves a gap untouched when the log font has no matching gap', () => {
    // 22 placements align with 22 log occurrences (font HaranoAjiMincho…), but the
    // supplied gap is for a different font, so nothing gets attached to it.
    const gaps: FontGlyphGap[] = [
      { font: 'DifferentFont.otf', codepoints: [0xc548], count: 22, sample: '안' },
    ]
    attachGlyphOutput(gaps, XDV, LOG)
    expect(gaps[0]!.occurrences).toBeUndefined()
  })
})
