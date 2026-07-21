/**
 * Headless XDV (XeTeX extended DVI) parser. The XDV is already in JS in the pipeline
 * (the xetex worker's output, before dvipdfmx), so this needs no engine patch.
 *
 * A single walk ({@link parseXdv}) tracks the DVI cursor purely from the opcodes
 * (movements + each glyph run's own width — no font metrics needed) and produces two
 * products from the same pass:
 *   - page/box **geometry**: per page, the positioned text runs + rules + media box —
 *     the substrate for text extraction, click-to-source, cropping, overlays (#54).
 *   - **`.notdef` placements**: every glyph with id 0 (a font missing a character),
 *     used to attach overlay positions to glyph gaps (#89, L2b).
 * {@link parseXdvGeometry} and {@link parseXdvNotdef} are thin wrappers over it.
 *
 * A traditional `set_char` (TFM-width advance we can't compute) would desync the
 * cursor, so we set `reliable = false` and callers then skip positions. Native-font
 * documents (fontspec / xeCJK) are all glyph runs, so positions are exact there.
 *
 * Coordinates are points (bp) from the page TOP-LEFT (page-size independent):
 *   x = 72 + (h + xoff)·dvi2pts ,  y = 72 + (v + yoff)·dvi2pts
 * mirroring dvipdfmx's default 1in origin and `dvi2pts = num/den · 72/254000`.
 */

import type { BoxGeometry, DocumentGeometry, FontGlyphGap, PageGeometry, TextRun } from '../types'
import { parseGlyphOccurrences } from './parse-errors'

const SET1 = 128
const SET_RULE = 132
const PUT1 = 133
const PUT_RULE = 137
const NOP = 138
const BOP = 139
const EOP = 140
const PUSH = 141
const POP = 142
const RIGHT1 = 143
const W0 = 147
const W1 = 148
const X0 = 152
const X1 = 153
const DOWN1 = 157
const Y0 = 161
const Y1 = 162
const Z0 = 166
const Z1 = 167
const FNT_NUM_0 = 171
const FNT1 = 235
const XXX1 = 239
const FNT_DEF1 = 243
const PRE = 247
const POST = 248
const XDV_NATIVE_FONT_DEF = 252
const XDV_GLYPHS = 253
const XDV_TEXT_AND_GLYPHS = 254

/** Baseline → box-top fraction (cap height ≈ 0.8em) and box-bottom (descent ≈ 0.2em),
 *  used to approximate text vertical extent headlessly (no glyph metrics). */
const CAP = 0.8
const DESC = 0.2

export interface NotdefPlacement {
  /** Page number (\count0 from bop). */
  page: number
  /** Points (bp) from the page's left/top edge. */
  x: number
  y: number
  /** The native font's point size (bp), for an approximate box size. */
  size: number
}

export interface XdvNotdefResult {
  placements: NotdefPlacement[]
  /** False if the cursor could have desynced (traditional TFM text present); the
   *  caller should then not trust positions. */
  reliable: boolean
}

/** Everything a single XDV walk yields. */
export interface XdvParse {
  pages: PageGeometry[]
  placements: NotdefPlacement[]
  reliable: boolean
}

class Reader {
  private readonly dv: DataView
  pos = 0
  constructor(buf: Uint8Array) {
    this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }
  get eof(): boolean {
    return this.pos >= this.dv.byteLength
  }
  u8(): number {
    return this.dv.getUint8(this.pos++)
  }
  u16(): number {
    const v = this.dv.getUint16(this.pos)
    this.pos += 2
    return v
  }
  u32(): number {
    const v = this.dv.getUint32(this.pos)
    this.pos += 4
    return v
  }
  s32(): number {
    const v = this.dv.getInt32(this.pos)
    this.pos += 4
    return v
  }
  /** Unsigned big-endian of `n` bytes (n = 1..4). */
  uint(n: number): number {
    let v = 0
    for (let i = 0; i < n; i++) v = v * 256 + this.u8()
    return v
  }
  /** Signed big-endian of `n` bytes (top byte sign-extended). */
  sint(n: number): number {
    let v = this.u8()
    if (v >= 128) v -= 256
    for (let i = 1; i < n; i++) v = v * 256 + this.u8()
    return v
  }
  /** `n` bytes decoded as Latin-1/ASCII (used for font names + specials). */
  ascii(n: number): string {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8())
    return s
  }
  /** `n` UTF-16BE code units (XDV stores run text this way). */
  utf16(n: number): string {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u16())
    return s
  }
  skip(n: number): void {
    this.pos += n
  }
}

interface Cursor {
  h: number
  v: number
  w: number
  x: number
  y: number
  z: number
}

