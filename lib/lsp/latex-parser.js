import { CITE_CMDS as T, SECTION_CMDS as te, NEWCMD_CMDS as _, COMMAND_TOKEN as oe, INPUT_CMDS as se, USEPACKAGE_CMDS as ie, REF_CMDS as G } from "./latex-patterns.js";
import { tokenize as L, VERBATIM_ENVIRONMENTS as re } from "./latex-tokenizer.js";
import { buildLineStarts as ce, offsetToLineCol as le } from "./source-position.js";
const ae = /* @__PURE__ */ new Set([
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
]), fe = /* @__PURE__ */ new Set([
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
function ue(e) {
  return e.length > 2 && e.startsWith("if") && e !== "iff" && !fe.has(e);
}
function de(e, t = []) {
  const n = [], o = [], s = (i) => t.some(([r, c]) => i >= r && i < c);
  for (const i of e)
    i.type === "command" && !s(i.start) && me(i, o, n);
  return n;
}
function me(e, t, n) {
  const o = e.value;
  o === "iffalse" ? t.push({ kind: "false", falseStart: e.end, elseSeen: !1 }) : o === "iftrue" ? t.push({ kind: "true", falseStart: -1, elseSeen: !1 }) : o === "if" || ae.has(o) || ue(o) ? t.push({ kind: "other", falseStart: -1, elseSeen: !1 }) : o === "else" ? he(t[t.length - 1], e, n) : o === "fi" && pe(t.pop(), e, n);
}
function he(e, t, n) {
  !e || e.elseSeen || (e.elseSeen = !0, e.kind === "false" ? n.push([e.falseStart, t.start]) : e.kind === "true" && (e.falseStart = t.end));
}
function pe(e, t, n) {
  e && (e.kind === "false" && !e.elseSeen ? n.push([e.falseStart, t.start]) : e.kind === "true" && e.elseSeen && n.push([e.falseStart, t.start]));
}
function ge(e) {
  const t = [];
  for (let n = 0; n < e.length; n++) {
    const o = e[n];
    if (o.type !== "command" || o.value !== "begin") continue;
    const s = $(e, n);
    if (!s || !re.has(s.name)) continue;
    const i = Ee(e, s.closeIndex + 1, s.name), r = i?.start ?? e[e.length - 1].end;
    r > s.closeEnd && t.push([s.closeEnd, r]), i && (n = i.index);
  }
  return t;
}
function Ee(e, t, n) {
  for (let o = t; o < e.length; o++) {
    const s = e[o];
    if (s.type !== "command" || s.value !== "end") continue;
    const i = $(e, o);
    if (i && i.name === n) return { start: s.start, index: o };
  }
  return null;
}
function $(e, t) {
  let n = t + 1;
  for (; n < e.length && e[n].type === "text" && e[n].value.trim() === ""; ) n++;
  if (n >= e.length || e[n].type !== "open") return null;
  const o = e[n + 1];
  if (!o || o.type !== "text") return null;
  const s = e[n + 2];
  return !s || s.type !== "close" ? null : { name: o.value.trim(), closeIndex: n + 2, closeEnd: s.end };
}
function qn(e) {
  return b(L(e));
}
function Wn(e) {
  return b(e);
}
function b(e) {
  const t = [];
  for (const o of e)
    (o.type === "comment" || o.type === "verb") && t.push([o.start, o.end]);
  const n = ge(e);
  return t.push(...n), t.push(...de(e, n)), t;
}
function Se(e, t) {
  return K(e, b(t));
}
function K(e, t) {
  if (t.length === 0) return e;
  const n = t.length > 1 ? [...t].sort((i, r) => i[0] - r[0]) : t, o = [];
  let s = 0;
  for (const [i, r] of n) {
    const c = i > s ? i : s, l = r < e.length ? r : e.length;
    l <= c || (c > s && o.push(e.slice(s, c)), o.push(e.slice(c, l).replace(/[^\n]/g, " ")), s = l);
  }
  return s < e.length && o.push(e.slice(s)), o.join("");
}
function I(e) {
  const t = /* @__PURE__ */ new Map(), n = [], o = [], s = { "{": n, "[": o }, i = { "}": n, "]": o };
  for (let r = 0; r < e.length; r++) {
    const c = e.charAt(r);
    if (c === "\\") {
      r++;
      continue;
    }
    const l = s[c];
    if (l) {
      l.push(r);
      continue;
    }
    const f = i[c]?.pop();
    f !== void 0 && t.set(f, r);
  }
  return t;
}
function d(e, t, n) {
  if (e[t] !== "{") return null;
  if (n) {
    const s = n.get(t);
    return s === void 0 ? null : e.slice(t + 1, s);
  }
  let o = 0;
  for (let s = t; s < e.length; s++) {
    if (e[s] === "\\") {
      s++;
      continue;
    }
    if (e[s] === "{") o++;
    else if (e[s] === "}" && (o--, o === 0))
      return e.slice(t + 1, s);
  }
  return null;
}
const P = /\\label\{/g, B = new RegExp(`\\\\(?:${G})\\{`, "g"), U = new RegExp(`\\\\(?:${T})(?:\\[[^\\]]*\\])*\\{`, "g"), ye = new RegExp(`\\\\(${te})\\*?(?:\\[[^\\]]*\\])?\\{`, "g"), Ae = new RegExp(`\\\\(?:${_})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?`, "g"), ve = /\\def\\(\w+)/g, Ce = /\\DeclareMathOperator\*?\{\\(\w+)\}/g, ke = /\\begin\{/g, we = new RegExp(`\\\\(${se})\\{`, "g"), _e = new RegExp(`\\\\(?:${ie})(?:\\[([^\\]]*)\\])?\\{`, "g"), be = /\\(definecolorset|providecolorset|preparecolorset|DefineNamedColor|definecolor|xdefinecolor|providecolor|colorlet)\*?(?![A-Za-z@:_])/g, Me = /\\(definecolors|providecolors)(?!et)\*?\s*\{/g, Oe = /\\(newcounter|providecounter|newaliascnt|setcounter|addtocounter|stepcounter|refstepcounter|value|counterwithin|counterwithout)\*?\s*\{/g, Re = /\\(setlength|addtolength|settowidth|settoheight|settodepth)\*?\s*\{\s*(\\[A-Za-z@]+)\s*\}/g, De = /\\(newlength|newdimen|newskip)\s*(?:\{\s*(\\[A-Za-z@]+)\s*\}|(\\[A-Za-z@]+))/g, Ne = /\\pgfkeys\s*\{/g, Ie = /* @__PURE__ */ new Set(["bibitem"]), Fe = /* @__PURE__ */ new Set([
  "newenvironment",
  "renewenvironment",
  "NewDocumentEnvironment",
  "RenewDocumentEnvironment",
  "ProvideDocumentEnvironment",
  "DeclareDocumentEnvironment",
  "newtheorem"
]), Te = /* @__PURE__ */ new Set(["documentclass", "LoadClass", "LoadClassWithOptions"]), Ge = /* @__PURE__ */ new Set([
  "bibliography",
  "addbibresource",
  "addglobalbib",
  "addsectionbib"
]), Le = /* @__PURE__ */ new Set(["longnewglossaryentry", "newglossaryentry"]), $e = /* @__PURE__ */ new Set([
  "gls",
  "Gls",
  "glspl",
  "Glspl",
  "glsdisp",
  "Glsdisp",
  "glslink",
  "Glslink",
  "glsentryname",
  "Glsentryname",
  "glsentrytext",
  "Glsentrytext",
  "glsentryplural",
  "Glsentryplural",
  "glsentrydesc",
  "Glsentrydesc",
  "glsentrydescplural",
  "Glsentrydescplural",
  "glsentrysymbol",
  "Glsentrysymbol",
  "glsentrysymbolplural",
  "Glsentrysymbolplural",
  "glsadd"
]), Ke = /* @__PURE__ */ new Set(["newacronym"]), Pe = /* @__PURE__ */ new Set([
  "acrshort",
  "Acrshort",
  "ACRshort",
  "acrlong",
  "Acrlong",
  "ACRlong",
  "acrfull",
  "Acrfull",
  "ACRfull",
  "ac",
  "Ac",
  "acf",
  "Acf",
  "acl",
  "Acl",
  "acs",
  "Acs",
  "acp",
  "Acp"
]), Be = /* @__PURE__ */ new Set(["setmainfont", "setsansfont", "setmonofont", "fontspec"]), Ue = /* @__PURE__ */ new Set(["newfontfamily", "newfontface"]), xe = /* @__PURE__ */ new Set(["DeclareFontFamily"]), ze = /* @__PURE__ */ new Set([
  "definekey",
  "define@key",
  "defineboolkey",
  "definechoicekey",
  "define@choicekey"
]), Ve = /* @__PURE__ */ new Set(["DeclareKeys"]);
function x(e) {
  if (!e) return !1;
  const t = e.charCodeAt(0);
  return t >= 65 && t <= 90 || t >= 97 && t <= 122 || e === "@" || e === ":" || e === "_";
}
function F(e) {
  const t = [];
  let n = 0;
  for (; n < e.length; ) {
    const o = e.indexOf("\\", n);
    if (o < 0) break;
    let s = o + 1;
    for (; x(e[s]); ) s++;
    s > o + 1 && t.push({ name: e.slice(o + 1, s), start: o, end: s }), n = Math.max(o + 2, s);
  }
  return t;
}
function* h(e, t) {
  for (const n of e.commandOccurrences)
    t.has(n.name) && (yield n);
}
function p(e, t) {
  const n = e.masked[t.end] === "*" ? t.end + 1 : t.end;
  return R(e.masked, n, e.groupEnds);
}
function E(e) {
  return e.find((t) => t.delimiter === "required");
}
function M(e) {
  return e.contentStart + (e.value.length - e.value.trimStart().length);
}
function u(e, t) {
  const { line: n, column: o } = le(e.lineStarts, t);
  return { file: e.file, line: n, column: o };
}
function z(e, t) {
  const n = t.trimStart();
  return e + 1 + (t.length - n.length);
}
function V(e, t, n, o) {
  for (const s of e.masked.matchAll(t)) {
    const i = s.index + s[0].length - 1, r = d(e.masked, i, e.groupEnds);
    if (!r) continue;
    const c = r.trim();
    !c || c.includes("#") || o(c, u(e, z(i, r)));
  }
}
function qe(e, t) {
  V(
    e,
    P,
    !0,
    (n, o) => t.labels.push({ name: n, location: o })
  );
}
function We(e, t) {
  V(
    e,
    B,
    !0,
    (n, o) => t.labelRefs.push({ name: n, location: o })
  );
}
function Ye(e, t) {
  for (const n of e.masked.matchAll(U)) {
    const o = n.index + n[0].length - 1, s = d(e.masked, o, e.groupEnds);
    if (!s) continue;
    let i = o + 1;
    for (const r of s.split(",")) {
      const c = r.trim();
      c && !c.includes("#") && t.citations.push({
        key: c,
        location: u(e, i + r.indexOf(c))
      }), i += r.length + 1;
    }
  }
}
function je(e, t) {
  for (const n of e.masked.matchAll(ye)) {
    const o = d(e.masked, n.index + n[0].length - 1, e.groupEnds);
    o && t.sections.push({ level: n[1], title: o, location: u(e, n.index) });
  }
}
function O(e, t, n, o, s) {
  const i = { name: t, location: u(e, n + 1) };
  s && (i.argCount = Number.parseInt(s, 10)), o.commands.push(i);
}
function He(e, t) {
  for (const n of e.masked.matchAll(Ae)) {
    const o = n[1], s = e.masked.indexOf(`\\${o}`, n.index + 1);
    O(e, o, s, t, n[2]);
  }
}
function Xe(e, t) {
  for (const n of e.masked.matchAll(ve)) {
    const o = n[1];
    O(e, o, e.masked.indexOf(`\\${o}`, n.index + 1), t);
  }
}
const Ze = new RegExp(oe, "g");
function Je(e, t) {
  for (const n of e.masked.matchAll(Ze))
    t.commandUses.push({ name: n[1], location: u(e, n.index + 1) });
}
function Qe(e, t) {
  for (const n of e.masked.matchAll(Ce)) {
    const o = n[1];
    O(e, o, e.masked.indexOf(`\\${o}`, n.index + 1), t);
  }
}
function en(e, t) {
  for (const n of h(e, Ie)) {
    const o = E(p(e, n)), s = o?.value.trim();
    o && s && t.bibItems.push({
      key: s,
      location: u(e, o.contentStart + o.value.indexOf(s))
    });
  }
}
function nn(e, t) {
  for (const n of e.masked.matchAll(ke)) {
    const o = d(e.masked, n.index + n[0].length - 1, e.groupEnds);
    o && t.environments.push({ name: o, location: u(e, n.index) });
  }
}
function tn(e, t) {
  for (const n of h(e, Fe)) {
    const o = E(p(e, n))?.value.trim();
    o && t.environmentDefs.push({ name: o, location: u(e, n.start) });
  }
}
function on(e, t) {
  for (const n of e.masked.matchAll(we)) {
    const o = e.masked.indexOf("{", n.index + n[1].length + 1);
    if (o < 0) continue;
    const s = d(e.masked, o, e.groupEnds);
    s && t.includes.push({
      path: s,
      location: u(e, n.index),
      type: n[1]
    });
  }
}
function sn(e, t) {
  for (const n of e.masked.matchAll(_e)) {
    const o = e.masked.indexOf("{", n.index + n[0].length - 1);
    if (o < 0) continue;
    const s = d(e.masked, o, e.groupEnds);
    if (!s) continue;
    const i = u(e, n.index);
    for (const r of s.split(",")) {
      const c = r.trim();
      c && t.packages.push({ name: c, options: n[1] ?? "", location: i });
    }
  }
}
function rn(e, t) {
  for (const n of h(e, Te)) {
    const o = p(e, n), s = E(o)?.value.trim();
    if (s) {
      const i = n.name === "LoadClassWithOptions" ? "" : o.find((r) => r.delimiter === "optional")?.value ?? "";
      t.classes.push({ name: s, options: i, location: u(e, n.start) });
    }
  }
}
function y(e, t, n, o, s, i) {
  const r = n.trim();
  !r || /[#{}]/.test(r) || e.push({
    name: r,
    role: s,
    location: u(t, o),
    ...i ? { target: i } : {}
  });
}
function cn(e, t) {
  for (const n of h(e, Ge)) {
    const o = E(p(e, n));
    if (!o) continue;
    let s = o.contentStart;
    for (const i of n.name === "bibliography" ? o.value.split(",") : [o.value]) {
      const r = i.trim();
      r && !/[\\#{}]/.test(r) && t.bibliographies.push({
        path: r,
        location: u(e, s + i.indexOf(r))
      }), s += i.length + 1;
    }
  }
}
function ln(e, t) {
  for (const n of e.masked.matchAll(Oe)) {
    const o = n.index + n[0].length - 1, s = d(e.masked, o, e.groupEnds);
    s !== null && y(
      t.counters,
      e,
      s,
      z(o, s),
      n[1] === "newcounter" || n[1] === "providecounter" || n[1] === "newaliascnt" ? "definition" : "usage"
    );
  }
}
function an(e, t) {
  for (const n of e.masked.matchAll(De)) {
    const o = n[2] ?? n[3];
    o && y(
      t.lengths,
      e,
      o,
      n.index + n[0].indexOf(o),
      "definition"
    );
  }
  for (const n of e.masked.matchAll(Re)) {
    const o = n[2];
    o && y(t.lengths, e, o, n.index + n[0].indexOf(o), "usage");
  }
}
function v(e, t, n, o) {
  for (const s of h(e, t)) {
    const i = E(p(e, s));
    i && y(n, e, i.value, M(i), o);
  }
}
function fn(e, t) {
  v(e, Le, t.glossaryEntries, "definition"), v(e, $e, t.glossaryEntries, "usage"), v(e, Ke, t.acronymEntries, "definition"), v(e, Pe, t.acronymEntries, "usage");
}
function un(e, t) {
  if (e[t] !== "\\") return null;
  let n = t + 1;
  for (; x(e[n]); ) n++;
  return n === t + 1 ? null : { value: e.slice(t, n), start: t, end: n };
}
function dn(e, t) {
  const n = e.masked[t.end] === "*" ? t.end + 1 : t.end, o = k(e.masked, n);
  if (e.masked[o] !== "{") return un(e.masked, o);
  const s = e.groupEnds.get(o);
  if (s === void 0) return null;
  const i = e.masked.slice(o + 1, s).trim();
  return i ? { value: i, end: s + 1 } : null;
}
function mn(e, t) {
  for (const n of h(e, Ue)) {
    const o = dn(e, n);
    if (!o) continue;
    const s = E(R(e.masked, o.end, e.groupEnds));
    s && y(
      t.fontFamilies,
      e,
      s.value,
      M(s),
      "alias",
      o.value
    );
  }
}
function hn(e, t) {
  for (const n of h(e, xe)) {
    const s = p(e, n).filter(
      (i) => i.delimiter === "required"
    )[1];
    s && y(
      t.fontFamilies,
      e,
      s.value,
      M(s),
      "definition"
    );
  }
}
function pn(e, t) {
  v(e, Be, t.fontFamilies, "usage"), mn(e, t), hn(e, t);
}
function gn(e, t, n) {
  const o = e[t];
  if (o !== "{" && o !== "[") return null;
  const s = n.get(t);
  return s === void 0 ? null : {
    delimiter: o === "{" ? "required" : "optional",
    value: e.slice(t + 1, s),
    contentStart: t + 1,
    end: s + 1
  };
}
function En(e, t) {
  const n = e[t];
  if (n !== "{" && n !== "[") return null;
  const o = n === "{" ? "}" : "]";
  let s = 1;
  for (let i = t + 1; i < e.length; i++) {
    if (e[i] === "\\") {
      i++;
      continue;
    }
    if (e[i] === n) s++;
    else if (e[i] === o && --s === 0)
      return {
        delimiter: n === "{" ? "required" : "optional",
        value: e.slice(t + 1, i),
        contentStart: t + 1,
        end: i + 1
      };
  }
  return null;
}
function Sn(e, t, n) {
  return n ? gn(e, t, n) : En(e, t);
}
function R(e, t, n) {
  const o = [];
  let s = t;
  for (; o.length < 6; ) {
    s = k(e, s);
    const i = Sn(e, s, n);
    if (!i) break;
    o.push(i), s = i.end;
  }
  return o;
}
function yn(e) {
  const t = [];
  let n = 0, o = 0;
  for (let s = 0; s < e.length; s++)
    e[s] === "\\" ? s++ : e[s] === "{" ? n++ : e[s] === "}" ? n = Math.max(0, n - 1) : e[s] === ";" && n === 0 && (t.push(e.slice(o, s)), o = s + 1);
  return t.push(e.slice(o)), t;
}
function D(e, t = ",") {
  const n = [], o = [];
  let s = 0;
  for (let i = 0; i < e.length; i++) {
    const r = e[i];
    r === "\\" ? i++ : r === "{" ? o.push("}") : r === "[" ? o.push("]") : r === o[o.length - 1] ? o.pop() : o.length === 0 && r === t && (n.push(e.slice(s, i)), s = i + 1);
  }
  return n.push(e.slice(s)), n;
}
function C(e, t, n, o, s) {
  const i = n.trim();
  !i || /[\\#{}]/.test(i) || e.colors.push({ name: i, location: u(t, o), ...s });
}
function An(e, t, n, o) {
  const s = n.filter((l) => l.delimiter === "required");
  if (s.length < 4) return;
  const i = s[0].value.split("/"), r = s[1].value, c = s[2].value;
  for (const l of yn(s[3].value)) {
    const a = l.indexOf(",");
    if (a < 0) continue;
    const f = l.slice(a + 1).trim().split("/"), g = i[0]?.trim(), m = f[0]?.trim();
    C(
      t,
      e,
      `${r}${l.slice(0, a).trim()}${c}`,
      s[3].contentStart,
      {
        kind: o,
        ...g ? { model: g } : {},
        ...m ? { value: m } : {}
      }
    );
  }
}
function vn(e, t, n) {
  n.length < 4 || C(t, e, n[1].value, n[1].contentStart, {
    kind: "define",
    model: n[2].value.trim(),
    value: n[3].value.trim()
  });
}
function Cn(e, t, n) {
  n.length < 2 || C(t, e, n[0].value, n[0].contentStart, {
    kind: "alias",
    alias: n[1].value.trim()
  });
}
function kn(e, t, n, o) {
  o.length < 3 || C(t, e, o[0].value, o[0].contentStart, {
    kind: n === "providecolor" ? "provide" : "define",
    model: o[1].value.trim(),
    value: o[2].value.trim()
  });
}
function wn(e, t) {
  for (const n of e.masked.matchAll(be)) {
    const o = n[1], s = R(e.masked, n.index + n[0].length, e.groupEnds), i = s.filter((r) => r.delimiter === "required");
    o.endsWith("colorset") ? An(e, t, s, o === "providecolorset" ? "provide" : "define") : o === "DefineNamedColor" ? vn(e, t, i) : o === "colorlet" ? Cn(e, t, i) : kn(e, t, o, i);
  }
}
function _n(e, t) {
  for (const n of e.masked.matchAll(Me)) {
    const o = n.index + n[0].length - 1, s = d(e.masked, o, e.groupEnds);
    if (s === null) continue;
    const i = s.split(",").map((r) => r.trim()).filter((r) => r.length > 0 && !/[\\#{}]/.test(r));
    i.length > 0 && t.colorActivations.push({
      names: i,
      kind: n[1] === "providecolors" ? "provide" : "define",
      location: u(e, n.index)
    });
  }
}
function N(e) {
  const t = e.trim();
  let n = 0, o = t.length;
  for (; t[n] === "/"; ) n++;
  for (; o > n && t[o - 1] === "/"; ) o--;
  return t.slice(n, o);
}
function S(e) {
  return N(e) || "document";
}
function q(e, t, n, o, s, i, r) {
  const c = N(o);
  !c || /[\\#{}]/.test(c) || e.keys.push({
    family: S(n),
    name: c,
    valueType: s,
    location: u(t, i),
    ...r?.length ? { values: [...new Set(r)] } : {}
  });
}
function bn(e, t) {
  for (const n of h(e, ze)) {
    const s = p(e, n).filter((a) => a.delimiter === "required");
    if (s.length < 2) continue;
    const i = s[0].value, r = s[1].value, c = n.name.includes("choice") ? "enum" : n.name === "defineboolkey" ? "boolean" : "free-text", l = c === "enum" ? s.slice(2).map(
      (a) => D(a.value).map((f) => f.trim()).filter(Boolean)
    ).find((a) => a.length > 0) : void 0;
    q(t, e, i, r, c, s[1].contentStart, l);
  }
}
function W(e) {
  return /choice|choices/.test(e) ? "enum" : /bool/.test(e) ? "boolean" : /(?:int|fp)_set/.test(e) ? "number" : /dim_set/.test(e) ? "dimension" : /code|meta|store|tl_set|initial/.test(e) ? "free-text" : "flag";
}
function Mn(e) {
  const t = e.indexOf("="), o = e.slice(0, t < 0 ? e.length : t).trim().match(/^(.+?)\s+\.([A-Za-z0-9_:]+)\s*$/);
  return o ? { name: o[1].trim(), property: o[2] } : null;
}
function On(e, t, n, o, s) {
  const i = Mn(n);
  if (!i) return;
  e.push({ family: o, name: i.name, type: W(i.property), offset: s });
  const r = i.name.lastIndexOf("/");
  if (r <= 0) return;
  const c = i.name.slice(0, r).trim(), l = t.get(c) ?? [];
  l.push(i.name.slice(r + 1).trim()), t.set(c, l);
}
function Y(e, t, n, o) {
  for (const s of n)
    q(
      t,
      e,
      s.family,
      s.name,
      s.type,
      s.offset,
      s.type === "enum" ? o.get(`${s.family}\0${s.name}`) ?? o.get(s.name) : void 0
    );
}
function Rn(e, t) {
  for (const n of h(e, Ve)) {
    const o = p(e, n), s = E(o);
    if (!s) continue;
    const i = S(
      o.find((a) => a.delimiter === "optional")?.value ?? "document"
    ), r = [], c = /* @__PURE__ */ new Map();
    let l = 0;
    for (const a of D(s.value))
      On(r, c, a, i, s.contentStart + l), l += a.length + 1;
    Y(e, t, r, c);
  }
}
function j(e, t) {
  return `${S(e)}\0${t}`;
}
function Dn(e, t, n) {
  const o = t.lastIndexOf("/");
  if (o < 0) return !1;
  const s = t.slice(0, o), i = t.slice(o + 1), r = j(s, i);
  if (!e.enumKeys.has(r)) return !1;
  const c = e.choices.get(r) ?? [];
  return c.push(n), e.choices.set(r, c), !0;
}
function Nn(e, t, n) {
  const o = t.indexOf("="), s = t.slice(0, o < 0 ? t.length : o).trim(), i = s.lastIndexOf("/.");
  if (i < 0) return;
  const r = s.slice(0, i), c = r.startsWith("/"), l = N(r), a = s.slice(i + 2);
  if (a === "cd" || a === "is family") {
    e.family = S(l);
    return;
  }
  const f = l.lastIndexOf("/"), g = f < 0 ? "" : S(l.slice(0, f)), m = f < 0 ? e.family : S(c ? g : `${e.family}/${g}`), A = f < 0 ? l : l.slice(f + 1);
  A && (/is choice/.test(a) ? (e.enumKeys.add(j(m, A)), e.declarations.push({ family: m, name: A, type: "enum", offset: n })) : Dn(e, m, A) || e.declarations.push({ family: m, name: A, type: W(a), offset: n }));
}
function In(e, t) {
  for (const n of e.masked.matchAll(Ne)) {
    const o = n.index + n[0].length - 1, s = d(e.masked, o, e.groupEnds);
    if (s === null) continue;
    const i = {
      family: "pgfkeys",
      declarations: [],
      choices: /* @__PURE__ */ new Map(),
      enumKeys: /* @__PURE__ */ new Set()
    };
    let r = 0;
    for (const c of D(s))
      Nn(i, c.trim(), o + 1 + r), r += c.length + 1;
    Y(e, t, i.declarations, i.choices);
  }
}
function Fn(e, t) {
  bn(e, t), Rn(e, t), In(e, t);
}
const H = new RegExp(
  `\\\\(?:${_})\\*?\\{\\\\(\\w+)\\}(?:\\[(\\d+)\\])?(?:\\[([^\\]]*)\\])?\\s*\\{`,
  "g"
), X = /\\def\\(\w+)((?:#\d)*)\s*\{/g;
function Z(e) {
  const t = /* @__PURE__ */ new Map();
  for (const n of e.matchAll(H)) {
    const o = n.index + n[0].length - 1, s = d(e, o);
    s !== null && t.set(n[1], {
      argCount: n[2] ? Number.parseInt(n[2], 10) : 0,
      body: s,
      optional: n[3]
    });
  }
  for (const n of e.matchAll(X)) {
    const o = n.index + n[0].length - 1, s = d(e, o);
    s !== null && t.set(n[1], { argCount: (n[2].match(/#/g) || []).length, body: s });
  }
  return t;
}
const Tn = new RegExp(`\\\\(?:label|${G}|${T})\\b`);
function J(e) {
  const t = /* @__PURE__ */ new Set();
  let n = !0;
  for (; n; ) {
    n = !1;
    for (const [o, s] of e)
      t.has(o) || (Tn.test(s.body) || Gn(s.body, e, t)) && (t.add(o), n = !0);
  }
  return t;
}
function Gn(e, t, n) {
  for (const o of e.matchAll(/\\(\w+)/g))
    if (n.has(o[1]) && t.has(o[1])) return !0;
  return !1;
}
const k = (e, t) => {
  for (; t < e.length && /\s/.test(e[t]); ) t++;
  return t;
};
function Ln(e, t, n) {
  const o = k(e, t), s = e[o] === "[" ? e.indexOf("]", o) : -1;
  return s !== -1 ? { value: e.slice(o + 1, s), end: s + 1 } : { value: n, end: t };
}
function Q(e, t, n, o) {
  const s = [];
  let i = t;
  if (o !== void 0 && n > 0) {
    const r = Ln(e, i, o);
    s.push(r.value), i = r.end;
  }
  for (; s.length < n && (i = k(e, i), e[i] === "{"); ) {
    const r = d(e, i);
    if (r === null) break;
    s.push(r), i += r.length + 2;
  }
  return { args: s, end: i };
}
const $n = 4;
function ee(e, t, n, o, s) {
  const i = n.get(e);
  if (!i || o > $n || s.has(e)) return "";
  let r = i.body.replace(/#(\d)/g, (c, l) => t[Number(l) - 1] ?? "");
  return r = r.replace(/\\(\w+)/g, (c, l, a) => {
    const f = n.get(l);
    if (!f) return c;
    const { args: g } = Q(
      r,
      a + c.length,
      f.argCount,
      f.optional
    ), m = new Set(s);
    return m.add(e), ee(l, g, n, o + 1, m);
  }), r;
}
const Kn = new RegExp(
  `(?:\\\\(?:${_}|DeclareMathOperator)\\*?\\{|\\\\def)$`
);
function ne(e, t) {
  return Kn.test(e.slice(Math.max(0, t - 24), t));
}
function Pn(e) {
  const t = Z(e);
  if (t.size === 0) return [];
  const n = J(t);
  if (n.size === 0) return [];
  const o = /* @__PURE__ */ new Set();
  for (const r of e.matchAll(/\\(\w+)/g)) {
    const c = r[1];
    n.has(c) && !ne(e, r.index) && o.add(c);
  }
  if (o.size === 0) return [];
  const s = [], i = (r) => {
    for (const c of e.matchAll(r)) {
      if (!o.has(c[1])) continue;
      const l = c.index + c[0].length - 1, a = d(e, l);
      a !== null && s.push([l + 1, l + 1 + a.length]);
    }
  };
  return i(H), i(X), s;
}
function Bn(e, t) {
  const n = Z(e.masked);
  if (n.size === 0) return;
  const o = J(n);
  if (o.size === 0) return;
  const s = /\\(\w+)/g;
  for (const i of e.masked.matchAll(s)) {
    const r = i[1];
    if (!o.has(r) || ne(e.masked, i.index)) continue;
    const c = n.get(r), { args: l } = Q(e.masked, i.index + i[0].length, c.argCount, c.optional), a = ee(r, l, n, 0, /* @__PURE__ */ new Set());
    if (!a) continue;
    const f = u(e, i.index);
    Un(a, f, t);
  }
}
function w(e) {
  const t = e?.trim();
  return t && !t.includes("#") ? t : null;
}
function Un(e, t, n) {
  for (const o of e.matchAll(P)) {
    const s = w(d(e, o.index + o[0].length - 1));
    s && n.labels.push({ name: s, location: t });
  }
  for (const o of e.matchAll(B)) {
    const s = w(d(e, o.index + o[0].length - 1));
    s && n.labelRefs.push({ name: s, location: t });
  }
  for (const o of e.matchAll(U)) {
    const s = d(e, o.index + o[0].length - 1);
    for (const i of s?.split(",") ?? []) {
      const r = w(i);
      r && n.citations.push({ key: r, location: t });
    }
  }
}
function Yn(e, t) {
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
  }, o = L(e), s = Se(e, o), i = {
    masked: s,
    lineStarts: ce(s),
    file: t,
    groupEnds: I(s),
    commandOccurrences: F(s)
  }, r = K(s, Pn(s)), c = {
    ...i,
    masked: r,
    groupEnds: I(r),
    commandOccurrences: F(r)
  };
  return qe(c, n), We(c, n), Ye(c, n), je(i, n), He(i, n), Xe(i, n), Qe(i, n), Je(i, n), en(i, n), nn(i, n), tn(i, n), on(i, n), rn(i, n), sn(i, n), wn(i, n), _n(i, n), ln(i, n), an(i, n), fn(i, n), pn(i, n), Fn(i, n), cn(i, n), Bn(i, n), n;
}
export {
  qn as maskSpans,
  Wn as maskSpansFromTokens,
  Yn as parseLatexFile
};
