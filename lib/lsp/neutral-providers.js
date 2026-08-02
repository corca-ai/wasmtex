import { registerBibCompletionResolvers as P } from "./bib-completion.js";
import { formatReference as M } from "./bib-parser.js";
import { completeColors as D } from "./color-completion.js";
import { analyzeCompletionContext as A } from "./completion-context.js";
import { CompletionResolverRegistry as F } from "./completion-registry.js";
import { completeProjectFiles as V } from "./file-completion.js";
import { LATEX_COMMANDS as W, LATEX_ENVIRONMENTS as K, getEnvironmentByName as B, getCommandByName as O } from "./latex-commands.js";
import { REF_CMDS as C, CITE_CMDS as T, COMMAND_TOKEN as R } from "./latex-patterns.js";
import { getShardEnvironments as E, parseSignature as N, formatSignature as U } from "./package-db.js";
import { registerTexSemanticShard as X } from "./semantic-catalog.js";
class H {
  constructor(t, i) {
    this.provider = t, this.registry = i;
  }
  registeredScopes = /* @__PURE__ */ new Set();
  syncProject(t, i, o) {
    return this.syncScopes(
      [
        ...[...t.getLoadedPackages(o)].map((n) => `package/${n}`),
        ...[...t.getLoadedClasses(o)].map((n) => `class/${n}`)
      ],
      i
    );
  }
  syncScopes(t, i) {
    const o = [];
    let n = !1;
    const r = [...new Set(t)], s = /* @__PURE__ */ new Set();
    for (; r.length > 0; ) {
      const a = r.shift();
      if (s.has(a)) continue;
      s.add(a);
      const l = this.provider.getState(a);
      if (l.status === "ready") {
        this.register(l.shard), o.push(l.shard);
        for (const c of l.shard.dependencies)
          r.push(`package/${c}`);
      } else (l.status === "idle" || l.status === "loading" || l.status === "error") && (n = !0, l.status !== "loading" && this.provider.load(a, i).then((c) => {
        c.status === "ready" && this.register(c.shard);
      }));
    }
    return { shards: o, isIncomplete: n };
  }
  register(t) {
    this.registeredScopes.has(t.scope.id) || (X(this.registry, t), this.registeredScopes.add(t.scope.id));
  }
}
const x = /* @__PURE__ */ new WeakMap();
function z(e = {}) {
  const t = new F(), i = e.semanticCatalog ? new H(e.semanticCatalog, t) : void 0;
  i && x.set(t, i), P(t), t.registerResolver("command", (n, r) => {
    const s = i?.syncProject(
      r.index,
      r.cancellationToken,
      r.document.path
    );
    return {
      items: j(n.prefix, n.prefix.length, r.index, r.document.path),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "label",
    (n, r) => Z(n.prefix, n.prefix.length, r.index, r.document.path)
  ), t.registerResolver(
    "citation",
    (n, r) => ee(n.prefix, n.prefix.length, r.index, r.document.path)
  ), t.registerResolver("environment", (n, r) => {
    const s = i?.syncProject(
      r.index,
      r.cancellationToken,
      r.document.path
    ), a = te(
      n.prefix,
      n.prefix.length,
      r.index,
      n.type === "argument" && n.command === "begin",
      r.document.path
    );
    return ie(a, n.prefix, n.prefix.length, s?.shards ?? []), { items: a, isIncomplete: s?.isIncomplete ?? !1 };
  }), t.registerResolver("tex-class", g("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", g("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", g("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    g("biblatex-style", e.resourceCatalog)
  );
  const o = g("font-file", e.resourceCatalog);
  t.registerResolver("font-family", (n, r) => {
    const s = d(n, r, "font-family"), a = o(n, r), l = Array.isArray(a) ? { items: a, isIncomplete: !1 } : a;
    return {
      items: w([...s, ...l.items]),
      isIncomplete: l.isIncomplete
    };
  }), t.registerResolver(
    "boolean",
    (n) => ["true", "false"].filter((r) => r.startsWith(n.prefix)).map((r) => ({
      label: r,
      kind: "keyword",
      insertText: r,
      replaceLength: n.prefix.length
    }))
  ), t.registerResolver("color", (n, r) => {
    if (n.type !== "argument") return [];
    if (n.argumentIndex > 0 && (n.command === "color" || n.command === "textcolor" || n.command === "colorbox"))
      return [];
    const s = i?.syncProject(
      r.index,
      r.cancellationToken,
      r.document.path
    );
    return {
      items: D(r, s?.shards ?? []),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "counter",
    (n, r) => d(n, r, "counter")
  ), t.registerResolver(
    "length",
    (n, r) => d(n, r, "length")
  ), t.registerResolver(
    "glossary-key",
    (n, r) => d(n, r, "glossary")
  ), t.registerResolver(
    "acronym-key",
    (n, r) => d(n, r, "acronym")
  ), t.registerResolver(
    "key-family",
    (n, r) => ae(n, r)
  ), t.registerResolver(
    "key-value",
    (n, r) => n.type === "argument" ? Ce(n, r, i, t) : []
  );
  for (const n of [
    "project-tex",
    "project-bib",
    "project-image",
    "project-listing",
    "project-data",
    "project-file"
  ])
    t.registerResolver(
      n,
      (r, s) => V(n, r.prefix, s.document.path, s.fs)
    );
  return t;
}
function ze(e, t, i) {
  x.get(e)?.syncProject(t, i);
}
const q = z();
function qe(e, t, i, o, n = {}) {
  const r = n.registry ?? q;
  if (n.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const s = A(e, t, r);
  return s ? r.resolveResult(s, {
    document: e,
    position: t,
    index: i,
    fs: o,
    ...n.cancellationToken ? { cancellationToken: n.cancellationToken } : {}
  }) : { items: [], isIncomplete: !1 };
}
function S(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function J(e, t) {
  const i = [];
  return e.documentation && i.push(e.documentation), e.package && i.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), i.join(`

`);
}
function j(e, t, i, o) {
  const n = [], r = i.getLoadedPackages(o);
  for (const s of W) {
    if (!s.name.startsWith(e)) continue;
    const a = !s.package || r.has(s.package), l = {
      label: `\\${s.name}`,
      kind: "command",
      insertText: s.snippet.slice(1),
      snippet: !0,
      sortText: `${a ? "0a" : "0b"}_${s.name}`,
      replaceLength: t
    };
    s.detail && (l.detail = s.detail);
    const c = J(s, a);
    c && (l.documentation = c), n.push(l);
  }
  for (const s of i.getCommandDefs(o))
    s.name.startsWith(e) && n.push({
      label: `\\${s.name}`,
      kind: "variable",
      insertText: s.name,
      detail: `User command (${s.location.file}:${s.location.line})`,
      sortText: `1_${s.name}`,
      replaceLength: t
    });
  return Q(n, e, t, i), n;
}
function Y(e, t) {
  return e === "macro" ? `Package macro${S(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function G(e, t) {
  let i = e;
  for (let o = 1; o <= t; o++) i += `{$${o}}`;
  return i;
}
function Q(e, t, i, o) {
  const n = new Set(e.map((r) => r.label.slice(1)));
  for (const [r, s] of o.getEngineCommands()) {
    if (!r.startsWith(t) || n.has(r)) continue;
    const a = s.argCount > 0;
    e.push({
      label: `\\${r}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: a ? G(r, s.argCount) : r,
      snippet: a,
      detail: Y(s.category, s.argCount),
      sortText: `2_${r}`,
      replaceLength: i
    });
  }
}
function Z(e, t, i, o) {
  const n = [];
  for (const r of i.getAllLabels(o)) {
    if (!r.name.startsWith(e)) continue;
    const s = i.resolveLabel(r.name), a = `${r.location.file}:${r.location.line}`;
    n.push({
      label: r.name,
      kind: "reference",
      insertText: r.name,
      detail: s ? `[${s}] ${a}` : a,
      replaceLength: t
    });
  }
  return n;
}
function ee(e, t, i, o) {
  const n = [], r = /* @__PURE__ */ new Set();
  for (const s of i.getAuxCitations())
    s.startsWith(e) && (r.add(s), n.push({
      label: s,
      kind: "reference",
      insertText: s,
      detail: "Citation",
      replaceLength: t
    }));
  for (const s of i.getBibEntries(o)) {
    if (r.has(s.key) || !s.key.startsWith(e)) continue;
    const a = [s.author, s.year].filter(Boolean).join(", ");
    n.push({
      label: s.key,
      kind: "reference",
      insertText: s.key,
      detail: a || (s.title ?? s.type),
      replaceLength: t
    });
  }
  return n;
}
function te(e, t, i, o, n) {
  const r = [], s = /* @__PURE__ */ new Set();
  for (const a of K) {
    if (!a.name.startsWith(e)) continue;
    s.add(a.name);
    const l = {
      label: a.name,
      kind: "module",
      insertText: a.name,
      replaceLength: t
    };
    a.detail && (l.detail = a.detail), o && (l.sortText = `0_${a.name}`), r.push(l);
  }
  for (const a of i.getAllEnvironments(n))
    !a.startsWith(e) || s.has(a) || (s.add(a), r.push({
      label: a,
      kind: "module",
      insertText: a,
      detail: "Used in project",
      sortText: `1_${a}`,
      replaceLength: t
    }));
  for (const a of i.getEnvironmentDefinitions(n)) {
    const l = r.find((u) => u.label === a.name);
    if (!l) continue;
    const c = `Project definition: ${a.location.file}:${a.location.line}`;
    l.documentation = [l.documentation, c].filter(Boolean).join(`

`), l.sortText = `0_${a.name}`;
  }
  return ne(r, e, t, s, i), r;
}
function ne(e, t, i, o, n) {
  const r = new Set(n.getEngineEnvironments());
  for (const s of E()) r.add(s);
  for (const s of r) {
    if (!s.startsWith(t) || o.has(s)) continue;
    const a = n.getEngineCommands().get(s)?.argCount ?? -1;
    e.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: `Package environment${S(a)}`,
      sortText: `2_${s}`,
      replaceLength: i
    });
  }
}
function ie(e, t, i, o) {
  const n = new Set(e.map((r) => r.insertText));
  for (const r of o)
    for (const s of r.environments) {
      if (!s.name.startsWith(t) || n.has(s.name)) continue;
      n.add(s.name);
      const a = {
        label: s.name,
        kind: "module",
        insertText: s.name,
        detail: `TeX Live ${r.texliveYear}: ${r.scope.name} environment`,
        sortText: `2_${s.name}`,
        replaceLength: i
      };
      s.doc && (a.documentation = s.doc), e.push(a);
    }
}
const oe = {
  counter: [
    "page",
    "part",
    "chapter",
    "section",
    "subsection",
    "subsubsection",
    "paragraph",
    "subparagraph",
    "figure",
    "table",
    "equation",
    "footnote",
    "mpfootnote",
    "enumi",
    "enumii",
    "enumiii",
    "enumiv"
  ],
  length: [
    "\\textwidth",
    "\\textheight",
    "\\linewidth",
    "\\columnwidth",
    "\\paperwidth",
    "\\paperheight",
    "\\parindent",
    "\\parskip",
    "\\baselineskip",
    "\\topmargin",
    "\\oddsidemargin",
    "\\evensidemargin"
  ]
};
function re(e) {
  return e.map(
    (t) => `${t.role}: ${t.location.file}:${t.location.line}` + (t.target ? ` (alias ${t.target})` : "")
  );
}
function se(e, t) {
  const i = e.index.getProjectValues(t, e.document.path);
  return t === "glossary" ? [...i, ...e.index.getProjectValues("acronym", e.document.path)] : i;
}
function d(e, t, i) {
  const o = /* @__PURE__ */ new Map();
  for (const r of se(t, i)) {
    const s = o.get(r.name) ?? [];
    s.push(r), o.set(r.name, s);
  }
  return [.../* @__PURE__ */ new Set([...oe[i] ?? [], ...o.keys()])].filter((r) => r.startsWith(e.prefix)).sort().map((r) => {
    const s = o.get(r) ?? [], a = re(s);
    return {
      label: r,
      kind: i === "font-family" ? "text" : "variable",
      insertText: r,
      detail: a[0] ?? (i === "counter" || i === "length" ? "LaTeX kernel value" : i),
      ...a.length > 0 ? { documentation: a.join(`

`) } : {},
      sortText: `${s.length > 0 ? "0" : "1"}_${r}`,
      replaceLength: e.prefix.length
    };
  });
}
function ae(e, t) {
  const i = /* @__PURE__ */ new Map();
  for (const o of t.index.getProjectKeys(t.document.path)) {
    const n = i.get(o.family) ?? [];
    n.push(o), i.set(o.family, n);
  }
  return [...i].filter(([o]) => o.startsWith(e.prefix)).sort(([o], [n]) => o.localeCompare(n)).map(([o, n]) => ({
    label: o,
    kind: "module",
    insertText: o,
    detail: `Project key family · ${n[0].location.file}:${n[0].location.line}`,
    documentation: `${n.length} statically recovered key(s)`,
    replaceLength: e.prefix.length
  }));
}
function le(e) {
  if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
    const i = e.keyFamily === "class-options" ? "class" : "package";
    return (e.selector?.values ?? []).map((o) => o.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((o) => `${i}/${o}`);
  }
  const t = e.keyFamily?.split("/")[0]?.trim();
  return t ? [`package/${t}`] : [];
}
function ce(e, t) {
  return e.keyFamily ? t.flatMap((i) => {
    const o = i.keyFamilies.find((n) => n.name === e.keyFamily);
    return o ? [{ shard: i, keys: o.keys }] : [];
  }) : [];
}
function ue(e, t) {
  const i = e.provenance.map(
    (o) => `${o.evidence}: \`${o.sourcePath}\`${o.line ? `:${o.line}` : ""}`
  ).join(`

`);
  return [
    e.documentation,
    `Scopes: ${t.map((o) => `\`${o}\``).join(", ")}`,
    `Confidence: ${e.confidence}`,
    i
  ].filter(Boolean).join(`

`);
}
function fe(e) {
  return e.value.type === "flag" ? { insertText: e.name } : { insertText: `${e.name}=\${1}`, snippet: !0 };
}
function me(e, t) {
  const i = /* @__PURE__ */ new Map();
  for (const { shard: o, keys: n } of t)
    for (const r of n) {
      const s = i.get(r.name);
      s ? (s.scopes.push(o.scope.id), s.key.repeatable &&= r.repeatable) : i.set(r.name, { key: { ...r }, scopes: [o.scope.id] });
    }
  return [...i.values()].filter(
    ({ key: o }) => o.name.startsWith(e.prefix) && (o.repeatable || !e.usedKeys.includes(o.name))
  ).map(({ key: o, scopes: n }) => ({
    label: o.name,
    kind: "keyword",
    ...fe(o),
    detail: `${o.value.type} key · ${n.join(", ")}`,
    documentation: ue(o, n),
    sortText: `0_${o.name}`,
    replaceLength: e.prefix.length
  }));
}
function pe(e) {
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
function de(e, t) {
  return [...new Set(
    t.flatMap((o) => o.value.type === "enum" ? o.value.values ?? [] : [])
  )].filter((o) => o.startsWith(e.prefix)).sort().map((o) => ({
    label: o,
    kind: "keyword",
    insertText: o,
    replaceLength: e.prefix.length
  }));
}
function ge(e, t) {
  const i = e.prefix.startsWith("\\"), o = i ? e.prefix.slice(1) : e.prefix;
  return j(o, o.length, t.index, t.document.path).map(
    (n) => ({
      ...n,
      insertText: i ? `\\${n.insertText}` : n.insertText,
      replaceLength: e.prefix.length
    })
  );
}
function he(e, t, i, o) {
  if (o.some((r) => r.value.type === "enum"))
    return { items: de(e, o), isIncomplete: !1 };
  if (o.some((r) => r.value.type === "command"))
    return { items: ge(e, t), isIncomplete: !1 };
  const n = o.map((r) => pe(r.value.type)).find(Boolean);
  return n ? i.resolveResult({ ...e, domain: n, valueKind: n }, t) : { items: [], isIncomplete: !1 };
}
function ye(e) {
  const t = new Set(
    (e.keyFamilySelector?.values ?? []).map(
      (i) => i.trim().replace(/^\/+|\/+$/g, "")
    )
  );
  e.keyFamily && t.add(e.keyFamily.replace(/^\/+|\/+$/g, ""));
  for (const i of e.usedKeys)
    i.endsWith("/.cd") && t.add(i.slice(0, -4).replace(/^\/+|\/+$/g, ""));
  return t;
}
function $e(e, t) {
  const i = ye(e);
  return t.index.getProjectKeys(
    t.document.path,
    i.size > 0 ? i : void 0
  );
}
function ke(e, t) {
  const i = /* @__PURE__ */ new Map();
  for (const o of t) {
    const n = i.get(o.name) ?? [];
    n.push(o), i.set(o.name, n);
  }
  return [...i].filter(([o]) => o.startsWith(e.prefix) && !e.usedKeys.includes(o)).sort(([o], [n]) => o.localeCompare(n)).map(([o, n]) => {
    const r = n.at(-1), s = r.valueType !== "flag";
    return {
      label: o,
      kind: "keyword",
      insertText: s ? `${o}=\${1}` : o,
      ...s ? { snippet: !0 } : {},
      detail: `${r.valueType} key · project/${r.family}`,
      documentation: n.map((a) => `${a.location.file}:${a.location.line}`).join(`

`),
      sortText: `00_${o}`,
      replaceLength: e.prefix.length
    };
  });
}
function be(e) {
  return {
    boolean: "boolean",
    color: "color",
    file: "project-file",
    command: "command"
  }[e.valueType] ?? null;
}
function ve(e, t, i, o) {
  const n = o.at(-1);
  if (!n) return { items: [], isIncomplete: !1 };
  const r = new Set(n.valueType === "enum" ? n.values ?? [] : []);
  if (r.size > 0)
    return {
      items: [...r].filter((a) => a.startsWith(e.prefix)).sort().map((a) => ({
        label: a,
        kind: "keyword",
        insertText: a,
        detail: `Project enum value for ${e.key}`,
        replaceLength: e.prefix.length
      })),
      isIncomplete: !1
    };
  const s = be(n);
  return s ? i.resolveResult({ ...e, domain: s, valueKind: s }, t) : { items: [], isIncomplete: !1 };
}
function b(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((i) => t.has(i.insertText) ? !1 : (t.add(i.insertText), !0));
}
function Ce(e, t, i, o) {
  const n = i?.syncScopes(
    le(e),
    t.cancellationToken
  ) ?? {
    shards: [],
    isIncomplete: !1
  }, r = ce(e, n.shards), s = $e(e, t);
  if (e.keyValuePosition !== "value")
    return {
      items: b([
        ...ke(e, s),
        ...me(e, r)
      ]),
      isIncomplete: n.isIncomplete
    };
  if (!e.key) return { items: [], isIncomplete: n.isIncomplete };
  const a = r.flatMap((u) => u.keys.filter((p) => p.name === e.key)), l = he(e, t, o, a), c = ve(
    e,
    t,
    o,
    s.filter((u) => u.name === e.key)
  );
  return {
    items: b([...c.items, ...l.items]),
    isIncomplete: n.isIncomplete || l.isIncomplete || c.isIncomplete
  };
}
const Te = {
  "tex-class": /* @__PURE__ */ new Set(["cls"]),
  "tex-package": /* @__PURE__ */ new Set(["sty"]),
  "bib-style": /* @__PURE__ */ new Set(["bst"]),
  "biblatex-style": /* @__PURE__ */ new Set(["bbx", "cbx", "lbx"]),
  "font-file": /* @__PURE__ */ new Set(["otf", "ttf", "ttc"])
};
function Re(e, t) {
  const i = e.lastIndexOf(".");
  return i < 0 || !Te[t].has(e.slice(i + 1).toLowerCase()) ? null : e.slice(0, i);
}
function Ee(e, t, i, o) {
  return o.listFiles().map((n) => ({ path: n, name: Re(n, i) })).filter(
    (n) => n.name?.startsWith(e) === !0
  ).map(({ path: n, name: r }) => ({
    label: r,
    kind: i === "font-file" ? "file" : "module",
    insertText: r,
    detail: `Project resource: ${n}`,
    sortText: `0_${r}`,
    replaceLength: t
  }));
}
function xe(e, t, i, o) {
  const n = o === "font-file" ? e.fileName : e.name;
  if (!n.startsWith(t)) return null;
  const r = {
    label: n,
    kind: o === "font-file" ? "file" : "module",
    insertText: n,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${n}`,
    replaceLength: i
  };
  return e.documentationUrl && (r.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), r;
}
function g(e, t) {
  return (i, o) => {
    const n = Ee(i.prefix, i.prefix.length, e, o.fs);
    if (!t) return n;
    const r = t.getState(e);
    if ((r.status === "idle" || r.status === "error") && t.load(e, o.cancellationToken), r.status !== "ready")
      return {
        items: n,
        isIncomplete: r.status !== "mismatch"
      };
    const s = r.shard.resources.map((a) => xe(a, i.prefix, i.prefix.length, e)).filter((a) => a !== null);
    return { items: w([...n, ...s]), isIncomplete: !1 };
  };
}
function w(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((i) => t.has(i.insertText) ? !1 : (t.add(i.insertText), !0));
}
const Se = /\\(?:begin|end)\{(\w+\*?)\}/g, je = new RegExp(`\\\\(?:${C})\\{([^}]+)\\}`, "g"), we = new RegExp(`\\\\(?:${T})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), Le = new RegExp(R, "g");
function f(e, t, i) {
  for (const o of e.matchAll(t))
    if (i >= o.index && i < o.index + o[0].length) return o;
  return null;
}
function Ie(e, t, i) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + i + 1 };
}
function Je(e, t, i) {
  const o = e.lineAt(t.line), n = t.column - 1, r = f(o, Se, n);
  if (r) return { contents: _e(r[1], i), range: y(t.line, r) };
  const s = f(o, je, n);
  if (s) {
    const c = h(s, n) ?? s[1].trim();
    return { contents: Pe(c, i), range: y(t.line, s) };
  }
  const a = f(o, we, n);
  if (a) return { contents: Me(a[1], i), range: y(t.line, a) };
  const l = f(o, Le, n);
  if (l) {
    const c = De(l[1], i);
    return c ? { contents: c, range: y(t.line, l) } : null;
  }
  return null;
}
function y(e, t) {
  return Ie(e, t.index, t[0].length);
}
function _e(e, t) {
  const i = B(e);
  if (i) {
    const o = [`**${e}** environment`];
    return i.detail && o.push(i.detail), i.package && o.push(`Package: \`${i.package}\``), $(o, t.getEngineCommands().get(e)), o;
  }
  if (t.getEngineEnvironments().has(e) || E().has(e)) {
    const o = [`**${e}** — Package environment`];
    return $(o, t.getEngineCommands().get(e)), o;
  }
  return [`**${e}** environment`];
}
function Pe(e, t) {
  const i = t.resolveLabel(e), o = t.findLabelDef(e), n = [i ? `**\\ref{${e}}** = ${i}` : `**\\ref{${e}}**`];
  return o && n.push(`Defined at ${o.location.file}:${o.location.line}`), n;
}
function Me(e, t) {
  const i = [];
  for (const o of e.split(",")) {
    const n = o.trim(), r = t.findBibEntry(n);
    if (r) {
      const s = M(r);
      i.push(`**[${n}]** ${r.type}${s ? `

${s}` : ""}`);
    } else
      i.push(`**[${n}]**`);
  }
  return i;
}
function De(e, t) {
  const i = O(e);
  if (i) {
    const r = [`**\\${e}**${i.detail ? ` — ${i.detail}` : ""}`], s = N(i.snippet);
    return s.length && r.push(`\`${U(e, s)}\``), i.documentation && r.push(i.documentation), i.package && r.push(`Package: \`${i.package}\``), $(r, t.getEngineCommands().get(e)), r;
  }
  const o = t.findCommandDef(e);
  if (o)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${o.location.file}:${o.location.line}`
    ];
  const n = t.getEngineCommands().get(e);
  if (n) {
    const r = [`**\\${e}** — ${Ae(n.category)}`];
    return $(r, n), r;
  }
  return null;
}
function Ae(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function $(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const L = new RegExp(`\\\\(?:${C})\\{([^}]+)\\}`, "g"), I = new RegExp(`\\\\(?:${T})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), _ = new RegExp(R, "g");
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
function h(e, t) {
  const i = e[1];
  let o = e.index + e[0].lastIndexOf("{") + 1;
  for (const n of i.split(",")) {
    if (t >= o && t <= o + n.length) return n.trim() || null;
    o += n.length + 1;
  }
  return i.split(",")[0]?.trim() || null;
}
function Ye(e, t, i) {
  const o = e.lineAt(t.line), n = t.column - 1, r = f(o, L, n);
  if (r) {
    const l = h(r, n), c = l ? i.findLabelDef(l) : null;
    return c ? m(c.location.file, c.location) : null;
  }
  const s = f(o, I, n);
  if (s) {
    const l = h(s, n);
    if (!l) return null;
    const c = i.findBibEntry(l);
    if (c) return m(c.location.file, c.location);
    const u = i.findBibitemDef(l);
    return u ? m(u.location.file, u.location) : null;
  }
  const a = f(o, _, n);
  if (a) {
    const l = i.findCommandDef(a[1]);
    return l ? m(l.location.file, l.location) : null;
  }
  return null;
}
function Ge(e, t, i) {
  const o = e.lineAt(t.line), n = t.column - 1, r = f(o, /\\label\{([^}]+)\}/g, n);
  if (r)
    return i.getAllLabelRefs(r[1].trim()).map((c) => m(c.location.file, c.location));
  const s = f(o, L, n);
  if (s) {
    const c = h(s, n);
    if (!c) return [];
    const u = [], p = i.findLabelDef(c);
    p && u.push(m(p.location.file, p.location));
    for (const k of i.getAllLabelRefs(c)) u.push(m(k.location.file, k.location));
    return u;
  }
  const a = f(o, I, n);
  if (a) {
    const c = h(a, n);
    return c ? v(i.findAllOccurrences(c, "citation")) : [];
  }
  const l = f(o, _, n);
  return l && i.findCommandDef(l[1]) ? v(i.findAllOccurrences(l[1], "command")) : [];
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
  z as createDefaultCompletionRegistry,
  ze as preloadSemanticCatalog,
  qe as provideCompletionResult,
  Ye as provideDefinition,
  Je as provideHover,
  Ge as provideReferences
};
