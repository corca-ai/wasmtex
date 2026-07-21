import { parseGlyphOccurrences as R } from "./parse-errors.js";
const v = 128, b = 132, x = 133, E = 137, O = 138, U = 139, X = 140, C = 141, I = 142, w = 143, L = 147, m = 148, G = 152, y = 153, k = 157, A = 161, z = 162, B = 166, T = 167, l = 171, N = 235, F = 239, M = 243, V = 247, H = 248, Y = 252, W = 253, Z = 254, g = 0.8, K = 0.2;
class j {
  dv;
  pos = 0;
  constructor(e) {
    this.dv = new DataView(e.buffer, e.byteOffset, e.byteLength);
  }
  get eof() {
    return this.pos >= this.dv.byteLength;
  }
  u8() {
    return this.dv.getUint8(this.pos++);
  }
  u16() {
    const e = this.dv.getUint16(this.pos);
    return this.pos += 2, e;
  }
  u32() {
    const e = this.dv.getUint32(this.pos);
    return this.pos += 4, e;
  }
  s32() {
    const e = this.dv.getInt32(this.pos);
    return this.pos += 4, e;
  }
  /** Unsigned big-endian of `n` bytes (n = 1..4). */
  uint(e) {
    let n = 0;
    for (let r = 0; r < e; r++) n = n * 256 + this.u8();
    return n;
  }
  /** Signed big-endian of `n` bytes (top byte sign-extended). */
  sint(e) {
    let n = this.u8();
    n >= 128 && (n -= 256);
    for (let r = 1; r < e; r++) n = n * 256 + this.u8();
    return n;
  }
  /** `n` bytes decoded as Latin-1/ASCII (used for font names + specials). */
  ascii(e) {
    let n = "";
    for (let r = 0; r < e; r++) n += String.fromCharCode(this.u8());
    return n;
  }
  /** `n` UTF-16BE code units (XDV stores run text this way). */
  utf16(e) {
    let n = "";
    for (let r = 0; r < e; r++) n += String.fromCharCode(this.u16());
    return n;
  }
  skip(e) {
    this.pos += e;
  }
}
const p = 72;
function c(t, e) {
  return t >= e && t <= e + 3;
}
function q(t, e, n, r) {
  if (!t.cur) return;
  const i = {
    x: p + t.st.h * t.dvi2pts,
    y: p + t.st.v * t.dvi2pts,
    width: e * t.dvi2pts,
    size: (t.fontSize.get(t.curFont) ?? 0) * t.dvi2pts,
    glyphs: n
  };
  r && (i.text = r);
  const u = t.fontName.get(t.curFont);
  u && (i.font = u), t.cur.textRuns.push(i);
}
function S(t, e) {
  const { r: n } = t, r = e ? n.utf16(n.u16()) : void 0, i = n.s32(), u = n.u16(), f = new Array(u), o = new Array(u);
  for (let s = 0; s < u; s++)
    f[s] = n.s32(), o[s] = n.s32();
  const h = (t.fontSize.get(t.curFont) ?? 0) * t.dvi2pts;
  for (let s = 0; s < u; s++)
    n.u16() === 0 && t.placements.push({
      page: t.page,
      x: p + (t.st.h + f[s]) * t.dvi2pts,
      y: p + (t.st.v + o[s]) * t.dvi2pts,
      size: h
    });
  q(t, i, u, r), t.st.h += i;
}
function J(t) {
  const { r: e } = t, n = e.s32(), r = e.u32(), i = e.u16();
  t.fontName.set(n, e.ascii(e.u8()).replace(/^.*\//, "")), e.skip(4), i & 512 && e.skip(4), i & 4096 && e.skip(4), i & 8192 && e.skip(4), i & 16384 && e.skip(4), t.fontSize.set(n, r);
}
function P(t, e, n) {
  !t.cur || e <= 0 || n <= 0 || t.cur.rules.push({
    x: p + t.st.h * t.dvi2pts,
    y: p + (t.st.v - e) * t.dvi2pts,
    width: n * t.dvi2pts,
    height: e * t.dvi2pts
  });
}
function Q(t, e) {
  const { r: n, st: r } = e;
  return c(t, w) ? (r.h += n.sint(t - w + 1), !0) : c(t, k) ? (r.v += n.sint(t - k + 1), !0) : c(t, m) ? (r.w = n.sint(t - m + 1), r.h += r.w, !0) : c(t, y) ? (r.x = n.sint(t - y + 1), r.h += r.x, !0) : c(t, z) ? (r.y = n.sint(t - z + 1), r.v += r.y, !0) : c(t, T) ? (r.z = n.sint(t - T + 1), r.v += r.z, !0) : $(t, e);
}
function $(t, e) {
  const { r: n, st: r } = e;
  if (t === L)
    return r.h += r.w, !0;
  if (t === G)
    return r.h += r.x, !0;
  if (t === A)
    return r.v += r.y, !0;
  if (t === B)
    return r.v += r.z, !0;
  if (t === b) {
    const i = n.s32(), u = n.s32();
    return P(e, i, u), r.h += u, !0;
  }
  return t === E ? (P(e, n.s32(), n.s32()), !0) : !1;
}
function tt(t, e) {
  const { r: n } = e;
  return t <= 127 ? (e.reliable = !1, !0) : t >= l && t <= l + 63 ? (e.curFont = t - l, !0) : c(t, v) ? (n.skip(t - v + 1), e.reliable = !1, !0) : c(t, x) ? (n.skip(t - x + 1), !0) : c(t, N) ? (e.curFont = n.uint(t - N + 1), !0) : c(t, M) ? (nt(e, t), !0) : c(t, F) ? (it(e, n.ascii(n.uint(t - F + 1))), !0) : et(t, e);
}
function et(t, e) {
  return t === Y ? (J(e), !0) : t === W ? (S(e, !1), !0) : t === Z ? (S(e, !0), !0) : !1;
}
function nt(t, e) {
  const { r: n } = t;
  n.skip(e - M + 1), n.skip(12);
  const r = n.u8(), i = n.u8();
  n.skip(r + i);
}
const _ = {
  bp: 1,
  pt: 72 / 72.27,
  in: 72,
  mm: 72 / 25.4,
  cm: 72 / 2.54
}, rt = /([\d.]+)\s*(bp|pt|in|mm|cm)\b/gi;
function it(t, e) {
  if (!/p(?:aper|age)size/i.test(e)) return;
  const n = [...e.matchAll(rt)];
  if (n.length < 2) return;
  const r = Number(n[0][1]) * (_[n[0][2].toLowerCase()] ?? 1), i = Number(n[1][1]) * (_[n[1][2].toLowerCase()] ?? 1);
  r > 0 && i > 0 && (t.paper = { width: r, height: i }, t.cur && (t.cur.width = r, t.cur.height = i));
}
function st(t) {
  const e = { page: t.page, textRuns: [], rules: [] };
  t.paper && (e.width = t.paper.width, e.height = t.paper.height), t.pages.push(e), t.cur = e;
}
function ut(t, e) {
  const { r: n } = e;
  switch (t) {
    case O:
    case X:
      return "ok";
    case C:
      return e.stack.push({ ...e.st }), "ok";
    case I: {
      const r = e.stack.pop();
      return r && (e.st = r), "ok";
    }
    case U:
      return e.page = n.s32(), n.skip(40), e.st = { h: 0, v: 0, w: 0, x: 0, y: 0, z: 0 }, e.stack.length = 0, st(e), "ok";
    case V: {
      n.u8();
      const r = n.u32(), i = n.u32();
      return n.u32(), n.skip(n.u8()), e.dvi2pts = r / i * (72 / 254e3), "ok";
    }
    case H:
      return "stop";
    default:
      return "no";
  }
}
function D(t, e) {
  if (!t) return e;
  const n = Math.min(t.x, e.x), r = Math.min(t.y, e.y);
  return {
    x: n,
    y: r,
    width: Math.max(t.x + t.width, e.x + e.width) - n,
    height: Math.max(t.y + t.height, e.y + e.height) - r
  };
}
function ot(t) {
  for (const e of t) {
    let n;
    for (const r of e.textRuns)
      n = D(n, {
        x: r.x,
        y: r.y - r.size * g,
        width: r.width,
        height: r.size * (g + K)
      });
    for (const r of e.rules) n = D(n, r);
    n && (e.contentBox = n);
  }
}
function ft(t) {
  const e = {
    r: new j(t),
    placements: [],
    pages: [],
    cur: null,
    paper: null,
    fontSize: /* @__PURE__ */ new Map(),
    fontName: /* @__PURE__ */ new Map(),
    dvi2pts: 0,
    reliable: !0,
    page: 0,
    curFont: -1,
    st: { h: 0, v: 0, w: 0, x: 0, y: 0, z: 0 },
    stack: []
  };
  try {
    for (; !e.r.eof; ) {
      const n = e.r.u8();
      if (Q(n, e) || tt(n, e)) continue;
      const r = ut(n, e);
      if (r === "stop") break;
      if (r === "no") {
        e.reliable = !1;
        break;
      }
    }
  } catch {
    e.reliable = !1;
  }
  return ot(e.pages), { pages: e.pages, placements: e.placements, reliable: e.reliable };
}
function ht(t, e, n, r) {
  if (!n || e.length === 0) return;
  const i = R(r);
  if (i.length !== e.length) return;
  const u = new Map(t.map((o) => [o.font, o])), f = /* @__PURE__ */ new Map();
  for (let o = 0; o < i.length; o++) {
    const { font: h, codepoint: s } = i[o], a = e[o], d = f.get(h) ?? [];
    d.push({
      codepoint: s,
      output: {
        page: a.page,
        x: a.x,
        y: a.y - a.size * g,
        // baseline → approximate box top (cap height ≈ 0.8em)
        width: a.size,
        height: a.size
      }
    }), f.set(h, d);
  }
  for (const [o, h] of f) {
    const s = u.get(o);
    s && (s.occurrences = h);
  }
}
export {
  ht as attachPlacements,
  ft as parseXdv
};
