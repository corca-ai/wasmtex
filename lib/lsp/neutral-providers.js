import { formatReference as _ } from "./bib-parser.js";
import { analyzeCompletionContext as S } from "./completion-context.js";
import { CompletionResolverRegistry as D } from "./completion-registry.js";
import { LATEX_COMMANDS as w, LATEX_ENVIRONMENTS as A, getEnvironmentByName as M, getCommandByName as P } from "./latex-commands.js";
import { REF_CMDS as R, CITE_CMDS as b, COMMAND_TOKEN as v } from "./latex-patterns.js";
import { getShardEnvironments as k, parseSignature as O, formatSignature as I } from "./package-db.js";
function W(e = {}) {
  const t = new D();
  t.registerResolver(
    "command",
    (i, o) => N(i.prefix, i.prefix.length, o.index)
  ), t.registerResolver(
    "label",
    (i, o) => X(i.prefix, i.prefix.length, o.index)
  ), t.registerResolver(
    "citation",
    (i, o) => H(i.prefix, i.prefix.length, o.index)
  ), t.registerResolver(
    "environment",
    (i, o) => q(
      i.prefix,
      i.prefix.length,
      o.index,
      i.type === "argument" && i.command === "begin"
    )
  ), t.registerResolver("tex-class", g("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", g("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", g("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    g("biblatex-style", e.resourceCatalog)
  ), t.registerResolver("font-family", g("font-file", e.resourceCatalog));
  const n = (i, o) => Z(i.prefix, i.prefix.length, o.fs);
  return t.registerResolver("project-tex", n), t.registerResolver("project-bib", n), t.registerResolver("project-image", n), t.registerResolver("project-file", n), t;
}
const j = W();
function he(e, t, n, i, o = {}) {
  const r = o.registry ?? j;
  if (o.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const s = S(e, t, r);
  return s ? r.resolveResult(s, {
    document: e,
    position: t,
    index: n,
    fs: i,
    ...o.cancellationToken ? { cancellationToken: o.cancellationToken } : {}
  }) : { items: [], isIncomplete: !1 };
}
function y(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function F(e, t) {
  const n = [];
  return e.documentation && n.push(e.documentation), e.package && n.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), n.join(`

`);
}
function N(e, t, n) {
  const i = [], o = n.getLoadedPackages();
  for (const r of w) {
    if (!r.name.startsWith(e)) continue;
    const s = !r.package || o.has(r.package), l = {
      label: `\\${r.name}`,
      kind: "command",
      insertText: r.snippet.slice(1),
      snippet: !0,
      sortText: `${s ? "0a" : "0b"}_${r.name}`,
      replaceLength: t
    };
    r.detail && (l.detail = r.detail);
    const c = F(r, s);
    c && (l.documentation = c), i.push(l);
  }
  for (const r of n.getCommandDefs())
    r.name.startsWith(e) && i.push({
      label: `\\${r.name}`,
      kind: "variable",
      insertText: r.name,
      detail: `User command (${r.location.file}:${r.location.line})`,
      sortText: `1_${r.name}`,
      replaceLength: t
    });
  return V(i, e, t, n), i;
}
function B(e, t) {
  return e === "macro" ? `Package macro${y(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function U(e, t) {
  let n = e;
  for (let i = 1; i <= t; i++) n += `{$${i}}`;
  return n;
}
function V(e, t, n, i) {
  const o = new Set(e.map((r) => r.label.slice(1)));
  for (const [r, s] of i.getEngineCommands()) {
    if (!r.startsWith(t) || o.has(r)) continue;
    const l = s.argCount > 0;
    e.push({
      label: `\\${r}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: l ? U(r, s.argCount) : r,
      snippet: l,
      detail: B(s.category, s.argCount),
      sortText: `2_${r}`,
      replaceLength: n
    });
  }
}
function X(e, t, n) {
  const i = [];
  for (const o of n.getAllLabels()) {
    if (!o.name.startsWith(e)) continue;
    const r = n.resolveLabel(o.name), s = `${o.location.file}:${o.location.line}`;
    i.push({
      label: o.name,
      kind: "reference",
      insertText: o.name,
      detail: r ? `[${r}] ${s}` : s,
      replaceLength: t
    });
  }
  return i;
}
function H(e, t, n) {
  const i = [], o = /* @__PURE__ */ new Set();
  for (const r of n.getAuxCitations())
    r.startsWith(e) && (o.add(r), i.push({
      label: r,
      kind: "reference",
      insertText: r,
      detail: "Citation",
      replaceLength: t
    }));
  for (const r of n.getBibEntries()) {
    if (o.has(r.key) || !r.key.startsWith(e)) continue;
    const s = [r.author, r.year].filter(Boolean).join(", ");
    i.push({
      label: r.key,
      kind: "reference",
      insertText: r.key,
      detail: s || (r.title ?? r.type),
      replaceLength: t
    });
  }
  return i;
}
function q(e, t, n, i) {
  const o = [], r = /* @__PURE__ */ new Set();
  for (const s of A) {
    if (!s.name.startsWith(e)) continue;
    r.add(s.name);
    const l = {
      label: s.name,
      kind: "module",
      insertText: s.name,
      replaceLength: t
    };
    s.detail && (l.detail = s.detail), i && (l.sortText = `0_${s.name}`), o.push(l);
  }
  for (const s of n.getAllEnvironments())
    !s.startsWith(e) || r.has(s) || (r.add(s), o.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: "Used in project",
      sortText: `1_${s}`,
      replaceLength: t
    }));
  return K(o, e, t, r, n), o;
}
function K(e, t, n, i, o) {
  const r = new Set(o.getEngineEnvironments());
  for (const s of k()) r.add(s);
  for (const s of r) {
    if (!s.startsWith(t) || i.has(s)) continue;
    const l = o.getEngineCommands().get(s)?.argCount ?? -1;
    e.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: `Package environment${y(l)}`,
      sortText: `2_${s}`,
      replaceLength: n
    });
  }
}
const z = {
  "tex-class": /* @__PURE__ */ new Set(["cls"]),
  "tex-package": /* @__PURE__ */ new Set(["sty"]),
  "bib-style": /* @__PURE__ */ new Set(["bst"]),
  "biblatex-style": /* @__PURE__ */ new Set(["bbx", "cbx", "lbx"]),
  "font-file": /* @__PURE__ */ new Set(["otf", "ttf", "ttc"])
};
function J(e, t) {
  const n = e.lastIndexOf(".");
  return n < 0 || !z[t].has(e.slice(n + 1).toLowerCase()) ? null : e.slice(0, n);
}
function Y(e, t, n, i) {
  return i.listFiles().map((o) => ({ path: o, name: J(o, n) })).filter(
    (o) => o.name?.startsWith(e) === !0
  ).map(({ path: o, name: r }) => ({
    label: r,
    kind: n === "font-file" ? "file" : "module",
    insertText: r,
    detail: `Project resource: ${o}`,
    sortText: `0_${r}`,
    replaceLength: t
  }));
}
function G(e, t, n, i) {
  const o = i === "font-file" ? e.fileName : e.name;
  if (!o.startsWith(t)) return null;
  const r = {
    label: o,
    kind: i === "font-file" ? "file" : "module",
    insertText: o,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${o}`,
    replaceLength: n
  };
  return e.documentationUrl && (r.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), r;
}
function g(e, t) {
  return (n, i) => {
    const o = Y(n.prefix, n.prefix.length, e, i.fs);
    if (!t) return o;
    const r = t.getState(e);
    if ((r.status === "idle" || r.status === "error") && t.load(e, i.cancellationToken), r.status !== "ready")
      return {
        items: o,
        isIncomplete: r.status !== "mismatch"
      };
    const s = r.shard.resources.map((l) => G(l, n.prefix, n.prefix.length, e)).filter((l) => l !== null);
    return { items: Q([...o, ...s]), isIncomplete: !1 };
  };
}
function Q(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((n) => t.has(n.insertText) ? !1 : (t.add(n.insertText), !0));
}
function Z(e, t, n) {
  return n.listFiles().filter((i) => i.startsWith(e)).map((i) => ({ label: i, kind: "file", insertText: i, replaceLength: t }));
}
const ee = /\\(?:begin|end)\{(\w+\*?)\}/g, te = new RegExp(`\\\\(?:${R})\\{([^}]+)\\}`, "g"), ne = new RegExp(`\\\\(?:${b})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), ie = new RegExp(v, "g");
function f(e, t, n) {
  for (const i of e.matchAll(t))
    if (n >= i.index && n < i.index + i[0].length) return i;
  return null;
}
function re(e, t, n) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + n + 1 };
}
function $e(e, t, n) {
  const i = e.lineAt(t.line), o = t.column - 1, r = f(i, ee, o);
  if (r) return { contents: oe(r[1], n), range: p(t.line, r) };
  const s = f(i, te, o);
  if (s) {
    const a = d(s, o) ?? s[1].trim();
    return { contents: se(a, n), range: p(t.line, s) };
  }
  const l = f(i, ne, o);
  if (l) return { contents: le(l[1], n), range: p(t.line, l) };
  const c = f(i, ie, o);
  if (c) {
    const a = ae(c[1], n);
    return a ? { contents: a, range: p(t.line, c) } : null;
  }
  return null;
}
function p(e, t) {
  return re(e, t.index, t[0].length);
}
function oe(e, t) {
  const n = M(e);
  if (n) {
    const i = [`**${e}** environment`];
    return n.detail && i.push(n.detail), n.package && i.push(`Package: \`${n.package}\``), h(i, t.getEngineCommands().get(e)), i;
  }
  if (t.getEngineEnvironments().has(e) || k().has(e)) {
    const i = [`**${e}** — Package environment`];
    return h(i, t.getEngineCommands().get(e)), i;
  }
  return [`**${e}** environment`];
}
function se(e, t) {
  const n = t.resolveLabel(e), i = t.findLabelDef(e), o = [n ? `**\\ref{${e}}** = ${n}` : `**\\ref{${e}}**`];
  return i && o.push(`Defined at ${i.location.file}:${i.location.line}`), o;
}
function le(e, t) {
  const n = [];
  for (const i of e.split(",")) {
    const o = i.trim(), r = t.findBibEntry(o);
    if (r) {
      const s = _(r);
      n.push(`**[${o}]** ${r.type}${s ? `

${s}` : ""}`);
    } else
      n.push(`**[${o}]**`);
  }
  return n;
}
function ae(e, t) {
  const n = P(e);
  if (n) {
    const r = [`**\\${e}**${n.detail ? ` — ${n.detail}` : ""}`], s = O(n.snippet);
    return s.length && r.push(`\`${I(e, s)}\``), n.documentation && r.push(n.documentation), n.package && r.push(`Package: \`${n.package}\``), h(r, t.getEngineCommands().get(e)), r;
  }
  const i = t.findCommandDef(e);
  if (i)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${i.location.file}:${i.location.line}`
    ];
  const o = t.getEngineCommands().get(e);
  if (o) {
    const r = [`**\\${e}** — ${ce(o.category)}`];
    return h(r, o), r;
  }
  return null;
}
function ce(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function h(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const T = new RegExp(`\\\\(?:${R})\\{([^}]+)\\}`, "g"), x = new RegExp(`\\\\(?:${b})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), L = new RegExp(v, "g");
function m(e, t) {
  return {
    file: e,
    range: {
      startLine: t.line,
      startColumn: t.column,
      endLine: t.line,
      endColumn: t.column
    }
  };
}
function d(e, t) {
  const n = e[1];
  let i = e.index + e[0].lastIndexOf("{") + 1;
  for (const o of n.split(",")) {
    if (t >= i && t <= i + o.length) return o.trim() || null;
    i += o.length + 1;
  }
  return n.split(",")[0]?.trim() || null;
}
function Ce(e, t, n) {
  const i = e.lineAt(t.line), o = t.column - 1, r = f(i, T, o);
  if (r) {
    const c = d(r, o), a = c ? n.findLabelDef(c) : null;
    return a ? m(a.location.file, a.location) : null;
  }
  const s = f(i, x, o);
  if (s) {
    const c = d(s, o);
    if (!c) return null;
    const a = n.findBibEntry(c);
    if (a) return m(a.location.file, a.location);
    const u = n.findBibitemDef(c);
    return u ? m(u.location.file, u.location) : null;
  }
  const l = f(i, L, o);
  if (l) {
    const c = n.findCommandDef(l[1]);
    return c ? m(c.location.file, c.location) : null;
  }
  return null;
}
function Ee(e, t, n) {
  const i = e.lineAt(t.line), o = t.column - 1, r = f(i, /\\label\{([^}]+)\}/g, o);
  if (r)
    return n.getAllLabelRefs(r[1].trim()).map((a) => m(a.location.file, a.location));
  const s = f(i, T, o);
  if (s) {
    const a = d(s, o);
    if (!a) return [];
    const u = [], $ = n.findLabelDef(a);
    $ && u.push(m($.location.file, $.location));
    for (const C of n.getAllLabelRefs(a)) u.push(m(C.location.file, C.location));
    return u;
  }
  const l = f(i, x, o);
  if (l) {
    const a = d(l, o);
    return a ? E(n.findAllOccurrences(a, "citation")) : [];
  }
  const c = f(i, L, o);
  return c && n.findCommandDef(c[1]) ? E(n.findAllOccurrences(c[1], "command")) : [];
}
function E(e) {
  return e.map((t) => ({
    file: t.filePath,
    range: {
      startLine: t.line,
      startColumn: t.column,
      endLine: t.line,
      endColumn: t.column + t.length
    }
  }));
}
export {
  W as createDefaultCompletionRegistry,
  he as provideCompletionResult,
  Ce as provideDefinition,
  $e as provideHover,
  Ee as provideReferences
};
