import { maskSpansFromTokens as M } from "./latex-parser.js";
import { tokenize as $ } from "./latex-tokenizer.js";
import { buildLineStarts as S, offsetToLineCol as T } from "./source-position.js";
const p = {
  "nbsp-before-ref": { enabled: !0, severity: "info" },
  "space-before-punctuation": { enabled: !0, severity: "warning" },
  "doubled-space": { enabled: !0, severity: "info" },
  ellipsis: { enabled: !0, severity: "info" },
  "straight-double-quotes": { enabled: !0, severity: "info" },
  "display-math-dollars": { enabled: !0, severity: "warning" },
  "en-dash-range": { enabled: !0, severity: "info" },
  "math-operator-as-text": { enabled: !0, severity: "warning" },
  "footnote-spacing": { enabled: !0, severity: "info" },
  "abbreviation-spacing": { enabled: !1, severity: "info" }
}, x = /* @__PURE__ */ new Set([
  "math",
  "displaymath",
  "equation",
  "equation*",
  "align",
  "align*",
  "gather",
  "gather*",
  "multline",
  "multline*",
  "eqnarray",
  "eqnarray*",
  "flalign",
  "flalign*",
  "alignat",
  "alignat*"
]);
function R(e, a) {
  let t = a + 1;
  for (; t < e.length && e[t].type === "text" && e[t].value.trim() === ""; ) t++;
  if (e[t]?.type !== "open") return null;
  const n = e[t + 1];
  return n?.type !== "text" || e[t + 2]?.type !== "close" ? null : n.value.trim();
}
function E(e, a) {
  const t = [], n = {
    dollar: -1,
    ddollar: -1,
    paren: -1,
    bracket: -1
  }, r = [], o = (s, i, u) => {
    n[s] < 0 ? n[s] = i : (t.push([n[s], u]), n[s] = -1);
  };
  for (let s = 0; s < e.length; s++) {
    const i = e[s];
    a(i.start) || (i.type === "math" ? o(i.value === "$$" ? "ddollar" : "dollar", i.end, i.start) : i.type === "command" && q(i, e, s, n, r, t));
  }
  return t;
}
function q(e, a, t, n, r, o) {
  if (e.value === "(") n.paren = e.end;
  else if (e.value === ")" && n.paren >= 0)
    o.push([n.paren, e.start]), n.paren = -1;
  else if (e.value === "[") n.bracket = e.end;
  else if (e.value === "]" && n.bracket >= 0)
    o.push([n.bracket, e.start]), n.bracket = -1;
  else if (e.value === "begin" && b(a, t)) r.push(e.end);
  else if (e.value === "end" && b(a, t)) {
    const s = r.pop();
    s !== void 0 && o.push([s, e.start]);
  }
}
function b(e, a) {
  const t = R(e, a);
  return t !== null && x.has(t);
}
function v(e, a) {
  const t = new Uint8Array(e);
  for (const [n, r] of a)
    for (let o = n; o < r && o < e; o++) t[o] = 1;
  return t;
}
const A = String.raw`\\(?:ref|eqref|pageref|cref|Cref|autoref|vref|cite|citep|citet|parencite|textcite|autocite)\b`, U = "sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|max|min|sup|inf|det|gcd|arg|dim|deg|ker|hom", g = () => 1, f = (e) => e[1].length, k = [
  {
    id: "nbsp-before-ref",
    re: new RegExp(String.raw`(?<=\S)( )${A}`, "g"),
    length: g,
    message: () => "Use a non-breaking space (~) before \\ref/\\cite to avoid a line break."
  },
  {
    id: "space-before-punctuation",
    re: /(?<=\w)( +)([,;:!?])/g,
    length: f,
    message: (e) => `Remove the space before '${e[2]}'.`
  },
  {
    id: "doubled-space",
    re: /(?<=\S)( {2,})/g,
    length: f,
    message: () => "Multiple consecutive spaces collapse to one; remove the extras."
  },
  {
    id: "ellipsis",
    re: /\.\.\./g,
    length: () => 3,
    message: () => "Use \\dots (or \\ldots) instead of '...'."
  },
  {
    id: "straight-double-quotes",
    // Escaped iff preceded by an ODD run of backslashes; an even run (`\\"`) is a real quote.
    re: /(?<!(?<!\\)(?:\\\\)*\\)"/g,
    length: g,
    message: () => "Use LaTeX quotes (`` and '') instead of a straight double quote."
  },
  {
    id: "en-dash-range",
    // A range is exactly two numbers; a date/ISBN/phone has 3+ hyphen-joined segments, so
    // require no adjacent digit-or-hyphen on either flank (rules those multi-segment ids out).
    re: /(?<=(?<![\d-])\d{1,4})-(?=\d{1,4}(?![\d-]))/g,
    length: g,
    message: () => "Use an en-dash (--) for number ranges."
  },
  {
    id: "footnote-spacing",
    re: /(?<=\w)( +)(\\footnote\b)/g,
    length: f,
    message: () => "Remove the space before \\footnote so it attaches to the word."
  },
  {
    id: "abbreviation-spacing",
    re: /(e\.g\.|i\.e\.)(?= )/g,
    length: f,
    message: (e) => `Follow '${e[1]}' with '\\ ' or '~' to avoid an inter-sentence space.`
  },
  {
    id: "math-operator-as-text",
    re: new RegExp(String.raw`(?<![\\a-zA-Z])(${U})(?![a-zA-Z])`, "g"),
    length: f,
    message: (e) => `Use \\${e[1]} instead of '${e[1]}' in math mode.`,
    inMath: "only"
  }
];
function F(e, a) {
  const t = a.inMath ?? "exclude", n = [];
  for (const r of e.content.matchAll(a.re)) {
    const o = r.index ?? 0;
    if (e.isMasked(o)) continue;
    const s = e.inMath(o);
    t === "exclude" && s || t === "only" && !s || n.push({ offset: o, length: a.length(r), message: a.message(r) });
  }
  return n;
}
function L(e) {
  const a = [];
  let t = !0;
  for (const n of e.tokens)
    n.type !== "math" || n.value !== "$$" || e.isMasked(n.start) || (t && a.push({
      offset: n.start,
      length: 2,
      message: "Use \\[ … \\] instead of $$ … $$ for display math."
    }), t = !t);
  return a;
}
function C(e, a) {
  if (a === "display-math-dollars") return L(e);
  const t = k.find((n) => n.id === a);
  return t ? F(e, t) : [];
}
function I(e, a, t) {
  const n = { ...p };
  if (t)
    for (const l of Object.keys(t)) {
      const c = t[l];
      c && (n[l] = { ...p[l], ...c });
    }
  const r = $(e), o = v(e.length, M(r)), s = (l) => o[l] === 1, i = v(e.length, E(r, s)), u = {
    content: e,
    tokens: r,
    isMasked: s,
    inMath: (l) => i[l] === 1
  }, y = S(e), h = [];
  for (const l of Object.keys(n)) {
    const c = n[l];
    if (c?.enabled)
      for (const d of C(u, l)) {
        const { line: w, column: m } = T(y, d.offset);
        h.push({
          file: a,
          line: w,
          column: m,
          endColumn: m + d.length,
          message: d.message,
          severity: c.severity,
          code: l
        });
      }
  }
  return h;
}
export {
  p as DEFAULT_LINT_CONFIG,
  I as lintSource
};
