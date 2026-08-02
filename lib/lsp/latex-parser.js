import { CITE_CMDS as b, SECTION_CMDS as B, NEWCMD_CMDS as E, COMMAND_TOKEN as F, INPUT_CMDS as P, USEPACKAGE_CMDS as U, REF_CMDS as R } from "./latex-patterns.js";
import { tokenize as k, VERBATIM_ENVIRONMENTS as z } from "./latex-tokenizer.js";
import { buildLineStarts as W, offsetToLineCol as G } from "./source-position.js";
const V = /* @__PURE__ */ new Set([
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
]), j = /* @__PURE__ */ new Set([
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
function X(n) {
  return n.length > 2 && n.startsWith("if") && n !== "iff" && !j.has(n);
}
function K(n, o = []) {
  const e = [], t = [], i = (s) => o.some(([c, l]) => s >= c && s < l);
  for (const s of n)
    s.type === "command" && !i(s.start) && H(s, t, e);
  return e;
}
function H(n, o, e) {
  const t = n.value;
  t === "iffalse" ? o.push({ kind: "false", falseStart: n.end, elseSeen: !1 }) : t === "iftrue" ? o.push({ kind: "true", falseStart: -1, elseSeen: !1 }) : t === "if" || V.has(t) || X(t) ? o.push({ kind: "other", falseStart: -1, elseSeen: !1 }) : t === "else" ? Z(o[o.length - 1], n, e) : t === "fi" && J(o.pop(), n, e);
}
function Z(n, o, e) {
  !n || n.elseSeen || (n.elseSeen = !0, n.kind === "false" ? e.push([n.falseStart, o.start]) : n.kind === "true" && (n.falseStart = o.end));
}
function J(n, o, e) {
  n && (n.kind === "false" && !n.elseSeen ? e.push([n.falseStart, o.start]) : n.kind === "true" && n.elseSeen && e.push([n.falseStart, o.start]));
}
function Q(n) {
  const o = [];
  for (let e = 0; e < n.length; e++) {
    const t = n[e];
    if (t.type !== "command" || t.value !== "begin") continue;
    const i = _(n, e);
    if (!i || !z.has(i.name)) continue;
    const s = Y(n, i.closeIndex + 1, i.name), c = s?.start ?? n[n.length - 1].end;
    c > i.closeEnd && o.push([i.closeEnd, c]), s && (e = s.index);
  }
  return o;
}
function Y(n, o, e) {
  for (let t = o; t < n.length; t++) {
    const i = n[t];
    if (i.type !== "command" || i.value !== "end") continue;
    const s = _(n, t);
    if (s && s.name === e) return { start: i.start, index: t };
  }
  return null;
}
function _(n, o) {
  let e = o + 1;
  for (; e < n.length && n[e].type === "text" && n[e].value.trim() === ""; ) e++;
  if (e >= n.length || n[e].type !== "open") return null;
  const t = n[e + 1];
  if (!t || t.type !== "text") return null;
  const i = n[e + 2];
  return !i || i.type !== "close" ? null : { name: t.value.trim(), closeIndex: e + 2, closeEnd: i.end };
}
function Zn(n) {
  return S(k(n));
}
function Jn(n) {
  return S(n);
}
function S(n) {
  const o = [];
  for (const t of n)
    (t.type === "comment" || t.type === "verb") && o.push([t.start, t.end]);
  const e = Q(n);
  return o.push(...e), o.push(...K(n, e)), o;
}
function q(n, o) {
  return x(n, S(o));
}
function x(n, o) {
  if (o.length === 0) return n;
  const e = o.length > 1 ? [...o].sort((s, c) => s[0] - c[0]) : o, t = [];
  let i = 0;
  for (const [s, c] of e) {
    const l = s > i ? s : i, r = c < n.length ? c : n.length;
    r <= l || (l > i && t.push(n.slice(i, l)), t.push(n.slice(l, r).replace(/[^\n]/g, " ")), i = r);
  }
  return i < n.length && t.push(n.slice(i)), t.join("");
}
function f(n, o) {
  if (n[o] !== "{") return null;
  let e = 0;
  for (let t = o; t < n.length; t++) {
    if (n[t] === "\\") {
      t++;
      continue;
    }
    if (n[t] === "{") e++;
    else if (n[t] === "}" && (e--, e === 0))
      return n.slice(o + 1, t);
  }
  return null;
}
const M = /\\label\{/g, I = new RegExp(`\\\\(?:${R})\\{`, "g"), N = new RegExp(`\\\\(?:${b})(?:\\[[^\\]]*\\])*\\{`, "g"), nn = new RegExp(`\\\\(${B})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), en = new RegExp(`\\\\(?:${E})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, "g"), tn = /\\def\\(\w+)/g, on = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, sn = /\\bibitem(?:\[[^\]]*\])?\{/g, cn = /\\begin\{/g, ln = /\\(?:newenvironment|renewenvironment)\{([^}]+)\}/g, rn = new RegExp(`\\\\(${P})\\{`, "g"), fn = new RegExp(`\\\\(?:${U})(?:\\[([^\\]]*)\\])?\\{`, "g"), an = /\\(?:(?:documentclass|LoadClass)(?:\[([^\]]*)\])?|LoadClassWithOptions)\{/g, un = /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g, dn = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g;
function a(n, o) {
  const { line: e, column: t } = G(n.lineStarts, o);
  return { file: n.file, line: e, column: t };
}
function mn(n, o) {
  const e = o.trimStart();
  return n + 1 + (o.length - e.length);
}
function A(n, o, e, t) {
  for (const i of n.masked.matchAll(o)) {
    const s = i.index + i[0].length - 1, c = f(n.masked, s);
    if (!c) continue;
    const l = c.trim();
    !l || e && l.includes("#") || t(l, a(n, mn(s, c)));
  }
}
function hn(n, o) {
  A(
    n,
    M,
    !0,
    (e, t) => o.labels.push({ name: e, location: t })
  );
}
function pn(n, o) {
  A(
    n,
    I,
    !0,
    (e, t) => o.labelRefs.push({ name: e, location: t })
  );
}
function gn(n, o) {
  for (const e of n.masked.matchAll(N)) {
    const t = e.index + e[0].length - 1, i = f(n.masked, t);
    if (!i) continue;
    let s = t + 1;
    for (const c of i.split(",")) {
      const l = c.trim();
      l && !l.includes("#") && o.citations.push({
        key: l,
        location: a(n, s + c.indexOf(l))
      }), s += c.length + 1;
    }
  }
}
function En(n, o) {
  for (const e of n.masked.matchAll(nn)) {
    const t = f(n.masked, e.index + e[0].length - 1);
    t && o.sections.push({ level: e[1], title: t, location: a(n, e.index) });
  }
}
function C(n, o, e, t, i) {
  const s = { name: o, location: a(n, e + 1) };
  i && (s.argCount = Number.parseInt(i, 10)), t.commands.push(s);
}
function Sn(n, o) {
  for (const e of n.masked.matchAll(en)) {
    const t = e[1], i = n.masked.indexOf(`\\${t}`, e.index + 1);
    C(n, t, i, o, e[2]);
  }
}
function An(n, o) {
  for (const e of n.masked.matchAll(tn)) {
    const t = e[1];
    C(n, t, n.masked.indexOf(`\\${t}`, e.index + 1), o);
  }
}
const Cn = new RegExp(F, "g");
function vn(n, o) {
  for (const e of n.masked.matchAll(Cn))
    o.commandUses.push({ name: e[1], location: a(n, e.index + 1) });
}
function bn(n, o) {
  for (const e of n.masked.matchAll(on)) {
    const t = e[1];
    C(n, t, n.masked.indexOf(`\\${t}`, e.index + 1), o);
  }
}
function Rn(n, o) {
  A(
    n,
    sn,
    !1,
    (e, t) => o.bibItems.push({ key: e, location: t })
  );
}
function kn(n, o) {
  for (const e of n.masked.matchAll(cn)) {
    const t = f(n.masked, e.index + e[0].length - 1);
    t && o.environments.push({ name: t, location: a(n, e.index) });
  }
}
function _n(n, o) {
  for (const e of n.masked.matchAll(ln))
    o.environmentDefs.push({ name: e[1], location: a(n, e.index) });
}
function xn(n, o) {
  for (const e of n.masked.matchAll(rn)) {
    const t = n.masked.indexOf("{", e.index + e[1].length + 1);
    if (t < 0) continue;
    const i = f(n.masked, t);
    i && o.includes.push({
      path: i,
      location: a(n, e.index),
      type: e[1]
    });
  }
}
function Mn(n, o) {
  for (const e of n.masked.matchAll(fn)) {
    const t = n.masked.indexOf("{", e.index + e[0].length - 1);
    if (t < 0) continue;
    const i = f(n.masked, t);
    if (!i) continue;
    const s = a(n, e.index);
    for (const c of i.split(",")) {
      const l = c.trim();
      l && o.packages.push({ name: l, options: e[1] ?? "", location: s });
    }
  }
}
function In(n, o) {
  for (const e of n.masked.matchAll(an)) {
    const t = n.masked.indexOf("{", e.index + e[0].length - 1);
    if (t < 0) continue;
    const i = f(n.masked, t)?.trim();
    i && o.classes.push({ name: i, options: e[1] ?? "", location: a(n, e.index) });
  }
}
function Nn(n, o) {
  const e = n[o], t = e === "{" ? "}" : e === "[" ? "]" : null;
  if (!t) return null;
  let i = 1;
  for (let s = o + 1; s < n.length; s++) {
    if (n[s] === "\\") {
      s++;
      continue;
    }
    if (n[s] === e) i++;
    else if (n[s] === t && --i === 0)
      return {
        delimiter: e === "{" ? "required" : "optional",
        value: n.slice(o + 1, s),
        contentStart: o + 1,
        end: s + 1
      };
  }
  return null;
}
function On(n, o) {
  const e = [];
  let t = o;
  for (; e.length < 6; ) {
    t = v(n, t);
    const i = Nn(n, t);
    if (!i) break;
    e.push(i), t = i.end;
  }
  return e;
}
function wn(n) {
  const o = [];
  let e = 0, t = 0;
  for (let i = 0; i < n.length; i++)
    n[i] === "\\" ? i++ : n[i] === "{" ? e++ : n[i] === "}" ? e = Math.max(0, e - 1) : n[i] === ";" && e === 0 && (o.push(n.slice(t, i)), t = i + 1);
  return o.push(n.slice(t)), o;
}
function p(n, o, e, t, i) {
  const s = e.trim();
  !s || /[\\#{}]/.test(s) || n.colors.push({ name: s, location: a(o, t), ...i });
}
function Dn(n, o, e, t) {
  const i = e.filter((r) => r.delimiter === "required");
  if (i.length < 4) return;
  const s = i[0].value.split("/"), c = i[1].value, l = i[2].value;
  for (const r of wn(i[3].value)) {
    const u = r.indexOf(",");
    if (u < 0) continue;
    const d = r.slice(u + 1).trim().split("/"), h = s[0]?.trim(), m = d[0]?.trim();
    p(
      o,
      n,
      `${c}${r.slice(0, u).trim()}${l}`,
      i[3].contentStart,
      {
        kind: t,
        ...h ? { model: h } : {},
        ...m ? { value: m } : {}
      }
    );
  }
}
function yn(n, o, e) {
  e.length < 4 || p(o, n, e[1].value, e[1].contentStart, {
    kind: "define",
    model: e[2].value.trim(),
    value: e[3].value.trim()
  });
}
function Tn(n, o, e) {
  e.length < 2 || p(o, n, e[0].value, e[0].contentStart, {
    kind: "alias",
    alias: e[1].value.trim()
  });
}
function $n(n, o, e, t) {
  t.length < 3 || p(o, n, t[0].value, t[0].contentStart, {
    kind: e === "providecolor" ? "provide" : "define",
    model: t[1].value.trim(),
    value: t[2].value.trim()
  });
}
function Ln(n, o) {
  for (const e of n.masked.matchAll(un)) {
    const t = e[1], i = On(n.masked, e.index + e[0].length), s = i.filter((c) => c.delimiter === "required");
    t.endsWith("colorset") ? Dn(n, o, i, t === "providecolorset" ? "provide" : "define") : t === "DefineNamedColor" ? yn(n, o, s) : t === "colorlet" ? Tn(n, o, s) : $n(n, o, t, s);
  }
}
function Bn(n, o) {
  for (const e of n.masked.matchAll(dn)) {
    const t = e.index + e[0].length - 1, i = f(n.masked, t);
    if (i === null) continue;
    const s = i.split(",").map((c) => c.trim()).filter((c) => c.length > 0 && !/[\\#{}]/.test(c));
    s.length > 0 && o.colorActivations.push({
      names: s,
      kind: e[1] === "providecolors" ? "provide" : "define",
      location: a(n, e.index)
    });
  }
}
const O = new RegExp(
  `\\\\(?:${E})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`,
  "g"
), w = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
function D(n) {
  const o = /* @__PURE__ */ new Map();
  for (const e of n.matchAll(O)) {
    const t = e.index + e[0].length - 1, i = f(n, t);
    i !== null && o.set(e[1], {
      argCount: e[2] ? Number.parseInt(e[2], 10) : 0,
      body: i,
      optional: e[3]
    });
  }
  for (const e of n.matchAll(w)) {
    const t = e.index + e[0].length - 1, i = f(n, t);
    i !== null && o.set(e[1], { argCount: (e[2].match(/#/g) || []).length, body: i });
  }
  return o;
}
const Fn = new RegExp(`\\\\(?:label|${R}|${b})\\b`);
function y(n) {
  const o = /* @__PURE__ */ new Set();
  let e = !0;
  for (; e; ) {
    e = !1;
    for (const [t, i] of n)
      o.has(t) || (Fn.test(i.body) || Pn(i.body, n, o)) && (o.add(t), e = !0);
  }
  return o;
}
function Pn(n, o, e) {
  for (const t of n.matchAll(/\\(\w+)/g))
    if (e.has(t[1]) && o.has(t[1])) return !0;
  return !1;
}
const v = (n, o) => {
  for (; o < n.length && /\s/.test(n[o]); ) o++;
  return o;
};
function Un(n, o, e) {
  const t = v(n, o), i = n[t] === "[" ? n.indexOf("]", t) : -1;
  return i !== -1 ? { value: n.slice(t + 1, i), end: i + 1 } : { value: e, end: o };
}
function T(n, o, e, t) {
  const i = [];
  let s = o;
  if (t !== void 0 && e > 0) {
    const c = Un(n, s, t);
    i.push(c.value), s = c.end;
  }
  for (; i.length < e && (s = v(n, s), n[s] === "{"); ) {
    const c = f(n, s);
    if (c === null) break;
    i.push(c), s += c.length + 2;
  }
  return { args: i, end: s };
}
const zn = 4;
function $(n, o, e, t, i) {
  const s = e.get(n);
  if (!s || t > zn || i.has(n)) return "";
  let c = s.body.replace(/#(\d)/g, (l, r) => o[Number(r) - 1] ?? "");
  return c = c.replace(/\\(\w+)/g, (l, r, u) => {
    const d = e.get(r);
    if (!d) return l;
    const { args: h } = T(
      c,
      u + l.length,
      d.argCount,
      d.optional
    ), m = new Set(i);
    return m.add(n), $(r, h, e, t + 1, m);
  }), c;
}
const Wn = new RegExp(
  `(?:\\\\(?:${E}|DeclareMathOperator)\\*?\\{|\\\\def)$`
);
function L(n, o) {
  return Wn.test(n.slice(Math.max(0, o - 24), o));
}
function Gn(n) {
  const o = D(n);
  if (o.size === 0) return [];
  const e = y(o);
  if (e.size === 0) return [];
  const t = /* @__PURE__ */ new Set();
  for (const c of n.matchAll(/\\(\w+)/g)) {
    const l = c[1];
    e.has(l) && !L(n, c.index) && t.add(l);
  }
  if (t.size === 0) return [];
  const i = [], s = (c) => {
    for (const l of n.matchAll(c)) {
      if (!t.has(l[1])) continue;
      const r = l.index + l[0].length - 1, u = f(n, r);
      u !== null && i.push([r + 1, r + 1 + u.length]);
    }
  };
  return s(O), s(w), i;
}
function Vn(n, o) {
  const e = D(n.masked);
  if (e.size === 0) return;
  const t = y(e);
  if (t.size === 0) return;
  const i = /\\(\w+)/g;
  for (const s of n.masked.matchAll(i)) {
    const c = s[1];
    if (!t.has(c) || L(n.masked, s.index)) continue;
    const l = e.get(c), { args: r } = T(n.masked, s.index + s[0].length, l.argCount, l.optional), u = $(c, r, e, 0, /* @__PURE__ */ new Set());
    if (!u) continue;
    const d = a(n, s.index);
    jn(u, d, o);
  }
}
function g(n) {
  const o = n?.trim();
  return o && !o.includes("#") ? o : null;
}
function jn(n, o, e) {
  for (const t of n.matchAll(M)) {
    const i = g(f(n, t.index + t[0].length - 1));
    i && e.labels.push({ name: i, location: o });
  }
  for (const t of n.matchAll(I)) {
    const i = g(f(n, t.index + t[0].length - 1));
    i && e.labelRefs.push({ name: i, location: o });
  }
  for (const t of n.matchAll(N)) {
    const i = f(n, t.index + t[0].length - 1);
    for (const s of i?.split(",") ?? []) {
      const c = g(s);
      c && e.citations.push({ key: c, location: o });
    }
  }
}
function Qn(n, o) {
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
    classes: [],
    packages: [],
    colors: [],
    colorActivations: [],
    bibItems: []
  }, t = k(n), i = q(n, t), s = { masked: i, lineStarts: W(i), file: o }, c = { ...s, masked: x(i, Gn(i)) };
  return hn(c, e), pn(c, e), gn(c, e), En(s, e), Sn(s, e), An(s, e), bn(s, e), vn(s, e), Rn(s, e), kn(s, e), _n(s, e), xn(s, e), In(s, e), Mn(s, e), Ln(s, e), Bn(s, e), Vn(s, e), e;
}
export {
  Zn as maskSpans,
  Jn as maskSpansFromTokens,
  Qn as parseLatexFile
};
