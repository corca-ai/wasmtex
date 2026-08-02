import { CITE_CMDS as O, SECTION_CMDS as X, NEWCMD_CMDS as S, COMMAND_TOKEN as Z, INPUT_CMDS as H, USEPACKAGE_CMDS as q, REF_CMDS as x } from "./latex-patterns.js";
import { tokenize as D, VERBATIM_ENVIRONMENTS as J } from "./latex-tokenizer.js";
import { buildLineStarts as Q, offsetToLineCol as ee } from "./source-position.js";
const ne = /* @__PURE__ */ new Set([
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
]), te = /* @__PURE__ */ new Set([
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
function oe(e) {
  return e.length > 2 && e.startsWith("if") && e !== "iff" && !te.has(e);
}
function se(e, o = []) {
  const n = [], t = [], s = (i) => o.some(([c, l]) => i >= c && i < l);
  for (const i of e)
    i.type === "command" && !s(i.start) && ie(i, t, n);
  return n;
}
function ie(e, o, n) {
  const t = e.value;
  t === "iffalse" ? o.push({ kind: "false", falseStart: e.end, elseSeen: !1 }) : t === "iftrue" ? o.push({ kind: "true", falseStart: -1, elseSeen: !1 }) : t === "if" || ne.has(t) || oe(t) ? o.push({ kind: "other", falseStart: -1, elseSeen: !1 }) : t === "else" ? ce(o[o.length - 1], e, n) : t === "fi" && le(o.pop(), e, n);
}
function ce(e, o, n) {
  !e || e.elseSeen || (e.elseSeen = !0, e.kind === "false" ? n.push([e.falseStart, o.start]) : e.kind === "true" && (e.falseStart = o.end));
}
function le(e, o, n) {
  e && (e.kind === "false" && !e.elseSeen ? n.push([e.falseStart, o.start]) : e.kind === "true" && e.elseSeen && n.push([e.falseStart, o.start]));
}
function re(e) {
  const o = [];
  for (let n = 0; n < e.length; n++) {
    const t = e[n];
    if (t.type !== "command" || t.value !== "begin") continue;
    const s = N(e, n);
    if (!s || !J.has(s.name)) continue;
    const i = ae(e, s.closeIndex + 1, s.name), c = i?.start ?? e[e.length - 1].end;
    c > s.closeEnd && o.push([s.closeEnd, c]), i && (n = i.index);
  }
  return o;
}
function ae(e, o, n) {
  for (let t = o; t < e.length; t++) {
    const s = e[t];
    if (s.type !== "command" || s.value !== "end") continue;
    const i = N(e, t);
    if (i && i.name === n) return { start: s.start, index: t };
  }
  return null;
}
function N(e, o) {
  let n = o + 1;
  for (; n < e.length && e[n].type === "text" && e[n].value.trim() === ""; ) n++;
  if (n >= e.length || e[n].type !== "open") return null;
  const t = e[n + 1];
  if (!t || t.type !== "text") return null;
  const s = e[n + 2];
  return !s || s.type !== "close" ? null : { name: t.value.trim(), closeIndex: n + 2, closeEnd: s.end };
}
function Nn(e) {
  return b(D(e));
}
function In(e) {
  return b(e);
}
function b(e) {
  const o = [];
  for (const t of e)
    (t.type === "comment" || t.type === "verb") && o.push([t.start, t.end]);
  const n = re(e);
  return o.push(...n), o.push(...se(e, n)), o;
}
function fe(e, o) {
  return I(e, b(o));
}
function I(e, o) {
  if (o.length === 0) return e;
  const n = o.length > 1 ? [...o].sort((i, c) => i[0] - c[0]) : o, t = [];
  let s = 0;
  for (const [i, c] of n) {
    const l = i > s ? i : s, r = c < e.length ? c : e.length;
    r <= l || (l > s && t.push(e.slice(s, l)), t.push(e.slice(l, r).replace(/[^\n]/g, " ")), s = r);
  }
  return s < e.length && t.push(e.slice(s)), t.join("");
}
function a(e, o) {
  if (e[o] !== "{") return null;
  let n = 0;
  for (let t = o; t < e.length; t++) {
    if (e[t] === "\\") {
      t++;
      continue;
    }
    if (e[t] === "{") n++;
    else if (e[t] === "}" && (n--, n === 0))
      return e.slice(o + 1, t);
  }
  return null;
}
const M = /\\label\{/g, F = new RegExp(`\\\\(?:${x})\\{`, "g"), T = new RegExp(`\\\\(?:${O})(?:\\[[^\\]]*\\])*\\{`, "g"), ue = new RegExp(`\\\\(${X})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), de = new RegExp(`\\\\(?:${S})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, "g"), me = /\\def\\(\w+)/g, he = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, ge = /\\bibitem(?:\[[^\]]*\])?\{/g, pe = /\\begin\{/g, Ee = /\\(?:newenvironment|renewenvironment|NewDocumentEnvironment|RenewDocumentEnvironment|ProvideDocumentEnvironment|DeclareDocumentEnvironment|newtheorem)\*?\{([^}]+)\}/g, Ae = new RegExp(`\\\\(${H})\\{`, "g"), ye = new RegExp(`\\\\(?:${q})(?:\\[([^\\]]*)\\])?\\{`, "g"), ke = /\\(?:(?:documentclass|LoadClass)(?:\[([^\]]*)\])?|LoadClassWithOptions)\{/g, Re = /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g, Se = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g, be = /\\(bibliography|addbibresource|addglobalbib|addsectionbib)(?:\[[^\]]*\])?\s*\{/g, _e = /\\(newcounter|providecounter|newaliascnt|setcounter|addtocounter|stepcounter|refstepcounter|value|counterwithin|counterwithout)\*?\s*\{/g, ve = /\\(setlength|addtolength|settowidth|settoheight|settodepth)\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g, Ce = /\\(newlength|newdimen|newskip)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g, we = /\\(longnewglossaryentry|newglossaryentry)\*?(?:\[[^\]]*\])?\s*\{/g, Oe = /\\(?:[Gg]ls(?:pl|disp|link|entry(?:name|text|plural|desc|descplural|symbol|symbolplural))?|glsadd|glslink)\*?(?:\[[^\]]*\])*\s*\{/g, xe = /\\newacronym\*?(?:\[[^\]]*\])?\s*\{/g, De = /\\(?:acrshort|Acrshort|ACRshort|acrlong|Acrlong|ACRlong|acrfull|Acrfull|ACRfull|ac|Ac|acf|Acf|acl|Acl|acs|Acs|acp|Acp)\*?(?:\[[^\]]*\])*\s*\{/g, Ne = /\\(setmainfont|setsansfont|setmonofont|fontspec)\*?(?:\[[^\]]*\])?\s*\{/g, Ie = /\\(newfontfamily|newfontface)\*?\s*(?:\{\s*)?(\\[A-Za-z@]+)\s*\}?(?:\[[^\]]*\])?\s*\{/g, Me = /\\DeclareFontFamily\s*\{[^}]*\}\s*\{/g, Fe = /\\(define@?key|defineboolkey|define@?choicekey)\*?(?:\[[^\]]*\])?/g, Te = /\\DeclareKeys\*?(?:\[([^\]]+)\])?\s*\{/g, Le = /\\pgfkeys\s*\{/g;
function d(e, o) {
  const { line: n, column: t } = ee(e.lineStarts, o);
  return { file: e.file, line: n, column: t };
}
function y(e, o) {
  const n = o.trimStart();
  return e + 1 + (o.length - n.length);
}
function _(e, o, n, t) {
  for (const s of e.masked.matchAll(o)) {
    const i = s.index + s[0].length - 1, c = a(e.masked, i);
    if (!c) continue;
    const l = c.trim();
    !l || n && l.includes("#") || t(l, d(e, y(i, c)));
  }
}
function $e(e, o) {
  _(
    e,
    M,
    !0,
    (n, t) => o.labels.push({ name: n, location: t })
  );
}
function Ke(e, o) {
  _(
    e,
    F,
    !0,
    (n, t) => o.labelRefs.push({ name: n, location: t })
  );
}
function Pe(e, o) {
  for (const n of e.masked.matchAll(T)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    if (!s) continue;
    let i = t + 1;
    for (const c of s.split(",")) {
      const l = c.trim();
      l && !l.includes("#") && o.citations.push({
        key: l,
        location: d(e, i + c.indexOf(l))
      }), i += c.length + 1;
    }
  }
}
function Be(e, o) {
  for (const n of e.masked.matchAll(ue)) {
    const t = a(e.masked, n.index + n[0].length - 1);
    t && o.sections.push({ level: n[1], title: t, location: d(e, n.index) });
  }
}
function v(e, o, n, t, s) {
  const i = { name: o, location: d(e, n + 1) };
  s && (i.argCount = Number.parseInt(s, 10)), t.commands.push(i);
}
function Ue(e, o) {
  for (const n of e.masked.matchAll(de)) {
    const t = n[1], s = e.masked.indexOf(`\\${t}`, n.index + 1);
    v(e, t, s, o, n[2]);
  }
}
function ze(e, o) {
  for (const n of e.masked.matchAll(me)) {
    const t = n[1];
    v(e, t, e.masked.indexOf(`\\${t}`, n.index + 1), o);
  }
}
const Ge = new RegExp(Z, "g");
function Ve(e, o) {
  for (const n of e.masked.matchAll(Ge))
    o.commandUses.push({ name: n[1], location: d(e, n.index + 1) });
}
function We(e, o) {
  for (const n of e.masked.matchAll(he)) {
    const t = n[1];
    v(e, t, e.masked.indexOf(`\\${t}`, n.index + 1), o);
  }
}
function Ye(e, o) {
  _(
    e,
    ge,
    !1,
    (n, t) => o.bibItems.push({ key: n, location: t })
  );
}
function je(e, o) {
  for (const n of e.masked.matchAll(pe)) {
    const t = a(e.masked, n.index + n[0].length - 1);
    t && o.environments.push({ name: t, location: d(e, n.index) });
  }
}
function Xe(e, o) {
  for (const n of e.masked.matchAll(Ee))
    o.environmentDefs.push({ name: n[1], location: d(e, n.index) });
}
function Ze(e, o) {
  for (const n of e.masked.matchAll(Ae)) {
    const t = e.masked.indexOf("{", n.index + n[1].length + 1);
    if (t < 0) continue;
    const s = a(e.masked, t);
    s && o.includes.push({
      path: s,
      location: d(e, n.index),
      type: n[1]
    });
  }
}
function He(e, o) {
  for (const n of e.masked.matchAll(ye)) {
    const t = e.masked.indexOf("{", n.index + n[0].length - 1);
    if (t < 0) continue;
    const s = a(e.masked, t);
    if (!s) continue;
    const i = d(e, n.index);
    for (const c of s.split(",")) {
      const l = c.trim();
      l && o.packages.push({ name: l, options: n[1] ?? "", location: i });
    }
  }
}
function qe(e, o) {
  for (const n of e.masked.matchAll(ke)) {
    const t = e.masked.indexOf("{", n.index + n[0].length - 1);
    if (t < 0) continue;
    const s = a(e.masked, t)?.trim();
    s && o.classes.push({ name: s, options: n[1] ?? "", location: d(e, n.index) });
  }
}
function p(e, o, n, t, s, i) {
  const c = n.trim();
  !c || /[#{}]/.test(c) || e.push({
    name: c,
    role: s,
    location: d(o, t),
    ...i ? { target: i } : {}
  });
}
function Je(e, o) {
  for (const n of e.masked.matchAll(be)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    if (s === null) continue;
    let i = t + 1;
    for (const c of n[1] === "bibliography" ? s.split(",") : [s]) {
      const l = c.trim();
      l && !/[\\#{}]/.test(l) && o.bibliographies.push({
        path: l,
        location: d(e, i + c.indexOf(l))
      }), i += c.length + 1;
    }
  }
}
function Qe(e, o) {
  for (const n of e.masked.matchAll(_e)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    s !== null && p(
      o.counters,
      e,
      s,
      y(t, s),
      n[1] === "newcounter" || n[1] === "providecounter" || n[1] === "newaliascnt" ? "definition" : "usage"
    );
  }
}
function en(e, o) {
  for (const n of e.masked.matchAll(Ce)) {
    const t = n[2] ?? n[3];
    t && p(
      o.lengths,
      e,
      t,
      n.index + n[0].indexOf(t),
      "definition"
    );
  }
  for (const n of e.masked.matchAll(ve)) {
    const t = n[2];
    t && p(o.lengths, e, t, n.index + n[0].indexOf(t), "usage");
  }
}
function A(e, o, n, t) {
  for (const s of e.masked.matchAll(o)) {
    const i = s.index + s[0].length - 1, c = a(e.masked, i);
    c !== null && p(n, e, c, y(i, c), t);
  }
}
function nn(e, o) {
  A(e, we, o.glossaryEntries, "definition"), A(e, Oe, o.glossaryEntries, "usage"), A(e, xe, o.acronymEntries, "definition"), A(e, De, o.acronymEntries, "usage");
}
function tn(e, o) {
  A(e, Ne, o.fontFamilies, "usage");
  for (const n of e.masked.matchAll(Ie)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    s !== null && p(
      o.fontFamilies,
      e,
      s,
      y(t, s),
      "alias",
      n[2]
    );
  }
  for (const n of e.masked.matchAll(Me)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    s !== null && p(
      o.fontFamilies,
      e,
      s,
      y(t, s),
      "definition"
    );
  }
}
function on(e, o) {
  const n = e[o], t = n === "{" ? "}" : n === "[" ? "]" : null;
  if (!t) return null;
  let s = 1;
  for (let i = o + 1; i < e.length; i++) {
    if (e[i] === "\\") {
      i++;
      continue;
    }
    if (e[i] === n) s++;
    else if (e[i] === t && --s === 0)
      return {
        delimiter: n === "{" ? "required" : "optional",
        value: e.slice(o + 1, i),
        contentStart: o + 1,
        end: i + 1
      };
  }
  return null;
}
function L(e, o) {
  const n = [];
  let t = o;
  for (; n.length < 6; ) {
    t = w(e, t);
    const s = on(e, t);
    if (!s) break;
    n.push(s), t = s.end;
  }
  return n;
}
function sn(e) {
  const o = [];
  let n = 0, t = 0;
  for (let s = 0; s < e.length; s++)
    e[s] === "\\" ? s++ : e[s] === "{" ? n++ : e[s] === "}" ? n = Math.max(0, n - 1) : e[s] === ";" && n === 0 && (o.push(e.slice(t, s)), t = s + 1);
  return o.push(e.slice(t)), o;
}
function C(e, o = ",") {
  const n = [], t = [];
  let s = 0;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    c === "\\" ? i++ : c === "{" ? t.push("}") : c === "[" ? t.push("]") : c === t[t.length - 1] ? t.pop() : t.length === 0 && c === o && (n.push(e.slice(s, i)), s = i + 1);
  }
  return n.push(e.slice(s)), n;
}
function k(e, o, n, t, s) {
  const i = n.trim();
  !i || /[\\#{}]/.test(i) || e.colors.push({ name: i, location: d(o, t), ...s });
}
function cn(e, o, n, t) {
  const s = n.filter((r) => r.delimiter === "required");
  if (s.length < 4) return;
  const i = s[0].value.split("/"), c = s[1].value, l = s[2].value;
  for (const r of sn(s[3].value)) {
    const f = r.indexOf(",");
    if (f < 0) continue;
    const u = r.slice(f + 1).trim().split("/"), h = i[0]?.trim(), m = u[0]?.trim();
    k(
      o,
      e,
      `${c}${r.slice(0, f).trim()}${l}`,
      s[3].contentStart,
      {
        kind: t,
        ...h ? { model: h } : {},
        ...m ? { value: m } : {}
      }
    );
  }
}
function ln(e, o, n) {
  n.length < 4 || k(o, e, n[1].value, n[1].contentStart, {
    kind: "define",
    model: n[2].value.trim(),
    value: n[3].value.trim()
  });
}
function rn(e, o, n) {
  n.length < 2 || k(o, e, n[0].value, n[0].contentStart, {
    kind: "alias",
    alias: n[1].value.trim()
  });
}
function an(e, o, n, t) {
  t.length < 3 || k(o, e, t[0].value, t[0].contentStart, {
    kind: n === "providecolor" ? "provide" : "define",
    model: t[1].value.trim(),
    value: t[2].value.trim()
  });
}
function fn(e, o) {
  for (const n of e.masked.matchAll(Re)) {
    const t = n[1], s = L(e.masked, n.index + n[0].length), i = s.filter((c) => c.delimiter === "required");
    t.endsWith("colorset") ? cn(e, o, s, t === "providecolorset" ? "provide" : "define") : t === "DefineNamedColor" ? ln(e, o, i) : t === "colorlet" ? rn(e, o, i) : an(e, o, t, i);
  }
}
function un(e, o) {
  for (const n of e.masked.matchAll(Se)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    if (s === null) continue;
    const i = s.split(",").map((c) => c.trim()).filter((c) => c.length > 0 && !/[\\#{}]/.test(c));
    i.length > 0 && o.colorActivations.push({
      names: i,
      kind: n[1] === "providecolors" ? "provide" : "define",
      location: d(e, n.index)
    });
  }
}
function g(e) {
  return e.trim().replace(/^\/+|\/+$/g, "") || "document";
}
function $(e, o, n, t, s, i, c) {
  const l = t.trim().replace(/^\/+|\/+$/g, "");
  !l || /[\\#{}]/.test(l) || e.keys.push({
    family: g(n),
    name: l,
    valueType: s,
    location: d(o, i),
    ...c?.length ? { values: [...new Set(c)] } : {}
  });
}
function dn(e, o) {
  for (const n of e.masked.matchAll(Fe)) {
    const t = n[1], i = L(e.masked, n.index + n[0].length).filter((u) => u.delimiter === "required");
    if (i.length < 2) continue;
    const c = i[0].value, l = i[1].value, r = t.includes("choice") ? "enum" : t === "defineboolkey" ? "boolean" : "free-text", f = r === "enum" ? i.slice(2).map(
      (u) => C(u.value).map((h) => h.trim()).filter(Boolean)
    ).find((u) => u.length > 0) : void 0;
    $(o, e, c, l, r, i[1].contentStart, f);
  }
}
function K(e) {
  return /choice|choices/.test(e) ? "enum" : /bool/.test(e) ? "boolean" : /(?:int|fp)_set/.test(e) ? "number" : /dim_set/.test(e) ? "dimension" : /code|meta|store|tl_set|initial/.test(e) ? "free-text" : "flag";
}
function mn(e) {
  const o = e.indexOf("="), t = e.slice(0, o < 0 ? e.length : o).trim().match(/^(.+?)\s+\.([A-Za-z0-9_:]+)\s*$/);
  return t ? { name: t[1].trim(), property: t[2] } : null;
}
function hn(e, o, n, t, s) {
  const i = mn(n);
  if (!i) return;
  e.push({ family: t, name: i.name, type: K(i.property), offset: s });
  const c = i.name.lastIndexOf("/");
  if (c <= 0) return;
  const l = i.name.slice(0, c).trim(), r = o.get(l) ?? [];
  r.push(i.name.slice(c + 1).trim()), o.set(l, r);
}
function P(e, o, n, t) {
  for (const s of n)
    $(
      o,
      e,
      s.family,
      s.name,
      s.type,
      s.offset,
      s.type === "enum" ? t.get(`${s.family}\0${s.name}`) ?? t.get(s.name) : void 0
    );
}
function gn(e, o) {
  for (const n of e.masked.matchAll(Te)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    if (s === null) continue;
    const i = g(n[1] ?? "document"), c = [], l = /* @__PURE__ */ new Map();
    let r = 0;
    for (const f of C(s))
      hn(c, l, f, i, t + 1 + r), r += f.length + 1;
    P(e, o, c, l);
  }
}
function B(e, o) {
  return `${g(e)}\0${o}`;
}
function pn(e, o, n) {
  const t = o.lastIndexOf("/");
  if (t < 0) return !1;
  const s = o.slice(0, t), i = o.slice(t + 1), c = B(s, i);
  if (!e.enumKeys.has(c)) return !1;
  const l = e.choices.get(c) ?? [];
  return l.push(n), e.choices.set(c, l), !0;
}
function En(e, o, n) {
  const t = o.indexOf("="), s = o.slice(0, t < 0 ? o.length : t).trim(), i = s.lastIndexOf("/.");
  if (i < 0) return;
  const c = s.slice(0, i), l = c.startsWith("/"), r = c.replace(/^\/+/, ""), f = s.slice(i + 2);
  if (f === "cd" || f === "is family") {
    e.family = g(r);
    return;
  }
  const u = r.lastIndexOf("/"), h = u < 0 ? "" : g(r.slice(0, u)), m = u < 0 ? e.family : g(l ? h : `${e.family}/${h}`), E = u < 0 ? r : r.slice(u + 1);
  E && (/is choice/.test(f) ? (e.enumKeys.add(B(m, E)), e.declarations.push({ family: m, name: E, type: "enum", offset: n })) : pn(e, m, E) || e.declarations.push({ family: m, name: E, type: K(f), offset: n }));
}
function An(e, o) {
  for (const n of e.masked.matchAll(Le)) {
    const t = n.index + n[0].length - 1, s = a(e.masked, t);
    if (s === null) continue;
    const i = {
      family: "pgfkeys",
      declarations: [],
      choices: /* @__PURE__ */ new Map(),
      enumKeys: /* @__PURE__ */ new Set()
    };
    let c = 0;
    for (const l of C(s))
      En(i, l.trim(), t + 1 + c), c += l.length + 1;
    P(e, o, i.declarations, i.choices);
  }
}
function yn(e, o) {
  dn(e, o), gn(e, o), An(e, o);
}
const U = new RegExp(
  `\\\\(?:${S})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`,
  "g"
), z = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
function G(e) {
  const o = /* @__PURE__ */ new Map();
  for (const n of e.matchAll(U)) {
    const t = n.index + n[0].length - 1, s = a(e, t);
    s !== null && o.set(n[1], {
      argCount: n[2] ? Number.parseInt(n[2], 10) : 0,
      body: s,
      optional: n[3]
    });
  }
  for (const n of e.matchAll(z)) {
    const t = n.index + n[0].length - 1, s = a(e, t);
    s !== null && o.set(n[1], { argCount: (n[2].match(/#/g) || []).length, body: s });
  }
  return o;
}
const kn = new RegExp(`\\\\(?:label|${x}|${O})\\b`);
function V(e) {
  const o = /* @__PURE__ */ new Set();
  let n = !0;
  for (; n; ) {
    n = !1;
    for (const [t, s] of e)
      o.has(t) || (kn.test(s.body) || Rn(s.body, e, o)) && (o.add(t), n = !0);
  }
  return o;
}
function Rn(e, o, n) {
  for (const t of e.matchAll(/\\(\w+)/g))
    if (n.has(t[1]) && o.has(t[1])) return !0;
  return !1;
}
const w = (e, o) => {
  for (; o < e.length && /\s/.test(e[o]); ) o++;
  return o;
};
function Sn(e, o, n) {
  const t = w(e, o), s = e[t] === "[" ? e.indexOf("]", t) : -1;
  return s !== -1 ? { value: e.slice(t + 1, s), end: s + 1 } : { value: n, end: o };
}
function W(e, o, n, t) {
  const s = [];
  let i = o;
  if (t !== void 0 && n > 0) {
    const c = Sn(e, i, t);
    s.push(c.value), i = c.end;
  }
  for (; s.length < n && (i = w(e, i), e[i] === "{"); ) {
    const c = a(e, i);
    if (c === null) break;
    s.push(c), i += c.length + 2;
  }
  return { args: s, end: i };
}
const bn = 4;
function Y(e, o, n, t, s) {
  const i = n.get(e);
  if (!i || t > bn || s.has(e)) return "";
  let c = i.body.replace(/#(\d)/g, (l, r) => o[Number(r) - 1] ?? "");
  return c = c.replace(/\\(\w+)/g, (l, r, f) => {
    const u = n.get(r);
    if (!u) return l;
    const { args: h } = W(
      c,
      f + l.length,
      u.argCount,
      u.optional
    ), m = new Set(s);
    return m.add(e), Y(r, h, n, t + 1, m);
  }), c;
}
const _n = new RegExp(
  `(?:\\\\(?:${S}|DeclareMathOperator)\\*?\\{|\\\\def)$`
);
function j(e, o) {
  return _n.test(e.slice(Math.max(0, o - 24), o));
}
function vn(e) {
  const o = G(e);
  if (o.size === 0) return [];
  const n = V(o);
  if (n.size === 0) return [];
  const t = /* @__PURE__ */ new Set();
  for (const c of e.matchAll(/\\(\w+)/g)) {
    const l = c[1];
    n.has(l) && !j(e, c.index) && t.add(l);
  }
  if (t.size === 0) return [];
  const s = [], i = (c) => {
    for (const l of e.matchAll(c)) {
      if (!t.has(l[1])) continue;
      const r = l.index + l[0].length - 1, f = a(e, r);
      f !== null && s.push([r + 1, r + 1 + f.length]);
    }
  };
  return i(U), i(z), s;
}
function Cn(e, o) {
  const n = G(e.masked);
  if (n.size === 0) return;
  const t = V(n);
  if (t.size === 0) return;
  const s = /\\(\w+)/g;
  for (const i of e.masked.matchAll(s)) {
    const c = i[1];
    if (!t.has(c) || j(e.masked, i.index)) continue;
    const l = n.get(c), { args: r } = W(e.masked, i.index + i[0].length, l.argCount, l.optional), f = Y(c, r, n, 0, /* @__PURE__ */ new Set());
    if (!f) continue;
    const u = d(e, i.index);
    wn(f, u, o);
  }
}
function R(e) {
  const o = e?.trim();
  return o && !o.includes("#") ? o : null;
}
function wn(e, o, n) {
  for (const t of e.matchAll(M)) {
    const s = R(a(e, t.index + t[0].length - 1));
    s && n.labels.push({ name: s, location: o });
  }
  for (const t of e.matchAll(F)) {
    const s = R(a(e, t.index + t[0].length - 1));
    s && n.labelRefs.push({ name: s, location: o });
  }
  for (const t of e.matchAll(T)) {
    const s = a(e, t.index + t[0].length - 1);
    for (const i of s?.split(",") ?? []) {
      const c = R(i);
      c && n.citations.push({ key: c, location: o });
    }
  }
}
function Mn(e, o) {
  const n = {
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
    counters: [],
    lengths: [],
    glossaryEntries: [],
    acronymEntries: [],
    fontFamilies: [],
    keys: [],
    bibliographies: [],
    bibItems: []
  }, t = D(e), s = fe(e, t), i = { masked: s, lineStarts: Q(s), file: o }, c = { ...i, masked: I(s, vn(s)) };
  return $e(c, n), Ke(c, n), Pe(c, n), Be(i, n), Ue(i, n), ze(i, n), We(i, n), Ve(i, n), Ye(i, n), je(i, n), Xe(i, n), Ze(i, n), qe(i, n), He(i, n), fn(i, n), un(i, n), Qe(i, n), en(i, n), nn(i, n), tn(i, n), yn(i, n), Je(i, n), Cn(i, n), n;
}
export {
  Nn as maskSpans,
  In as maskSpansFromTokens,
  Mn as parseLatexFile
};
