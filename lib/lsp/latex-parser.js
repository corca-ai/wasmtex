import { CITE_CMDS as b, SECTION_CMDS as B, NEWCMD_CMDS as h, COMMAND_TOKEN as F, INPUT_CMDS as P, USEPACKAGE_CMDS as L, REF_CMDS as A } from "./latex-patterns.js";
import { tokenize as R, VERBATIM_ENVIRONMENTS as U } from "./latex-tokenizer.js";
import { buildLineStarts as z, offsetToLineCol as W } from "./source-position.js";
const j = /* @__PURE__ */ new Set([
  "if",
  "ifx",
  "ifnum",
  "ifdim",
  "ifodd",
  "ifvmode",
  "ifhmode",
  "ifmmode",
  "ifinner",
  "ifvoid",
  "ifhbox",
  "ifvbox",
  "ifeof",
  "ifcase",
  "ifdefined",
  "ifcsname",
  "ifincsname",
  "iffontchar"
]), q = /* @__PURE__ */ new Set([
  "ifthenelse",
  "ifoddpage",
  "ifdef",
  "ifcsdef",
  "ifundef",
  "ifcsundef",
  "ifdefmacro",
  "ifdefparam",
  "ifdefempty",
  "ifcsempty",
  "ifdefvoid",
  "ifdefstring",
  "ifcsstring",
  "ifdefstrequal",
  "ifdefcounter",
  "ifcscounter",
  "ifdefdimen",
  "ifcsdimen",
  "ifboolexpr",
  "ifblank",
  "ifstrequal",
  "ifstrempty",
  "ifnumcomp",
  "ifnumequal",
  "ifnumgreater",
  "ifnumless",
  "ifdimcomp",
  "ifdimequal",
  "ifdimgreater",
  "ifdimless",
  "ifbool",
  "iftoggle",
  "ifnumodd",
  "ifnumparity"
]);
function G(n) {
  return n.length > 2 && n.startsWith("if") && n !== "iff" && !q.has(n);
}
function V(n, i = []) {
  const e = [], t = [], o = (s) => i.some(([c, f]) => s >= c && s < f);
  for (const s of n)
    s.type === "command" && !o(s.start) && X(s, t, e);
  return e;
}
function X(n, i, e) {
  const t = n.value;
  t === "iffalse" ? i.push({ kind: "false", falseStart: n.end, elseSeen: !1 }) : t === "iftrue" ? i.push({ kind: "true", falseStart: -1, elseSeen: !1 }) : t === "if" || j.has(t) || G(t) ? i.push({ kind: "other", falseStart: -1, elseSeen: !1 }) : t === "else" ? K(i[i.length - 1], n, e) : t === "fi" && H(i.pop(), n, e);
}
function K(n, i, e) {
  !n || n.elseSeen || (n.elseSeen = !0, n.kind === "false" ? e.push([n.falseStart, i.start]) : n.kind === "true" && (n.falseStart = i.end));
}
function H(n, i, e) {
  n && (n.kind === "false" && !n.elseSeen ? e.push([n.falseStart, i.start]) : n.kind === "true" && n.elseSeen && e.push([n.falseStart, i.start]));
}
function J(n) {
  const i = [];
  for (let e = 0; e < n.length; e++) {
    const t = n[e];
    if (t.type !== "command" || t.value !== "begin") continue;
    const o = x(n, e);
    if (!o || !U.has(o.name)) continue;
    const s = Q(n, o.closeIndex + 1, o.name), c = s?.start ?? n[n.length - 1].end;
    c > o.closeEnd && i.push([o.closeEnd, c]), s && (e = s.index);
  }
  return i;
}
function Q(n, i, e) {
  for (let t = i; t < n.length; t++) {
    const o = n[t];
    if (o.type !== "command" || o.value !== "end") continue;
    const s = x(n, t);
    if (s && s.name === e) return { start: o.start, index: t };
  }
  return null;
}
function x(n, i) {
  let e = i + 1;
  for (; e < n.length && n[e].type === "text" && n[e].value.trim() === ""; ) e++;
  if (e >= n.length || n[e].type !== "open") return null;
  const t = n[e + 1];
  if (!t || t.type !== "text") return null;
  const o = n[e + 2];
  return !o || o.type !== "close" ? null : { name: t.value.trim(), closeIndex: e + 2, closeEnd: o.end };
}
function $n(n) {
  return g(R(n));
}
function Bn(n) {
  return g(n);
}
function g(n) {
  const i = [];
  for (const t of n)
    (t.type === "comment" || t.type === "verb") && i.push([t.start, t.end]);
  const e = J(n);
  return i.push(...e), i.push(...V(n, e)), i;
}
function Y(n, i) {
  return C(n, g(i));
}
function C(n, i) {
  if (i.length === 0) return n;
  const e = i.length > 1 ? [...i].sort((s, c) => s[0] - c[0]) : i, t = [];
  let o = 0;
  for (const [s, c] of e) {
    const f = s > o ? s : o, r = c < n.length ? c : n.length;
    r <= f || (f > o && t.push(n.slice(o, f)), t.push(n.slice(f, r).replace(/[^\n]/g, " ")), o = r);
  }
  return o < n.length && t.push(n.slice(o)), t.join("");
}
function l(n, i) {
  if (n[i] !== "{") return null;
  let e = 0;
  for (let t = i; t < n.length; t++) {
    if (n[t] === "\\") {
      t++;
      continue;
    }
    if (n[t] === "{") e++;
    else if (n[t] === "}" && (e--, e === 0))
      return n.slice(i + 1, t);
  }
  return null;
}
const M = /\\label\{/g, _ = new RegExp(`\\\\(?:${A})\\{`, "g"), k = new RegExp(`\\\\(?:${b})(?:\\[[^\\]]*\\])*\\{`, "g"), Z = new RegExp(`\\\\(${B})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), nn = new RegExp(`\\\\(?:${h})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, "g"), en = /\\def\\(\w+)/g, tn = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, on = /\\bibitem(?:\[[^\]]*\])?\{/g, sn = /\\begin\{/g, cn = /\\(?:newenvironment|renewenvironment)\{([^}]+)\}/g, fn = new RegExp(`\\\\(${P})\\{`, "g"), rn = new RegExp(`\\\\(?:${L})(?:\\[([^\\]]*)\\])?\\{`, "g");
function a(n, i) {
  const { line: e, column: t } = W(n.lineStarts, i);
  return { file: n.file, line: e, column: t };
}
function ln(n, i) {
  const e = i.trimStart();
  return n + 1 + (i.length - e.length);
}
function p(n, i, e, t) {
  for (const o of n.masked.matchAll(i)) {
    const s = o.index + o[0].length - 1, c = l(n.masked, s);
    if (!c) continue;
    const f = c.trim();
    !f || e && f.includes("#") || t(f, a(n, ln(s, c)));
  }
}
function an(n, i) {
  p(
    n,
    M,
    !0,
    (e, t) => i.labels.push({ name: e, location: t })
  );
}
function un(n, i) {
  p(
    n,
    _,
    !0,
    (e, t) => i.labelRefs.push({ name: e, location: t })
  );
}
function dn(n, i) {
  for (const e of n.masked.matchAll(k)) {
    const t = e.index + e[0].length - 1, o = l(n.masked, t);
    if (!o) continue;
    let s = t + 1;
    for (const c of o.split(",")) {
      const f = c.trim();
      f && !f.includes("#") && i.citations.push({
        key: f,
        location: a(n, s + c.indexOf(f))
      }), s += c.length + 1;
    }
  }
}
function mn(n, i) {
  for (const e of n.masked.matchAll(Z)) {
    const t = l(n.masked, e.index + e[0].length - 1);
    t && i.sections.push({ level: e[1], title: t, location: a(n, e.index) });
  }
}
function E(n, i, e, t, o) {
  const s = { name: i, location: a(n, e + 1) };
  o && (s.argCount = Number.parseInt(o, 10)), t.commands.push(s);
}
function hn(n, i) {
  for (const e of n.masked.matchAll(nn)) {
    const t = e[1], o = n.masked.indexOf(`\\${t}`, e.index + 1);
    E(n, t, o, i, e[2]);
  }
}
function gn(n, i) {
  for (const e of n.masked.matchAll(en)) {
    const t = e[1];
    E(n, t, n.masked.indexOf(`\\${t}`, e.index + 1), i);
  }
}
const pn = new RegExp(F, "g");
function En(n, i) {
  for (const e of n.masked.matchAll(pn))
    i.commandUses.push({ name: e[1], location: a(n, e.index + 1) });
}
function Sn(n, i) {
  for (const e of n.masked.matchAll(tn)) {
    const t = e[1];
    E(n, t, n.masked.indexOf(`\\${t}`, e.index + 1), i);
  }
}
function bn(n, i) {
  p(
    n,
    on,
    !1,
    (e, t) => i.bibItems.push({ key: e, location: t })
  );
}
function An(n, i) {
  for (const e of n.masked.matchAll(sn)) {
    const t = l(n.masked, e.index + e[0].length - 1);
    t && i.environments.push({ name: t, location: a(n, e.index) });
  }
}
function Rn(n, i) {
  for (const e of n.masked.matchAll(cn))
    i.environmentDefs.push({ name: e[1], location: a(n, e.index) });
}
function xn(n, i) {
  for (const e of n.masked.matchAll(fn)) {
    const t = n.masked.indexOf("{", e.index + e[1].length + 1);
    if (t < 0) continue;
    const o = l(n.masked, t);
    o && i.includes.push({
      path: o,
      location: a(n, e.index),
      type: e[1]
    });
  }
}
function Cn(n, i) {
  for (const e of n.masked.matchAll(rn)) {
    const t = n.masked.indexOf("{", e.index + e[0].length - 1);
    if (t < 0) continue;
    const o = l(n.masked, t);
    if (!o) continue;
    const s = a(n, e.index);
    for (const c of o.split(",")) {
      const f = c.trim();
      f && i.packages.push({ name: f, options: e[1] ?? "", location: s });
    }
  }
}
const w = new RegExp(
  `\\\\(?:${h})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`,
  "g"
), I = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
function N(n) {
  const i = /* @__PURE__ */ new Map();
  for (const e of n.matchAll(w)) {
    const t = e.index + e[0].length - 1, o = l(n, t);
    o !== null && i.set(e[1], {
      argCount: e[2] ? Number.parseInt(e[2], 10) : 0,
      body: o,
      optional: e[3]
    });
  }
  for (const e of n.matchAll(I)) {
    const t = e.index + e[0].length - 1, o = l(n, t);
    o !== null && i.set(e[1], { argCount: (e[2].match(/#/g) || []).length, body: o });
  }
  return i;
}
const Mn = new RegExp(`\\\\(?:label|${A}|${b})\\b`);
function y(n) {
  const i = /* @__PURE__ */ new Set();
  let e = !0;
  for (; e; ) {
    e = !1;
    for (const [t, o] of n)
      i.has(t) || (Mn.test(o.body) || _n(o.body, n, i)) && (i.add(t), e = !0);
  }
  return i;
}
function _n(n, i, e) {
  for (const t of n.matchAll(/\\(\w+)/g))
    if (e.has(t[1]) && i.has(t[1])) return !0;
  return !1;
}
const D = (n, i) => {
  for (; i < n.length && /\s/.test(n[i]); ) i++;
  return i;
};
function kn(n, i, e) {
  const t = D(n, i), o = n[t] === "[" ? n.indexOf("]", t) : -1;
  return o !== -1 ? { value: n.slice(t + 1, o), end: o + 1 } : { value: e, end: i };
}
function v(n, i, e, t) {
  const o = [];
  let s = i;
  if (t !== void 0 && e > 0) {
    const c = kn(n, s, t);
    o.push(c.value), s = c.end;
  }
  for (; o.length < e && (s = D(n, s), n[s] === "{"); ) {
    const c = l(n, s);
    if (c === null) break;
    o.push(c), s += c.length + 2;
  }
  return { args: o, end: s };
}
const wn = 4;
function O(n, i, e, t, o) {
  const s = e.get(n);
  if (!s || t > wn || o.has(n)) return "";
  let c = s.body.replace(/#(\d)/g, (f, r) => i[Number(r) - 1] ?? "");
  return c = c.replace(/\\(\w+)/g, (f, r, u) => {
    const d = e.get(r);
    if (!d) return f;
    const { args: $ } = v(
      c,
      u + f.length,
      d.argCount,
      d.optional
    ), S = new Set(o);
    return S.add(n), O(r, $, e, t + 1, S);
  }), c;
}
const In = new RegExp(
  `(?:\\\\(?:${h}|DeclareMathOperator)\\*?\\{|\\\\def)$`
);
function T(n, i) {
  return In.test(n.slice(Math.max(0, i - 24), i));
}
function Nn(n) {
  const i = N(n);
  if (i.size === 0) return [];
  const e = y(i);
  if (e.size === 0) return [];
  const t = /* @__PURE__ */ new Set();
  for (const c of n.matchAll(/\\(\w+)/g)) {
    const f = c[1];
    e.has(f) && !T(n, c.index) && t.add(f);
  }
  if (t.size === 0) return [];
  const o = [], s = (c) => {
    for (const f of n.matchAll(c)) {
      if (!t.has(f[1])) continue;
      const r = f.index + f[0].length - 1, u = l(n, r);
      u !== null && o.push([r + 1, r + 1 + u.length]);
    }
  };
  return s(w), s(I), o;
}
function yn(n, i) {
  const e = N(n.masked);
  if (e.size === 0) return;
  const t = y(e);
  if (t.size === 0) return;
  const o = /\\(\w+)/g;
  for (const s of n.masked.matchAll(o)) {
    const c = s[1];
    if (!t.has(c) || T(n.masked, s.index)) continue;
    const f = e.get(c), { args: r } = v(n.masked, s.index + s[0].length, f.argCount, f.optional), u = O(c, r, e, 0, /* @__PURE__ */ new Set());
    if (!u) continue;
    const d = a(n, s.index);
    Dn(u, d, i);
  }
}
function m(n) {
  const i = n?.trim();
  return i && !i.includes("#") ? i : null;
}
function Dn(n, i, e) {
  for (const t of n.matchAll(M)) {
    const o = m(l(n, t.index + t[0].length - 1));
    o && e.labels.push({ name: o, location: i });
  }
  for (const t of n.matchAll(_)) {
    const o = m(l(n, t.index + t[0].length - 1));
    o && e.labelRefs.push({ name: o, location: i });
  }
  for (const t of n.matchAll(k)) {
    const o = l(n, t.index + t[0].length - 1);
    for (const s of o?.split(",") ?? []) {
      const c = m(s);
      c && e.citations.push({ key: c, location: i });
    }
  }
}
function Fn(n, i) {
  const e = {
    labels: [],
    labelRefs: [],
    citations: [],
    sections: [],
    commands: [],
    commandUses: [],
    environments: [],
    environmentDefs: [],
    includes: [],
    packages: [],
    bibItems: []
  }, t = R(n), o = Y(n, t), s = { masked: o, lineStarts: z(o), file: i }, c = { ...s, masked: C(o, Nn(o)) };
  return an(c, e), un(c, e), dn(c, e), mn(s, e), hn(s, e), gn(s, e), Sn(s, e), En(s, e), bn(s, e), An(s, e), Rn(s, e), xn(s, e), Cn(s, e), yn(s, e), e;
}
export {
  $n as maskSpans,
  Bn as maskSpansFromTokens,
  Fn as parseLatexFile
};
