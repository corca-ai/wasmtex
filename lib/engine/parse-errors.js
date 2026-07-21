const h = /\.(tex|sty|cls|aux|fd|def|cfg|clo|bbl|bst|ltx|dtx|ldf|map|enc|tfm|fmt)$/;
function g(n) {
  return n.startsWith("./") || n.startsWith("/") ? !0 : h.test(n);
}
function m(n) {
  return n.startsWith("./") ? n.slice(2).replace(/\/\.\//g, "/") : n.startsWith("/work/") ? n.slice(6).replace(/\/\.\//g, "/").replace(/^\.\//, "") : n.replace(/\/\.\//g, "/");
}
function d(n, e) {
  const s = n.slice(e + 1).match(/^([^()\s]+)/);
  return s && g(s[1]) ? { raw: s[1], path: m(s[1]), consumed: 1 + s[1].length } : null;
}
function y(n) {
  const e = [];
  let t = 0;
  for (let s = 0; s < n.length; s++) {
    const r = n[s];
    let o = 0;
    for (; o < r.length; ) {
      if (r[o] === "(") {
        const i = d(r, o);
        if (i) {
          e.push({ type: "open", path: i.path, raw: i.raw }), o += i.consumed;
          continue;
        }
        t++;
      } else r[o] === ")" && (t > 0 ? t-- : e.push({ type: "close" }));
      o++;
    }
    e.push({ type: "eol", lineIndex: s });
  }
  return e;
}
function k(n) {
  const e = [], t = [];
  for (const s of y(n))
    s.type === "open" ? e.push(s.path) : s.type === "close" ? e.length > 0 && e.pop() : t[s.lineIndex] = e.length > 0 ? e[e.length - 1] : "";
  return t;
}
function u(n, e) {
  const t = Math.min(e + 5, n.length);
  for (let s = e; s < t; s++) {
    const r = n[s].match(/^l\.(\d+)\s/);
    if (r) return parseInt(r[1], 10);
  }
  return 0;
}
function b(n, e) {
  const t = n.match(/at lines? (\d+)/) ?? e.match(/at lines? (\d+)/);
  return t ? parseInt(t[1], 10) : 0;
}
function f(n) {
  const e = n.match(/on input line (\d+)/);
  return e ? parseInt(e[1], 10) : 0;
}
const $ = /File `([^']+\.(?:sty|cls))' not found/;
function x(n) {
  const e = n.message.match($);
  if (!e) return;
  const t = e[1], s = t.endsWith(".cls") ? "class" : "package", r = t.replace(/\.(?:sty|cls)$/, "");
  n.code = "missing-package", n.message = `${n.message} — ${s} \`${r}\` is not on the bundled TeX Live mirror (or the name is misspelled).`;
}
function v(n, e, t) {
  if (!/^Package fontspec Error:/.test(n.message)) return;
  const s = /The font "([^"]+)" cannot be found/;
  let r = n.message.match(s);
  for (let i = t + 1; !r && i < Math.min(t + 8, e.length); i++)
    r = e[i].match(s);
  if (!r) return;
  const o = r[1];
  n.code = "font-not-found", n.message = `Font "${o}" could not be found — check the name and that the font is on the bundled mirror. In LuaLaTeX, reference fonts by filename (e.g. \`lmroman10-regular.otf\`) or use XeLaTeX.`;
}
function w(n, e, t, s) {
  const r = n.match(/^! (.+)/);
  if (!r) return !1;
  const o = { line: u(e, t + 1), message: r[1], severity: "error" };
  return x(o), v(o, e, t), s.push(o), !0;
}
function E(n, e) {
  const t = n.match(/LaTeX Warning:\s*(.+)/);
  return t ? (e.push({ line: f(n), message: t[1], severity: "warning" }), !0) : !1;
}
function I(n, e, t, s) {
  const r = n.match(/^Package (\S+) Error:\s*(.+)/);
  if (!r) return !1;
  const o = f(n) || u(e, t + 1);
  return s.push({ line: o, message: `[${r[1]}] ${r[2]}`, severity: "error" }), !0;
}
function L(n, e) {
  const t = n.match(/^Package (\S+) Warning:\s*(.+)/);
  return t ? (t[1] === "epstopdf" && /shell escape feature is not enabled/i.test(t[2]) || e.push({ line: f(n), message: `[${t[1]}] ${t[2]}`, severity: "warning" }), !0) : !1;
}
function S(n, e, t) {
  return /^Overfull \\[hv]box .+/.test(n) ? (t.push({ line: b(n, e), message: n, severity: "warning" }), !0) : !1;
}
function P(n) {
  const e = [], t = n.split(`
`), s = k(t);
  for (let r = 0; r < t.length; r++) {
    const o = t[r], i = e.length;
    w(o, t, r, e) || E(o, e) || I(o, t, r, e) || L(o, e) || S(o, t[r + 1] ?? "", e);
    const c = s[r];
    if (c)
      for (let a = i; a < e.length; a++)
        e[a].file = c;
  }
  return e.push(...F(n)), e;
}
function F(n) {
  return l(n).map((e) => {
    const t = e.script ? `${e.script} ` : "";
    return {
      line: 0,
      message: `Font [${e.font}] has no glyph for ${e.codepoints.length} ${t}character(s) used in the document (e.g. ${e.sample}); they render as blank boxes.`,
      severity: "warning",
      code: "missing-glyph"
    };
  });
}
const W = /^Missing character: There is no (.+?)(?: \(U\+([0-9A-Fa-f]+)\))? in font (.+?)!?\s*$/, N = [
  "Hangul",
  "Hiragana",
  "Katakana",
  "Han",
  "Cyrillic",
  "Greek",
  "Arabic",
  "Hebrew",
  "Thai",
  "Devanagari",
  "Latin"
];
function C(n) {
  const e = /* @__PURE__ */ new Map();
  for (const r of n) {
    const o = String.fromCodePoint(r);
    for (const i of N) {
      let c;
      try {
        c = new RegExp(`\\p{Script=${i}}`, "u");
      } catch {
        continue;
      }
      if (c.test(o)) {
        e.set(i, (e.get(i) ?? 0) + 1);
        break;
      }
    }
  }
  let t, s = 0;
  for (const [r, o] of e)
    o > s && (t = r, s = o);
  return t;
}
function T(n) {
  const e = /^\^\^([0-9a-f]{2})$/.exec(n);
  if (e) return parseInt(e[1], 16);
  const t = /^\^\^([\s\S])$/.exec(n);
  return t ? t[1].charCodeAt(0) ^ 64 : n.codePointAt(0) ?? NaN;
}
function M(n) {
  const e = n.match(W);
  if (!e) return null;
  const t = e[2] ? parseInt(e[2], 16) : e[1] != null ? T(e[1]) : NaN;
  return !Number.isInteger(t) || t < 0 || t > 1114111 ? null : { font: e[3].replace(/^\[/, "").replace(/\]$/, ""), cp: t };
}
function R(n) {
  const e = [];
  for (const t of n.split(`
`)) {
    const s = M(t);
    s && e.push({ font: s.font, codepoint: s.cp });
  }
  return e;
}
function l(n) {
  const e = /* @__PURE__ */ new Map();
  for (const { font: s, codepoint: r } of R(n)) {
    let o = e.get(s);
    o || (o = { cps: [], seen: /* @__PURE__ */ new Set(), count: 0 }, e.set(s, o)), o.count++, o.seen.has(r) || (o.seen.add(r), o.cps.push(r));
  }
  const t = [];
  for (const [s, r] of e) {
    const o = r.cps.slice().sort((a, p) => a - p), i = {
      font: s,
      codepoints: o,
      count: r.count,
      sample: o.slice(0, 8).map((a) => String.fromCodePoint(a)).join("")
    }, c = C(o);
    c && (i.script = c), t.push(i);
  }
  return t;
}
function A(n) {
  if (n.code === "missing-package") return "missing-package";
  if (n.code === "font-not-found") return "font-not-found";
  const e = n.message;
  return /Reference `[^']*'.*undefined/i.test(e) ? "undefined-reference" : /Citation `[^']*'.*undefined/i.test(e) ? "undefined-citation" : /Rerun|Label\(s\) may have changed/i.test(e) ? "rerun-needed" : /^Overfull /.test(e) ? "overfull-box" : /^Package \S+ Error:/.test(e) ? "package-error" : /^Package \S+ Warning:/.test(e) ? "package-warning" : /^\[[^\]]+] /.test(e) ? n.severity === "error" ? "package-error" : "package-warning" : n.severity === "error" ? "tex-error" : "latex-warning";
}
function G(n) {
  const e = A(n), t = {
    code: e,
    severity: e === "rerun-needed" ? "info" : n.severity,
    message: n.message
  };
  return n.file && (t.file = n.file), n.line && (t.line = n.line), t;
}
function _(n, e = l(n)) {
  const t = [];
  for (const s of P(n))
    s.code !== "missing-glyph" && t.push(G(s));
  for (const s of e) {
    const r = s.script ? `${s.script} ` : "";
    t.push({
      code: "missing-glyph",
      severity: "warning",
      message: `Font [${s.font}] has no glyph for ${s.codepoints.length} ${r}character(s) (e.g. ${s.sample}); they render as blank boxes.`,
      glyph: s
    });
  }
  return t;
}
export {
  _ as buildDiagnostics,
  k as buildFileContext,
  l as parseGlyphGaps,
  R as parseGlyphOccurrences,
  P as parseTexErrors,
  y as scanFileEvents
};