const ORIGIN = 72 // 1in, dvipdfmx default dev origin (bp)

interface PState {
  r: Reader
  placements: NotdefPlacement[]
  pages: PageGeometry[]
  cur: PageGeometry | null
  /** Media box from the most recent `papersize` special, applied to subsequent pages. */
  paper: { width: number; height: number } | null
  fontSize: Map<number, number> // tex_id → point_size (sp)
  fontName: Map<number, string> // tex_id → font file name
  dvi2pts: number
  reliable: boolean
  page: number
  curFont: number
  st: Cursor
  stack: Cursor[]
}

/** op in the 4-wide family [base, base+3] (the n1..n4 DVI opcode groups). */
function inRange(op: number, base: number): boolean {
  return op >= base && op <= base + 3
}

/** Record one positioned text run for the current page's geometry. */
function pushTextRun(s: PState, width: number, n: number, text: string | undefined): void {
  if (!s.cur) return
  const run: TextRun = {
    x: ORIGIN + s.st.h * s.dvi2pts,
    y: ORIGIN + s.st.v * s.dvi2pts,
    width: width * s.dvi2pts,
    size: (s.fontSize.get(s.curFont) ?? 0) * s.dvi2pts,
    glyphs: n,
  }
  if (text) run.text = text
  const font = s.fontName.get(s.curFont)
  if (font) run.font = font
  s.cur.textRuns.push(run)
}

/** Read one glyph run (XDV_GLYPHS / XDV_TEXT_AND_GLYPHS) at the current cursor:
 *  record any .notdef boxes and a text run, then advance the cursor by the run width. */
function readGlyphs(s: PState, withText: boolean): void {
  const { r } = s
  const text = withText ? r.utf16(r.u16()) : undefined
  const width = r.s32()
  const n = r.u16()
  const xs = new Array<number>(n)
  const ys = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    xs[i] = r.s32()
    ys[i] = r.s32()
  }
  const size = (s.fontSize.get(s.curFont) ?? 0) * s.dvi2pts
  for (let i = 0; i < n; i++) {
    if (r.u16() === 0) {
      s.placements.push({
        page: s.page,
        x: ORIGIN + (s.st.h + xs[i]!) * s.dvi2pts,
        y: ORIGIN + (s.st.v + ys[i]!) * s.dvi2pts,
        size,
      })
    }
  }
  pushTextRun(s, width, n, text)
  s.st.h += width // the run advances the cursor by its own width
}

