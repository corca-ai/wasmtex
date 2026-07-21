import { maskSpans as L } from "./latex-parser.js";
import { REF_CMDS as g, CITE_CMDS as b, INPUT_CMDS as k } from "./latex-patterns.js";
import { tokenize as x } from "./latex-tokenizer.js";
import { getCommandSignature as C, getCommandPackage as S } from "./package-db.js";
import { buildLineStarts as f, offsetToLineCol as d } from "./source-position.js";
function p(t) {
  const o = L(t);
  if (o.length === 0) return () => !1;
  const s = new Uint8Array(t.length);
  for (const [i, n] of o)
    for (let e = i; e < n && e < s.length; e++) s[e] = 1;
  return (i) => s[i] === 1;
}
const v = /\\([a-zA-Z@]+)\s*[[{]/g;
function V(t, o, s) {
  const i = f(t)[o - 1];
  if (i === void 0) return null;
  const n = t.slice(0, i + (s - 1));
  let e = null;
  for (const a of n.matchAll(v))
    e = { name: a[1], argStart: a.index + a[0].length - 1 };
  if (!e) return null;
  const l = C(e.name);
  if (!l || l.length === 0) return null;
  const { opened: r, depth: c } = E(n, e.argStart);
  if (c === 0) return null;
  const u = l.map(
    (a) => a.kind === "required" ? `{${a.placeholder || "arg"}}` : `[${a.placeholder || "opt"}]`
  );
  return {
    label: `\\${e.name}${u.join("")}`,
    parameters: u,
    activeParameter: Math.min(r - 1, l.length - 1)
  };
}
function E(t, o) {
  let s = 0, i = 0;
  for (let n = o; n < t.length; n++) {
    const e = t[n];
    e === "{" || e === "[" ? (s === 0 && i++, s++) : (e === "}" || e === "]") && (s = Math.max(0, s - 1));
  }
  return { opened: i, depth: s };
}
function Z(t) {
  const o = t.split(`
`), s = f(t), i = p(t), n = [], e = [], l = [];
  for (let r = 0; r < o.length; r++)
    _(o[r], r, s[r], i, e, n), $(o[r], r, l, n);
  return n.push(...y(o, s, i)), n;
}
const A = /\\begin\{/g, R = /\\end\{/g;
function _(t, o, s, i, n, e) {
  const l = [];
  for (const r of t.matchAll(A)) l.push({ index: r.index, open: !0 });
  for (const r of t.matchAll(R)) l.push({ index: r.index, open: !1 });
  l.sort((r, c) => r.index - c.index);
  for (const r of l)
    if (!i(s + r.index))
      if (r.open)
        n.push(o + 1);
      else {
        const c = n.pop();
        c !== void 0 && o + 1 > c && e.push({ startLine: c, endLine: o + 1 });
      }
}
function $(t, o, s, i) {
  if (/^\s*%\s*region\b/i.test(t)) s.push(o + 1);
  else if (/^\s*%\s*endregion\b/i.test(t)) {
    const n = s.pop();
    n !== void 0 && i.push({ startLine: n, endLine: o + 1, kind: "region" });
  }
}
const M = ["part", "chapter", "section", "subsection", "subsubsection"];
function w(t) {
  const o = t.match(/\\(part|chapter|section|subsection|subsubsection)\b/);
  return o ? { level: M.indexOf(o[1]), index: o.index } : { level: -1, index: -1 };
}
function y(t, o, s) {
  const i = [], n = [], e = (l, r) => {
    for (; n.length && n[n.length - 1].level >= l; ) {
      const c = n.pop();
      r > c.line && i.push({ startLine: c.line, endLine: r });
    }
  };
  for (let l = 0; l < t.length; l++) {
    const { level: r, index: c } = w(t[l]);
    r < 0 || s(o[l] + c) || (e(r, l), n.push({ level: r, line: l + 1 }));
  }
  return e(0, t.length), i;
}
function j(t, o, s, i) {
  const n = i.findSymbolAt(t, o, s);
  return n ? i.findAllOccurrences(n.name, n.type).filter((e) => e.filePath === t).map((e) => ({
    startLine: e.line,
    startColumn: e.column,
    endLine: e.line,
    endColumn: e.column + e.length
  })) : [];
}
function B(t, o) {
  const s = t.toLowerCase(), i = (e) => !s || e.toLowerCase().includes(s), n = [];
  for (const e of o.getAllLabels())
    i(e.name) && n.push({ name: e.name, kind: "label", ...m(e.location) });
  for (const e of o.getFiles())
    for (const l of o.getFileSymbols(e)?.sections ?? [])
      i(l.title) && n.push({ name: l.title, kind: "section", ...m(l.location) });
  for (const e of o.getCommandDefs())
    i(e.name) && n.push({ name: e.name, kind: "command", ...m(e.location) });
  return n;
}
function m(t) {
  return { file: t.file, line: t.line, column: t.column };
}
const F = new RegExp(`\\\\(?:${g})\\{([^}]+)\\}`, "g");
function W(t, o) {
  const s = o.getAuxLabels();
  if (s.size === 0) return [];
  const i = f(t), n = p(t), e = [];
  for (const l of t.matchAll(F)) {
    if (n(l.index)) continue;
    const r = s.get(l[1].trim());
    if (!r) continue;
    const { line: c, column: u } = d(i, l.index + l[0].length);
    e.push({ line: c, column: u, label: ` (${r})` });
  }
  return e;
}
const D = new RegExp(`\\\\(?:${k})\\{([^}]+)\\}`, "g"), I = /\\(?:url|href)\{([^}]+)\}/g;
function J(t) {
  const o = f(t), s = p(t), i = [];
  return h(t, D, "file", o, s, i), h(t, I, "url", o, s, i), i;
}
function h(t, o, s, i, n, e) {
  for (const l of t.matchAll(o)) {
    if (n(l.index)) continue;
    const r = l[1].trim();
    if (!r) continue;
    const c = l.index + l[0].indexOf("{") + 1, u = d(i, c), a = d(i, c + l[1].length);
    e.push({
      range: {
        startLine: u.line,
        startColumn: u.column,
        endLine: a.line,
        endColumn: a.column
      },
      target: r,
      kind: s
    });
  }
}
function Q(t) {
  const o = x(t), s = [];
  let i = !1;
  for (const n of o) {
    if (n.type === "math") {
      i = !i;
      continue;
    }
    if (n.type === "command" && (n.value === "(" || n.value === "[")) {
      i = !0;
      continue;
    }
    if (n.type === "command" && (n.value === ")" || n.value === "]")) {
      i = !1;
      continue;
    }
    const e = N(n.type, i);
    e && s.push({ line: n.line, startColumn: n.column, length: n.end - n.start, type: e });
  }
  return s;
}
function N(t, o) {
  return t === "comment" ? "comment" : t === "verb" ? "verbatim" : t === "command" ? o ? "math" : "command" : null;
}
function X(t, o, s, i) {
  const n = [], e = t.split(`
`)[s - 1] ?? "";
  return O(e, o, s, n), T(e, t, o, i, n), q(e, o, s, i, n), n;
}
function O(t, o, s, i) {
  const n = t.match(new RegExp(`(?<=\\S)( )\\\\(?:${g}|${b})\\b`));
  if (!n || n.index === void 0) return;
  const e = n.index + 1;
  i.push({
    title: "Use a non-breaking space '~'",
    kind: "quickfix",
    edits: [
      {
        file: o,
        edit: {
          range: { startLine: s, startColumn: e, endLine: s, endColumn: e + 1 },
          newText: "~"
        }
      }
    ]
  });
}
function T(t, o, s, i, n) {
  const e = i.getLoadedPackages();
  for (const l of t.matchAll(/\\([a-zA-Z@]+)/g)) {
    const r = S(l[1]);
    if (r && !e.has(r)) {
      n.push(U(o, s, r));
      return;
    }
  }
}
function U(t, o, s) {
  const i = t.split(`
`);
  let n = 1;
  for (let e = 0; e < i.length; e++)
    if (/\\documentclass/.test(i[e])) {
      n = e + 2;
      break;
    }
  return {
    title: `Add \\usepackage{${s}}`,
    kind: "quickfix",
    edits: [
      {
        file: o,
        edit: {
          range: { startLine: n, startColumn: 1, endLine: n, endColumn: 1 },
          newText: `\\usepackage{${s}}
`
        }
      }
    ]
  };
}
function q(t, o, s, i, n) {
  const e = t.match(new RegExp(`\\\\(?:${g})\\{([^}]+)\\}`));
  if (!e) return;
  const l = e[1].trim();
  i.findLabelDef(l) || i.resolveLabel(l) || n.push({
    title: `Create \\label{${l}}`,
    kind: "quickfix",
    edits: [
      {
        file: o,
        edit: {
          range: { startLine: s, startColumn: 1, endLine: s, endColumn: 1 },
          newText: `\\label{${l}}
`
        }
      }
    ]
  });
}
export {
  X as getCodeActions,
  j as getDocumentHighlights,
  J as getDocumentLinks,
  Z as getFoldingRanges,
  W as getInlayHints,
  Q as getSemanticTokens,
  V as getSignatureHelp,
  B as getWorkspaceSymbols
};
