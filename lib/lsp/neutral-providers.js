import { formatReference as I } from "./bib-parser.js";
import { analyzeCompletionContext as _ } from "./completion-context.js";
import { CompletionResolverRegistry as D } from "./completion-registry.js";
import { LATEX_COMMANDS as M, LATEX_ENVIRONMENTS as P, getEnvironmentByName as A, getCommandByName as j } from "./latex-commands.js";
import { REF_CMDS as b, CITE_CMDS as k, COMMAND_TOKEN as C } from "./latex-patterns.js";
import { getShardEnvironments as R, parseSignature as W, formatSignature as F } from "./package-db.js";
import { registerTexSemanticShard as O } from "./semantic-catalog.js";
class B {
  constructor(t, r) {
    this.provider = t, this.registry = r;
  }
  registeredScopes = /* @__PURE__ */ new Set();
  syncProject(t, r) {
    return this.syncScopes(
      [...t.getLoadedPackages()].map((n) => `package/${n}`),
      r
    );
  }
  syncScopes(t, r) {
    const n = [];
    let s = !1;
    for (const i of new Set(t)) {
      const o = this.provider.getState(i);
      o.status === "ready" ? (this.register(o.shard), n.push(o.shard)) : (o.status === "idle" || o.status === "loading" || o.status === "error") && (s = !0, o.status !== "loading" && this.provider.load(i, r).then((a) => {
        a.status === "ready" && this.register(a.shard);
      }));
    }
    return { shards: n, isIncomplete: s };
  }
  register(t) {
    this.registeredScopes.has(t.scope.id) || (O(this.registry, t), this.registeredScopes.add(t.scope.id));
  }
}
const E = /* @__PURE__ */ new WeakMap();
function V(e = {}) {
  const t = new D(), r = e.semanticCatalog ? new B(e.semanticCatalog, t) : void 0;
  r && E.set(t, r), t.registerResolver("command", (s, i) => {
    const o = r?.syncProject(i.index, i.cancellationToken);
    return {
      items: x(s.prefix, s.prefix.length, i.index),
      isIncomplete: o?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "label",
    (s, i) => q(s.prefix, s.prefix.length, i.index)
  ), t.registerResolver(
    "citation",
    (s, i) => Y(s.prefix, s.prefix.length, i.index)
  ), t.registerResolver("environment", (s, i) => {
    const o = r?.syncProject(i.index, i.cancellationToken), a = z(
      s.prefix,
      s.prefix.length,
      i.index,
      s.type === "argument" && s.command === "begin"
    );
    return G(a, s.prefix, s.prefix.length, o?.shards ?? []), { items: a, isIncomplete: o?.isIncomplete ?? !1 };
  }), t.registerResolver("tex-class", p("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", p("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", p("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    p("biblatex-style", e.resourceCatalog)
  ), t.registerResolver("font-family", p("font-file", e.resourceCatalog)), t.registerResolver(
    "boolean",
    (s) => ["true", "false"].filter((i) => i.startsWith(s.prefix)).map((i) => ({
      label: i,
      kind: "keyword",
      insertText: i,
      replaceLength: s.prefix.length
    }))
  ), t.registerResolver(
    "key-value",
    (s, i) => s.type === "argument" && r ? ae(s, i, r, t) : []
  );
  const n = (s, i) => pe(s.prefix, s.prefix.length, i.fs);
  return t.registerResolver("project-tex", n), t.registerResolver("project-bib", n), t.registerResolver("project-image", n), t.registerResolver("project-file", n), t;
}
function _e(e, t, r) {
  E.get(e)?.syncProject(t, r);
}
const N = V();
function De(e, t, r, n, s = {}) {
  const i = s.registry ?? N;
  if (s.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const o = _(e, t, i);
  return o ? i.resolveResult(o, {
    document: e,
    position: t,
    index: r,
    fs: n,
    ...s.cancellationToken ? { cancellationToken: s.cancellationToken } : {}
  }) : { items: [], isIncomplete: !1 };
}
function T(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function K(e, t) {
  const r = [];
  return e.documentation && r.push(e.documentation), e.package && r.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), r.join(`

`);
}
function x(e, t, r) {
  const n = [], s = r.getLoadedPackages();
  for (const i of M) {
    if (!i.name.startsWith(e)) continue;
    const o = !i.package || s.has(i.package), a = {
      label: `\\${i.name}`,
      kind: "command",
      insertText: i.snippet.slice(1),
      snippet: !0,
      sortText: `${o ? "0a" : "0b"}_${i.name}`,
      replaceLength: t
    };
    i.detail && (a.detail = i.detail);
    const c = K(i, o);
    c && (a.documentation = c), n.push(a);
  }
  for (const i of r.getCommandDefs())
    i.name.startsWith(e) && n.push({
      label: `\\${i.name}`,
      kind: "variable",
      insertText: i.name,
      detail: `User command (${i.location.file}:${i.location.line})`,
      sortText: `1_${i.name}`,
      replaceLength: t
    });
  return H(n, e, t, r), n;
}
function X(e, t) {
  return e === "macro" ? `Package macro${T(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function U(e, t) {
  let r = e;
  for (let n = 1; n <= t; n++) r += `{$${n}}`;
  return r;
}
function H(e, t, r, n) {
  const s = new Set(e.map((i) => i.label.slice(1)));
  for (const [i, o] of n.getEngineCommands()) {
    if (!i.startsWith(t) || s.has(i)) continue;
    const a = o.argCount > 0;
    e.push({
      label: `\\${i}`,
      kind: o.category === "primitive" ? "keyword" : "text",
      insertText: a ? U(i, o.argCount) : i,
      snippet: a,
      detail: X(o.category, o.argCount),
      sortText: `2_${i}`,
      replaceLength: r
    });
  }
}
function q(e, t, r) {
  const n = [];
  for (const s of r.getAllLabels()) {
    if (!s.name.startsWith(e)) continue;
    const i = r.resolveLabel(s.name), o = `${s.location.file}:${s.location.line}`;
    n.push({
      label: s.name,
      kind: "reference",
      insertText: s.name,
      detail: i ? `[${i}] ${o}` : o,
      replaceLength: t
    });
  }
  return n;
}
function Y(e, t, r) {
  const n = [], s = /* @__PURE__ */ new Set();
  for (const i of r.getAuxCitations())
    i.startsWith(e) && (s.add(i), n.push({
      label: i,
      kind: "reference",
      insertText: i,
      detail: "Citation",
      replaceLength: t
    }));
  for (const i of r.getBibEntries()) {
    if (s.has(i.key) || !i.key.startsWith(e)) continue;
    const o = [i.author, i.year].filter(Boolean).join(", ");
    n.push({
      label: i.key,
      kind: "reference",
      insertText: i.key,
      detail: o || (i.title ?? i.type),
      replaceLength: t
    });
  }
  return n;
}
function z(e, t, r, n) {
  const s = [], i = /* @__PURE__ */ new Set();
  for (const o of P) {
    if (!o.name.startsWith(e)) continue;
    i.add(o.name);
    const a = {
      label: o.name,
      kind: "module",
      insertText: o.name,
      replaceLength: t
    };
    o.detail && (a.detail = o.detail), n && (a.sortText = `0_${o.name}`), s.push(a);
  }
  for (const o of r.getAllEnvironments())
    !o.startsWith(e) || i.has(o) || (i.add(o), s.push({
      label: o,
      kind: "module",
      insertText: o,
      detail: "Used in project",
      sortText: `1_${o}`,
      replaceLength: t
    }));
  return J(s, e, t, i, r), s;
}
function J(e, t, r, n, s) {
  const i = new Set(s.getEngineEnvironments());
  for (const o of R()) i.add(o);
  for (const o of i) {
    if (!o.startsWith(t) || n.has(o)) continue;
    const a = s.getEngineCommands().get(o)?.argCount ?? -1;
    e.push({
      label: o,
      kind: "module",
      insertText: o,
      detail: `Package environment${T(a)}`,
      sortText: `2_${o}`,
      replaceLength: r
    });
  }
}
function G(e, t, r, n) {
  const s = new Set(e.map((i) => i.insertText));
  for (const i of n)
    for (const o of i.environments) {
      if (!o.name.startsWith(t) || s.has(o.name)) continue;
      s.add(o.name);
      const a = {
        label: o.name,
        kind: "module",
        insertText: o.name,
        detail: `TeX Live ${i.texliveYear}: ${i.scope.name} environment`,
        sortText: `2_${o.name}`,
        replaceLength: r
      };
      o.doc && (a.documentation = o.doc), e.push(a);
    }
}
function Q(e) {
  if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
    const r = e.keyFamily === "class-options" ? "class" : "package";
    return (e.selector?.values ?? []).map((n) => n.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((n) => `${r}/${n}`);
  }
  const t = e.keyFamily?.split("/")[0]?.trim();
  return t ? [`package/${t}`] : [];
}
function Z(e, t) {
  return e.keyFamily ? t.flatMap((r) => {
    const n = r.keyFamilies.find((s) => s.name === e.keyFamily);
    return n ? [{ shard: r, keys: n.keys }] : [];
  }) : [];
}
function ee(e, t) {
  const r = e.provenance.map(
    (n) => `${n.evidence}: \`${n.sourcePath}\`${n.line ? `:${n.line}` : ""}`
  ).join(`

`);
  return [
    e.documentation,
    `Scopes: ${t.map((n) => `\`${n}\``).join(", ")}`,
    `Confidence: ${e.confidence}`,
    r
  ].filter(Boolean).join(`

`);
}
function te(e) {
  return e.value.type === "flag" ? { insertText: e.name } : { insertText: `${e.name}=\${1}`, snippet: !0 };
}
function ne(e, t) {
  const r = /* @__PURE__ */ new Map();
  for (const { shard: n, keys: s } of t)
    for (const i of s) {
      const o = r.get(i.name);
      o ? (o.scopes.push(n.scope.id), o.key.repeatable &&= i.repeatable) : r.set(i.name, { key: { ...i }, scopes: [n.scope.id] });
    }
  return [...r.values()].filter(
    ({ key: n }) => n.name.startsWith(e.prefix) && (n.repeatable || !e.usedKeys.includes(n.name))
  ).map(({ key: n, scopes: s }) => ({
    label: n.name,
    kind: "keyword",
    ...te(n),
    detail: `${n.value.type} key · ${s.join(", ")}`,
    documentation: ee(n, s),
    sortText: `0_${n.name}`,
    replaceLength: e.prefix.length
  }));
}
function ie(e) {
  return {
    boolean: "boolean",
    color: "color",
    file: "project-file",
    command: "command",
    "tex-class": "tex-class",
    "tex-package": "tex-package",
    "bib-style": "bib-style",
    "biblatex-style": "biblatex-style",
    "font-family": "font-family"
  }[e] ?? null;
}
function re(e, t) {
  return [...new Set(
    t.flatMap((n) => n.value.type === "enum" ? n.value.values ?? [] : [])
  )].filter((n) => n.startsWith(e.prefix)).sort().map((n) => ({
    label: n,
    kind: "keyword",
    insertText: n,
    replaceLength: e.prefix.length
  }));
}
function se(e, t) {
  const r = e.prefix.startsWith("\\"), n = r ? e.prefix.slice(1) : e.prefix;
  return x(n, n.length, t).map((s) => ({
    ...s,
    insertText: r ? `\\${s.insertText}` : s.insertText,
    replaceLength: e.prefix.length
  }));
}
function oe(e, t, r, n) {
  if (n.some((i) => i.value.type === "enum"))
    return { items: re(e, n), isIncomplete: !1 };
  if (n.some((i) => i.value.type === "command"))
    return { items: se(e, t.index), isIncomplete: !1 };
  const s = n.map((i) => ie(i.value.type)).find(Boolean);
  return s ? r.resolveResult({ ...e, domain: s, valueKind: s }, t) : { items: [], isIncomplete: !1 };
}
function ae(e, t, r, n) {
  const s = r.syncScopes(Q(e), t.cancellationToken), i = Z(e, s.shards);
  if (e.keyValuePosition !== "value")
    return { items: ne(e, i), isIncomplete: s.isIncomplete };
  if (!e.key) return { items: [], isIncomplete: s.isIncomplete };
  const o = i.flatMap((c) => c.keys.filter((l) => l.name === e.key)), a = oe(e, t, n, o);
  return { items: a.items, isIncomplete: s.isIncomplete || a.isIncomplete };
}
const le = {
  "tex-class": /* @__PURE__ */ new Set(["cls"]),
  "tex-package": /* @__PURE__ */ new Set(["sty"]),
  "bib-style": /* @__PURE__ */ new Set(["bst"]),
  "biblatex-style": /* @__PURE__ */ new Set(["bbx", "cbx", "lbx"]),
  "font-file": /* @__PURE__ */ new Set(["otf", "ttf", "ttc"])
};
function ce(e, t) {
  const r = e.lastIndexOf(".");
  return r < 0 || !le[t].has(e.slice(r + 1).toLowerCase()) ? null : e.slice(0, r);
}
function fe(e, t, r, n) {
  return n.listFiles().map((s) => ({ path: s, name: ce(s, r) })).filter(
    (s) => s.name?.startsWith(e) === !0
  ).map(({ path: s, name: i }) => ({
    label: i,
    kind: r === "font-file" ? "file" : "module",
    insertText: i,
    detail: `Project resource: ${s}`,
    sortText: `0_${i}`,
    replaceLength: t
  }));
}
function ue(e, t, r, n) {
  const s = n === "font-file" ? e.fileName : e.name;
  if (!s.startsWith(t)) return null;
  const i = {
    label: s,
    kind: n === "font-file" ? "file" : "module",
    insertText: s,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${s}`,
    replaceLength: r
  };
  return e.documentationUrl && (i.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), i;
}
function p(e, t) {
  return (r, n) => {
    const s = fe(r.prefix, r.prefix.length, e, n.fs);
    if (!t) return s;
    const i = t.getState(e);
    if ((i.status === "idle" || i.status === "error") && t.load(e, n.cancellationToken), i.status !== "ready")
      return {
        items: s,
        isIncomplete: i.status !== "mismatch"
      };
    const o = i.shard.resources.map((a) => ue(a, r.prefix, r.prefix.length, e)).filter((a) => a !== null);
    return { items: me([...s, ...o]), isIncomplete: !1 };
  };
}
function me(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((r) => t.has(r.insertText) ? !1 : (t.add(r.insertText), !0));
}
function pe(e, t, r) {
  return r.listFiles().filter((n) => n.startsWith(e)).map((n) => ({ label: n, kind: "file", insertText: n, replaceLength: t }));
}
const ge = /\\(?:begin|end)\{(\w+\*?)\}/g, de = new RegExp(`\\\\(?:${b})\\{([^}]+)\\}`, "g"), he = new RegExp(`\\\\(?:${k})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), ye = new RegExp(C, "g");
function f(e, t, r) {
  for (const n of e.matchAll(t))
    if (r >= n.index && r < n.index + n[0].length) return n;
  return null;
}
function $e(e, t, r) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + r + 1 };
}
function Me(e, t, r) {
  const n = e.lineAt(t.line), s = t.column - 1, i = f(n, ge, s);
  if (i) return { contents: ve(i[1], r), range: d(t.line, i) };
  const o = f(n, de, s);
  if (o) {
    const l = g(o, s) ?? o[1].trim();
    return { contents: be(l, r), range: d(t.line, o) };
  }
  const a = f(n, he, s);
  if (a) return { contents: ke(a[1], r), range: d(t.line, a) };
  const c = f(n, ye, s);
  if (c) {
    const l = Ce(c[1], r);
    return l ? { contents: l, range: d(t.line, c) } : null;
  }
  return null;
}
function d(e, t) {
  return $e(e, t.index, t[0].length);
}
function ve(e, t) {
  const r = A(e);
  if (r) {
    const n = [`**${e}** environment`];
    return r.detail && n.push(r.detail), r.package && n.push(`Package: \`${r.package}\``), h(n, t.getEngineCommands().get(e)), n;
  }
  if (t.getEngineEnvironments().has(e) || R().has(e)) {
    const n = [`**${e}** — Package environment`];
    return h(n, t.getEngineCommands().get(e)), n;
  }
  return [`**${e}** environment`];
}
function be(e, t) {
  const r = t.resolveLabel(e), n = t.findLabelDef(e), s = [r ? `**\\ref{${e}}** = ${r}` : `**\\ref{${e}}**`];
  return n && s.push(`Defined at ${n.location.file}:${n.location.line}`), s;
}
function ke(e, t) {
  const r = [];
  for (const n of e.split(",")) {
    const s = n.trim(), i = t.findBibEntry(s);
    if (i) {
      const o = I(i);
      r.push(`**[${s}]** ${i.type}${o ? `

${o}` : ""}`);
    } else
      r.push(`**[${s}]**`);
  }
  return r;
}
function Ce(e, t) {
  const r = j(e);
  if (r) {
    const i = [`**\\${e}**${r.detail ? ` — ${r.detail}` : ""}`], o = W(r.snippet);
    return o.length && i.push(`\`${F(e, o)}\``), r.documentation && i.push(r.documentation), r.package && i.push(`Package: \`${r.package}\``), h(i, t.getEngineCommands().get(e)), i;
  }
  const n = t.findCommandDef(e);
  if (n)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${n.location.file}:${n.location.line}`
    ];
  const s = t.getEngineCommands().get(e);
  if (s) {
    const i = [`**\\${e}** — ${Re(s.category)}`];
    return h(i, s), i;
  }
  return null;
}
function Re(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function h(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const S = new RegExp(`\\\\(?:${b})\\{([^}]+)\\}`, "g"), L = new RegExp(`\\\\(?:${k})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), w = new RegExp(C, "g");
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
function g(e, t) {
  const r = e[1];
  let n = e.index + e[0].lastIndexOf("{") + 1;
  for (const s of r.split(",")) {
    if (t >= n && t <= n + s.length) return s.trim() || null;
    n += s.length + 1;
  }
  return r.split(",")[0]?.trim() || null;
}
function Pe(e, t, r) {
  const n = e.lineAt(t.line), s = t.column - 1, i = f(n, S, s);
  if (i) {
    const c = g(i, s), l = c ? r.findLabelDef(c) : null;
    return l ? m(l.location.file, l.location) : null;
  }
  const o = f(n, L, s);
  if (o) {
    const c = g(o, s);
    if (!c) return null;
    const l = r.findBibEntry(c);
    if (l) return m(l.location.file, l.location);
    const u = r.findBibitemDef(c);
    return u ? m(u.location.file, u.location) : null;
  }
  const a = f(n, w, s);
  if (a) {
    const c = r.findCommandDef(a[1]);
    return c ? m(c.location.file, c.location) : null;
  }
  return null;
}
function Ae(e, t, r) {
  const n = e.lineAt(t.line), s = t.column - 1, i = f(n, /\\label\{([^}]+)\}/g, s);
  if (i)
    return r.getAllLabelRefs(i[1].trim()).map((l) => m(l.location.file, l.location));
  const o = f(n, S, s);
  if (o) {
    const l = g(o, s);
    if (!l) return [];
    const u = [], y = r.findLabelDef(l);
    y && u.push(m(y.location.file, y.location));
    for (const $ of r.getAllLabelRefs(l)) u.push(m($.location.file, $.location));
    return u;
  }
  const a = f(n, L, s);
  if (a) {
    const l = g(a, s);
    return l ? v(r.findAllOccurrences(l, "citation")) : [];
  }
  const c = f(n, w, s);
  return c && r.findCommandDef(c[1]) ? v(r.findAllOccurrences(c[1], "command")) : [];
}
function v(e) {
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
  V as createDefaultCompletionRegistry,
  _e as preloadSemanticCatalog,
  De as provideCompletionResult,
  Pe as provideDefinition,
  Me as provideHover,
  Ae as provideReferences
};
