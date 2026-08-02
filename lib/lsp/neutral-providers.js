import { formatReference as I } from "./bib-parser.js";
import { completeColors as _ } from "./color-completion.js";
import { analyzeCompletionContext as D } from "./completion-context.js";
import { CompletionResolverRegistry as M } from "./completion-registry.js";
import { LATEX_COMMANDS as P, LATEX_ENVIRONMENTS as A, getEnvironmentByName as j, getCommandByName as W } from "./latex-commands.js";
import { REF_CMDS as k, CITE_CMDS as v, COMMAND_TOKEN as C } from "./latex-patterns.js";
import { getShardEnvironments as R, parseSignature as F, formatSignature as O } from "./package-db.js";
import { registerTexSemanticShard as B } from "./semantic-catalog.js";
class V {
  constructor(t, o) {
    this.provider = t, this.registry = o;
  }
  registeredScopes = /* @__PURE__ */ new Set();
  syncProject(t, o, r) {
    return this.syncScopes(
      [
        ...[...t.getLoadedPackages(r)].map((i) => `package/${i}`),
        ...[...t.getLoadedClasses(r)].map((i) => `class/${i}`)
      ],
      o
    );
  }
  syncScopes(t, o) {
    const r = [];
    let i = !1;
    const n = [...new Set(t)], s = /* @__PURE__ */ new Set();
    for (; n.length > 0; ) {
      const a = n.shift();
      if (s.has(a)) continue;
      s.add(a);
      const l = this.provider.getState(a);
      if (l.status === "ready") {
        this.register(l.shard), r.push(l.shard);
        for (const c of l.shard.dependencies)
          n.push(`package/${c}`);
      } else (l.status === "idle" || l.status === "loading" || l.status === "error") && (i = !0, l.status !== "loading" && this.provider.load(a, o).then((c) => {
        c.status === "ready" && this.register(c.shard);
      }));
    }
    return { shards: r, isIncomplete: i };
  }
  register(t) {
    this.registeredScopes.has(t.scope.id) || (B(this.registry, t), this.registeredScopes.add(t.scope.id));
  }
}
const E = /* @__PURE__ */ new WeakMap();
function N(e = {}) {
  const t = new M(), o = e.semanticCatalog ? new V(e.semanticCatalog, t) : void 0;
  o && E.set(t, o), t.registerResolver("command", (i, n) => {
    const s = o?.syncProject(
      n.index,
      n.cancellationToken,
      n.document.path
    );
    return {
      items: S(i.prefix, i.prefix.length, n.index),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "label",
    (i, n) => Y(i.prefix, i.prefix.length, n.index)
  ), t.registerResolver(
    "citation",
    (i, n) => z(i.prefix, i.prefix.length, n.index)
  ), t.registerResolver("environment", (i, n) => {
    const s = o?.syncProject(
      n.index,
      n.cancellationToken,
      n.document.path
    ), a = J(
      i.prefix,
      i.prefix.length,
      n.index,
      i.type === "argument" && i.command === "begin"
    );
    return Q(a, i.prefix, i.prefix.length, s?.shards ?? []), { items: a, isIncomplete: s?.isIncomplete ?? !1 };
  }), t.registerResolver("tex-class", p("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", p("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", p("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    p("biblatex-style", e.resourceCatalog)
  ), t.registerResolver("font-family", p("font-file", e.resourceCatalog)), t.registerResolver(
    "boolean",
    (i) => ["true", "false"].filter((n) => n.startsWith(i.prefix)).map((n) => ({
      label: n,
      kind: "keyword",
      insertText: n,
      replaceLength: i.prefix.length
    }))
  ), t.registerResolver("color", (i, n) => {
    if (i.type !== "argument") return [];
    if (i.argumentIndex > 0 && (i.command === "color" || i.command === "textcolor" || i.command === "colorbox"))
      return [];
    const s = o?.syncProject(
      n.index,
      n.cancellationToken,
      n.document.path
    );
    return {
      items: _(n, s?.shards ?? []),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "key-value",
    (i, n) => i.type === "argument" && o ? le(i, n, o, t) : []
  );
  const r = (i, n) => ge(i.prefix, i.prefix.length, n.fs);
  return t.registerResolver("project-tex", r), t.registerResolver("project-bib", r), t.registerResolver("project-image", r), t.registerResolver("project-file", r), t;
}
function Me(e, t, o) {
  E.get(e)?.syncProject(t, o);
}
const K = N();
function Pe(e, t, o, r, i = {}) {
  const n = i.registry ?? K;
  if (i.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const s = D(e, t, n);
  return s ? n.resolveResult(s, {
    document: e,
    position: t,
    index: o,
    fs: r,
    ...i.cancellationToken ? { cancellationToken: i.cancellationToken } : {}
  }) : { items: [], isIncomplete: !1 };
}
function T(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function X(e, t) {
  const o = [];
  return e.documentation && o.push(e.documentation), e.package && o.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), o.join(`

`);
}
function S(e, t, o) {
  const r = [], i = o.getLoadedPackages();
  for (const n of P) {
    if (!n.name.startsWith(e)) continue;
    const s = !n.package || i.has(n.package), a = {
      label: `\\${n.name}`,
      kind: "command",
      insertText: n.snippet.slice(1),
      snippet: !0,
      sortText: `${s ? "0a" : "0b"}_${n.name}`,
      replaceLength: t
    };
    n.detail && (a.detail = n.detail);
    const l = X(n, s);
    l && (a.documentation = l), r.push(a);
  }
  for (const n of o.getCommandDefs())
    n.name.startsWith(e) && r.push({
      label: `\\${n.name}`,
      kind: "variable",
      insertText: n.name,
      detail: `User command (${n.location.file}:${n.location.line})`,
      sortText: `1_${n.name}`,
      replaceLength: t
    });
  return q(r, e, t, o), r;
}
function U(e, t) {
  return e === "macro" ? `Package macro${T(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function H(e, t) {
  let o = e;
  for (let r = 1; r <= t; r++) o += `{$${r}}`;
  return o;
}
function q(e, t, o, r) {
  const i = new Set(e.map((n) => n.label.slice(1)));
  for (const [n, s] of r.getEngineCommands()) {
    if (!n.startsWith(t) || i.has(n)) continue;
    const a = s.argCount > 0;
    e.push({
      label: `\\${n}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: a ? H(n, s.argCount) : n,
      snippet: a,
      detail: U(s.category, s.argCount),
      sortText: `2_${n}`,
      replaceLength: o
    });
  }
}
function Y(e, t, o) {
  const r = [];
  for (const i of o.getAllLabels()) {
    if (!i.name.startsWith(e)) continue;
    const n = o.resolveLabel(i.name), s = `${i.location.file}:${i.location.line}`;
    r.push({
      label: i.name,
      kind: "reference",
      insertText: i.name,
      detail: n ? `[${n}] ${s}` : s,
      replaceLength: t
    });
  }
  return r;
}
function z(e, t, o) {
  const r = [], i = /* @__PURE__ */ new Set();
  for (const n of o.getAuxCitations())
    n.startsWith(e) && (i.add(n), r.push({
      label: n,
      kind: "reference",
      insertText: n,
      detail: "Citation",
      replaceLength: t
    }));
  for (const n of o.getBibEntries()) {
    if (i.has(n.key) || !n.key.startsWith(e)) continue;
    const s = [n.author, n.year].filter(Boolean).join(", ");
    r.push({
      label: n.key,
      kind: "reference",
      insertText: n.key,
      detail: s || (n.title ?? n.type),
      replaceLength: t
    });
  }
  return r;
}
function J(e, t, o, r) {
  const i = [], n = /* @__PURE__ */ new Set();
  for (const s of A) {
    if (!s.name.startsWith(e)) continue;
    n.add(s.name);
    const a = {
      label: s.name,
      kind: "module",
      insertText: s.name,
      replaceLength: t
    };
    s.detail && (a.detail = s.detail), r && (a.sortText = `0_${s.name}`), i.push(a);
  }
  for (const s of o.getAllEnvironments())
    !s.startsWith(e) || n.has(s) || (n.add(s), i.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: "Used in project",
      sortText: `1_${s}`,
      replaceLength: t
    }));
  return G(i, e, t, n, o), i;
}
function G(e, t, o, r, i) {
  const n = new Set(i.getEngineEnvironments());
  for (const s of R()) n.add(s);
  for (const s of n) {
    if (!s.startsWith(t) || r.has(s)) continue;
    const a = i.getEngineCommands().get(s)?.argCount ?? -1;
    e.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: `Package environment${T(a)}`,
      sortText: `2_${s}`,
      replaceLength: o
    });
  }
}
function Q(e, t, o, r) {
  const i = new Set(e.map((n) => n.insertText));
  for (const n of r)
    for (const s of n.environments) {
      if (!s.name.startsWith(t) || i.has(s.name)) continue;
      i.add(s.name);
      const a = {
        label: s.name,
        kind: "module",
        insertText: s.name,
        detail: `TeX Live ${n.texliveYear}: ${n.scope.name} environment`,
        sortText: `2_${s.name}`,
        replaceLength: o
      };
      s.doc && (a.documentation = s.doc), e.push(a);
    }
}
function Z(e) {
  if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
    const o = e.keyFamily === "class-options" ? "class" : "package";
    return (e.selector?.values ?? []).map((r) => r.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((r) => `${o}/${r}`);
  }
  const t = e.keyFamily?.split("/")[0]?.trim();
  return t ? [`package/${t}`] : [];
}
function ee(e, t) {
  return e.keyFamily ? t.flatMap((o) => {
    const r = o.keyFamilies.find((i) => i.name === e.keyFamily);
    return r ? [{ shard: o, keys: r.keys }] : [];
  }) : [];
}
function te(e, t) {
  const o = e.provenance.map(
    (r) => `${r.evidence}: \`${r.sourcePath}\`${r.line ? `:${r.line}` : ""}`
  ).join(`

`);
  return [
    e.documentation,
    `Scopes: ${t.map((r) => `\`${r}\``).join(", ")}`,
    `Confidence: ${e.confidence}`,
    o
  ].filter(Boolean).join(`

`);
}
function ne(e) {
  return e.value.type === "flag" ? { insertText: e.name } : { insertText: `${e.name}=\${1}`, snippet: !0 };
}
function ie(e, t) {
  const o = /* @__PURE__ */ new Map();
  for (const { shard: r, keys: i } of t)
    for (const n of i) {
      const s = o.get(n.name);
      s ? (s.scopes.push(r.scope.id), s.key.repeatable &&= n.repeatable) : o.set(n.name, { key: { ...n }, scopes: [r.scope.id] });
    }
  return [...o.values()].filter(
    ({ key: r }) => r.name.startsWith(e.prefix) && (r.repeatable || !e.usedKeys.includes(r.name))
  ).map(({ key: r, scopes: i }) => ({
    label: r.name,
    kind: "keyword",
    ...ne(r),
    detail: `${r.value.type} key · ${i.join(", ")}`,
    documentation: te(r, i),
    sortText: `0_${r.name}`,
    replaceLength: e.prefix.length
  }));
}
function re(e) {
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
function oe(e, t) {
  return [...new Set(
    t.flatMap((r) => r.value.type === "enum" ? r.value.values ?? [] : [])
  )].filter((r) => r.startsWith(e.prefix)).sort().map((r) => ({
    label: r,
    kind: "keyword",
    insertText: r,
    replaceLength: e.prefix.length
  }));
}
function se(e, t) {
  const o = e.prefix.startsWith("\\"), r = o ? e.prefix.slice(1) : e.prefix;
  return S(r, r.length, t).map((i) => ({
    ...i,
    insertText: o ? `\\${i.insertText}` : i.insertText,
    replaceLength: e.prefix.length
  }));
}
function ae(e, t, o, r) {
  if (r.some((n) => n.value.type === "enum"))
    return { items: oe(e, r), isIncomplete: !1 };
  if (r.some((n) => n.value.type === "command"))
    return { items: se(e, t.index), isIncomplete: !1 };
  const i = r.map((n) => re(n.value.type)).find(Boolean);
  return i ? o.resolveResult({ ...e, domain: i, valueKind: i }, t) : { items: [], isIncomplete: !1 };
}
function le(e, t, o, r) {
  const i = o.syncScopes(Z(e), t.cancellationToken), n = ee(e, i.shards);
  if (e.keyValuePosition !== "value")
    return { items: ie(e, n), isIncomplete: i.isIncomplete };
  if (!e.key) return { items: [], isIncomplete: i.isIncomplete };
  const s = n.flatMap((l) => l.keys.filter((c) => c.name === e.key)), a = ae(e, t, r, s);
  return { items: a.items, isIncomplete: i.isIncomplete || a.isIncomplete };
}
const ce = {
  "tex-class": /* @__PURE__ */ new Set(["cls"]),
  "tex-package": /* @__PURE__ */ new Set(["sty"]),
  "bib-style": /* @__PURE__ */ new Set(["bst"]),
  "biblatex-style": /* @__PURE__ */ new Set(["bbx", "cbx", "lbx"]),
  "font-file": /* @__PURE__ */ new Set(["otf", "ttf", "ttc"])
};
function fe(e, t) {
  const o = e.lastIndexOf(".");
  return o < 0 || !ce[t].has(e.slice(o + 1).toLowerCase()) ? null : e.slice(0, o);
}
function ue(e, t, o, r) {
  return r.listFiles().map((i) => ({ path: i, name: fe(i, o) })).filter(
    (i) => i.name?.startsWith(e) === !0
  ).map(({ path: i, name: n }) => ({
    label: n,
    kind: o === "font-file" ? "file" : "module",
    insertText: n,
    detail: `Project resource: ${i}`,
    sortText: `0_${n}`,
    replaceLength: t
  }));
}
function me(e, t, o, r) {
  const i = r === "font-file" ? e.fileName : e.name;
  if (!i.startsWith(t)) return null;
  const n = {
    label: i,
    kind: r === "font-file" ? "file" : "module",
    insertText: i,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${i}`,
    replaceLength: o
  };
  return e.documentationUrl && (n.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), n;
}
function p(e, t) {
  return (o, r) => {
    const i = ue(o.prefix, o.prefix.length, e, r.fs);
    if (!t) return i;
    const n = t.getState(e);
    if ((n.status === "idle" || n.status === "error") && t.load(e, r.cancellationToken), n.status !== "ready")
      return {
        items: i,
        isIncomplete: n.status !== "mismatch"
      };
    const s = n.shard.resources.map((a) => me(a, o.prefix, o.prefix.length, e)).filter((a) => a !== null);
    return { items: pe([...i, ...s]), isIncomplete: !1 };
  };
}
function pe(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((o) => t.has(o.insertText) ? !1 : (t.add(o.insertText), !0));
}
function ge(e, t, o) {
  return o.listFiles().filter((r) => r.startsWith(e)).map((r) => ({ label: r, kind: "file", insertText: r, replaceLength: t }));
}
const de = /\\(?:begin|end)\{(\w+\*?)\}/g, he = new RegExp(`\\\\(?:${k})\\{([^}]+)\\}`, "g"), ye = new RegExp(`\\\\(?:${v})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), $e = new RegExp(C, "g");
function f(e, t, o) {
  for (const r of e.matchAll(t))
    if (o >= r.index && o < r.index + r[0].length) return r;
  return null;
}
function be(e, t, o) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + o + 1 };
}
function Ae(e, t, o) {
  const r = e.lineAt(t.line), i = t.column - 1, n = f(r, de, i);
  if (n) return { contents: ke(n[1], o), range: d(t.line, n) };
  const s = f(r, he, i);
  if (s) {
    const c = g(s, i) ?? s[1].trim();
    return { contents: ve(c, o), range: d(t.line, s) };
  }
  const a = f(r, ye, i);
  if (a) return { contents: Ce(a[1], o), range: d(t.line, a) };
  const l = f(r, $e, i);
  if (l) {
    const c = Re(l[1], o);
    return c ? { contents: c, range: d(t.line, l) } : null;
  }
  return null;
}
function d(e, t) {
  return be(e, t.index, t[0].length);
}
function ke(e, t) {
  const o = j(e);
  if (o) {
    const r = [`**${e}** environment`];
    return o.detail && r.push(o.detail), o.package && r.push(`Package: \`${o.package}\``), h(r, t.getEngineCommands().get(e)), r;
  }
  if (t.getEngineEnvironments().has(e) || R().has(e)) {
    const r = [`**${e}** — Package environment`];
    return h(r, t.getEngineCommands().get(e)), r;
  }
  return [`**${e}** environment`];
}
function ve(e, t) {
  const o = t.resolveLabel(e), r = t.findLabelDef(e), i = [o ? `**\\ref{${e}}** = ${o}` : `**\\ref{${e}}**`];
  return r && i.push(`Defined at ${r.location.file}:${r.location.line}`), i;
}
function Ce(e, t) {
  const o = [];
  for (const r of e.split(",")) {
    const i = r.trim(), n = t.findBibEntry(i);
    if (n) {
      const s = I(n);
      o.push(`**[${i}]** ${n.type}${s ? `

${s}` : ""}`);
    } else
      o.push(`**[${i}]**`);
  }
  return o;
}
function Re(e, t) {
  const o = W(e);
  if (o) {
    const n = [`**\\${e}**${o.detail ? ` — ${o.detail}` : ""}`], s = F(o.snippet);
    return s.length && n.push(`\`${O(e, s)}\``), o.documentation && n.push(o.documentation), o.package && n.push(`Package: \`${o.package}\``), h(n, t.getEngineCommands().get(e)), n;
  }
  const r = t.findCommandDef(e);
  if (r)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${r.location.file}:${r.location.line}`
    ];
  const i = t.getEngineCommands().get(e);
  if (i) {
    const n = [`**\\${e}** — ${Ee(i.category)}`];
    return h(n, i), n;
  }
  return null;
}
function Ee(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function h(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const x = new RegExp(`\\\\(?:${k})\\{([^}]+)\\}`, "g"), L = new RegExp(`\\\\(?:${v})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), w = new RegExp(C, "g");
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
  const o = e[1];
  let r = e.index + e[0].lastIndexOf("{") + 1;
  for (const i of o.split(",")) {
    if (t >= r && t <= r + i.length) return i.trim() || null;
    r += i.length + 1;
  }
  return o.split(",")[0]?.trim() || null;
}
function je(e, t, o) {
  const r = e.lineAt(t.line), i = t.column - 1, n = f(r, x, i);
  if (n) {
    const l = g(n, i), c = l ? o.findLabelDef(l) : null;
    return c ? m(c.location.file, c.location) : null;
  }
  const s = f(r, L, i);
  if (s) {
    const l = g(s, i);
    if (!l) return null;
    const c = o.findBibEntry(l);
    if (c) return m(c.location.file, c.location);
    const u = o.findBibitemDef(l);
    return u ? m(u.location.file, u.location) : null;
  }
  const a = f(r, w, i);
  if (a) {
    const l = o.findCommandDef(a[1]);
    return l ? m(l.location.file, l.location) : null;
  }
  return null;
}
function We(e, t, o) {
  const r = e.lineAt(t.line), i = t.column - 1, n = f(r, /\\label\{([^}]+)\}/g, i);
  if (n)
    return o.getAllLabelRefs(n[1].trim()).map((c) => m(c.location.file, c.location));
  const s = f(r, x, i);
  if (s) {
    const c = g(s, i);
    if (!c) return [];
    const u = [], y = o.findLabelDef(c);
    y && u.push(m(y.location.file, y.location));
    for (const $ of o.getAllLabelRefs(c)) u.push(m($.location.file, $.location));
    return u;
  }
  const a = f(r, L, i);
  if (a) {
    const c = g(a, i);
    return c ? b(o.findAllOccurrences(c, "citation")) : [];
  }
  const l = f(r, w, i);
  return l && o.findCommandDef(l[1]) ? b(o.findAllOccurrences(l[1], "command")) : [];
}
function b(e) {
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
  N as createDefaultCompletionRegistry,
  Me as preloadSemanticCatalog,
  Pe as provideCompletionResult,
  je as provideDefinition,
  Ae as provideHover,
  We as provideReferences
};