function readNativeFontDef(s: PState): void {
  const { r } = s
  const texId = r.s32()
  const pointSize = r.u32()
  const flags = r.u16()
  s.fontName.set(texId, r.ascii(r.u8()).replace(/^.*\//, '')) // font name → basename
  r.skip(4) // face index
  if (flags & 0x0200) r.skip(4) // colored (rgba)
  if (flags & 0x1000) r.skip(4) // extend
  if (flags & 0x2000) r.skip(4) // slant
  if (flags & 0x4000) r.skip(4) // embolden
  s.fontSize.set(texId, pointSize)
}

/** Record a rule box. DVI rules are drawn up-and-right from the reference point
 *  (lower-left); negative/zero extents are running/invisible rules — skip them. */
function pushRule(s: PState, height: number, width: number): void {
  if (!s.cur || height <= 0 || width <= 0) return
  s.cur.rules.push({
    x: ORIGIN + s.st.h * s.dvi2pts,
    y: ORIGIN + (s.st.v - height) * s.dvi2pts,
    width: width * s.dvi2pts,
    height: height * s.dvi2pts,
  })
}

/** Cursor movements with an operand (right/down/w/x/y/z families). */
function opMovement(op: number, s: PState): boolean {
  const { r, st } = s
  if (inRange(op, RIGHT1)) {
    st.h += r.sint(op - RIGHT1 + 1)
    return true
  }
  if (inRange(op, DOWN1)) {
    st.v += r.sint(op - DOWN1 + 1)
    return true
  }
  if (inRange(op, W1)) {
    st.w = r.sint(op - W1 + 1)
    st.h += st.w
    return true
  }
  if (inRange(op, X1)) {
    st.x = r.sint(op - X1 + 1)
    st.h += st.x
    return true
  }
  if (inRange(op, Y1)) {
    st.y = r.sint(op - Y1 + 1)
    st.v += st.y
    return true
  }
  if (inRange(op, Z1)) {
    st.z = r.sint(op - Z1 + 1)
    st.v += st.z
    return true
  }
  return opMovementShort(op, s)
}

/** The no-operand movement opcodes (w0/x0/y0/z0) and rules. */
function opMovementShort(op: number, s: PState): boolean {
  const { r, st } = s
  if (op === W0) {
    st.h += st.w
    return true
  }
  if (op === X0) {
    st.h += st.x
    return true
  }
  if (op === Y0) {
    st.v += st.y
    return true
  }
  if (op === Z0) {
    st.v += st.z
    return true
  }
  if (op === SET_RULE) {
    const height = r.s32()
    const width = r.s32()
    pushRule(s, height, width)
    st.h += width // the reference point advances by the rule width
    return true
  }
  if (op === PUT_RULE) {
    pushRule(s, r.s32(), r.s32()) // places without advancing
    return true
  }
  return false
}

/** Fonts, glyph runs, and characters (set_char/set advance an unknown TFM width). */
function opFontText(op: number, s: PState): boolean {
  const { r } = s
  if (op <= 127) {
    s.reliable = false // set_char_i
    return true
  }
  if (op >= FNT_NUM_0 && op <= FNT_NUM_0 + 63) {
    s.curFont = op - FNT_NUM_0
    return true
  }
  if (inRange(op, SET1)) {
    r.skip(op - SET1 + 1)
    s.reliable = false
    return true
  }
  if (inRange(op, PUT1)) {
    r.skip(op - PUT1 + 1) // places without advancing
    return true
  }
  if (inRange(op, FNT1)) {
    s.curFont = r.uint(op - FNT1 + 1)
    return true
  }
  if (inRange(op, FNT_DEF1)) {
    skipTfmFontDef(s, op)
    return true
  }
  if (inRange(op, XXX1)) {
    handleSpecial(s, r.ascii(r.uint(op - XXX1 + 1)))
    return true
  }
  return opGlyphRun(op, s)
}

/** Native-font definitions + glyph runs (the XDV extensions). */
function opGlyphRun(op: number, s: PState): boolean {
  if (op === XDV_NATIVE_FONT_DEF) {
    readNativeFontDef(s)
    return true
  }
  if (op === XDV_GLYPHS) {
    readGlyphs(s, false)
    return true
  }
  if (op === XDV_TEXT_AND_GLYPHS) {
    readGlyphs(s, true)
    return true
  }
  return false
}

function skipTfmFontDef(s: PState, op: number): void {
  const { r } = s
  r.skip(op - FNT_DEF1 + 1) // font number
  r.skip(12) // checksum + scale + design size
  const a = r.u8()
  const l = r.u8()
  r.skip(a + l) // area + name
}

const DIM_UNIT_TO_BP: Record<string, number> = {
  bp: 1,
  pt: 72 / 72.27,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
}

const DIM_TOKEN = /([\d.]+)\s*(bp|pt|in|mm|cm)\b/gi

/** Parse a page-size special into a media box (bp). XeTeX/dvipdfmx emit several forms
 *  — `papersize=421pt,597pt` (geometry) and `pdf:pagesize width 421pt height 597pt` —
 *  so we take the first two dimension tokens after the keyword; the `default` form
 *  carries no dimensions and is ignored. */
function handleSpecial(s: PState, special: string): void {
  if (!/p(?:aper|age)size/i.test(special)) return
  const dims = [...special.matchAll(DIM_TOKEN)]
  if (dims.length < 2) return
  const width = Number(dims[0]![1]) * (DIM_UNIT_TO_BP[dims[0]![2]!.toLowerCase()] ?? 1)
  const height = Number(dims[1]![1]) * (DIM_UNIT_TO_BP[dims[1]![2]!.toLowerCase()] ?? 1)
  if (!(width > 0 && height > 0)) return
  s.paper = { width, height }
  if (s.cur) {
    s.cur.width = width
    s.cur.height = height
  }
}

/** Start a new page at `bop`, carrying any known media box. */
function beginPage(s: PState): void {
  const page: PageGeometry = { page: s.page, textRuns: [], rules: [] }
  if (s.paper) {
    page.width = s.paper.width
    page.height = s.paper.height
  }
  s.pages.push(page)
  s.cur = page
}

/** Page structure + preamble. Returns 'stop' at post, 'no' for an unknown opcode. */
function opStructural(op: number, s: PState): 'ok' | 'stop' | 'no' {
  const { r } = s
  switch (op) {
    case NOP:
    case EOP:
      return 'ok'
    case PUSH:
      s.stack.push({ ...s.st })
      return 'ok'
    case POP: {
      const p = s.stack.pop()
      if (p) s.st = p
      return 'ok'
    }
    case BOP:
      s.page = r.s32()
      r.skip(9 * 4 + 4) // \count1..9 + prev-bop pointer
      s.st = { h: 0, v: 0, w: 0, x: 0, y: 0, z: 0 }
      s.stack.length = 0
      beginPage(s)
      return 'ok'
    case PRE: {
      r.u8() // version
      const num = r.u32()
      const den = r.u32()
      r.u32() // mag (assume 1000)
      r.skip(r.u8()) // comment
      s.dvi2pts = (num / den) * (72.0 / 254000.0)
      return 'ok'
    }
    case POST:
      return 'stop'
    default:
      return 'no'
  }
}

/** A box enclosing both `a` and `b` (either may be undefined). */
function unionBox(a: BoxGeometry | undefined, b: BoxGeometry): BoxGeometry {
  if (!a) return b
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}

/** Compute each page's content bounding box from its runs (vertical extent
 *  approximated from font size) and rules (exact). */
function finalizeContentBoxes(pages: PageGeometry[]): void {
  for (const page of pages) {
    let box: BoxGeometry | undefined
    for (const run of page.textRuns) {
      box = unionBox(box, {
        x: run.x,
        y: run.y - run.size * CAP,
        width: run.width,
        height: run.size * (CAP + DESC),
      })
    }
    for (const rule of page.rules) box = unionBox(box, rule)
    if (box) page.contentBox = box
  }
}

/** Walk the XDV once, producing geometry + .notdef placements + a reliability flag. */
export function parseXdv(xdv: Uint8Array): XdvParse {
  const s: PState = {
    r: new Reader(xdv),
    placements: [],
    pages: [],
    cur: null,
    paper: null,
    fontSize: new Map(),
    fontName: new Map(),
    dvi2pts: 0,
    reliable: true,
    page: 0,
    curFont: -1,
    st: { h: 0, v: 0, w: 0, x: 0, y: 0, z: 0 },
    stack: [],
  }
  // A malformed/truncated XDV must never crash an otherwise-successful compile (this
  // runs on every XeLaTeX compile now). Any out-of-bounds read just ends the walk and
  // marks the result unreliable, keeping whatever was parsed so far.
  try {
    while (!s.r.eof) {
      const op = s.r.u8()
      if (opMovement(op, s)) continue
      if (opFontText(op, s)) continue
      const res = opStructural(op, s)
      if (res === 'stop') break
      if (res === 'no') {
        s.reliable = false // unknown opcode — can't track further
        break
      }
    }
  } catch {
    s.reliable = false // truncated/malformed XDV — stop, keep partial geometry
  }
  finalizeContentBoxes(s.pages)
  return { pages: s.pages, placements: s.placements, reliable: s.reliable }
}

/** Page/box geometry for the document (#54 slice 3). Thin wrapper over {@link parseXdv}. */
export function parseXdvGeometry(xdv: Uint8Array): DocumentGeometry {
  const { pages, reliable } = parseXdv(xdv)
  return { pages, reliable }
}

/** Every `.notdef` box and its position (#89 L2b). Thin wrapper over {@link parseXdv}. */
export function parseXdvNotdef(xdv: Uint8Array): XdvNotdefResult {
  const { placements, reliable } = parseXdv(xdv)
  return { placements, reliable }
}

/**
 * Zip ordered `.notdef` placements onto the log's ordered missing-char occurrences and
 * attach output positions to each glyph gap (#89 L2b). Both follow document order. Only
 * attaches when the parse is reliable AND the counts match exactly — otherwise positions
 * could be misaligned, so we leave them off rather than risk wrong overlay boxes. The
 * .notdef box is approximated as an em square on the baseline (no font metrics).
 */
export function attachPlacements(
  gaps: FontGlyphGap[],
  placements: NotdefPlacement[],
  reliable: boolean,
  log: string,
): void {
  if (!reliable || placements.length === 0) return
  const occ = parseGlyphOccurrences(log)
  if (occ.length !== placements.length) return // can't align safely

  const byFont = new Map(gaps.map((g) => [g.font, g]))
  const perFont = new Map<string, NonNullable<FontGlyphGap['occurrences']>>()
  for (let i = 0; i < occ.length; i++) {
    const { font, codepoint } = occ[i]!
    const p = placements[i]!
    const list = perFont.get(font) ?? []
    list.push({
      codepoint,
      output: {
        page: p.page,
        x: p.x,
        y: p.y - p.size * CAP, // baseline → approximate box top (cap height ≈ 0.8em)
        width: p.size,
        height: p.size,
      },
    })
    perFont.set(font, list)
  }
  for (const [font, list] of perFont) {
    const gap = byFont.get(font)
    if (gap) gap.occurrences = list
  }
}

/** Convenience: parse the XDV and attach .notdef overlay positions to `gaps`. */
export function attachGlyphOutput(gaps: FontGlyphGap[], xdv: Uint8Array, log: string): void {
  const { placements, reliable } = parseXdvNotdef(xdv)
  attachPlacements(gaps, placements, reliable, log)
}
