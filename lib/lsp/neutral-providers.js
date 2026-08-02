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
  syncProject(t, i, r) {
    return this.syncScopes(
      [
        ...[...t.getLoadedPackages(r)].map((n) => `package/${n}`),
        ...[...t.getLoadedClasses(r)].map((n) => `class/${n}`)
      ],
      i
    );
  }
  syncScopes(t, i) {
    const r = [];
    let n = !1;
    const o = [...new Set(t)], s = /* @__PURE__ */ new Set();
    for (; o.length > 0; ) {
      const a = o.shift();
      if (s.has(a)) continue;
      s.add(a);
      const l = this.provider.getState(a);
      if (l.status === "ready") {
        this.register(l.shard), r.push(l.shard);
        for (const c of l.shard.dependencies)
          o.push(`package/${c}`);
      } else (l.status === "idle" || l.status === "loading" || l.status === "error") && (n = !0, l.status !== "loading" && this.provider.load(a, i).then((c) => {
        c.status === "ready" && this.register(c.shard);
      }));
    }
    return { shards: r, isIncomplete: n };
  }
  register(t) {
    this.registeredScopes.has(t.scope.id) || (X(this.registry, t), this.registeredScopes.add(t.scope.id));
  }
}
const x = /* @__PURE__ */ new WeakMap();
function z(e = {}) {
  const t = new F(), i = e.semanticCatalog ? new H(e.semanticCatalog, t) : void 0;
  i && x.set(t, i), P(t), t.registerResolver("command", (n, o) => {
    const s = i?.syncProject(
      o.index,
      o.cancellationToken,
      o.document.path
    );
    return {
      items: j(n.prefix, n.prefix.length, o.index, o.document.path),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "label",
    (n, o) => Z(n.prefix, n.prefix.length, o.index, o.document.path)
  ), t.registerResolver(
    "citation",
    (n, o) => ee(n.prefix, n.prefix.length, o.index, o.document.path)
  ), t.registerResolver("environment", (n, o) => {
    const s = i?.syncProject(
      o.index,
      o.cancellationToken,
      o.document.path
    ), a = te(
      n.prefix,
      n.prefix.length,
      o.index,
      n.type === "argument" && n.command === "begin",
      o.document.path
    );
    return ie(a, n.prefix, n.prefix.length, s?.shards ?? []), { items: a, isIncomplete: s?.isIncomplete ?? !1 };
  }), t.registerResolver("tex-class", g("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", g("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", g("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    g("biblatex-style", e.resourceCatalog)
  );
  const r = g("font-file", e.resourceCatalog);
  t.registerResolver("font-family", (n, o) => {
    const s = d(n, o, "font-family"), a = r(n, o), l = Array.isArray(a) ? { items: a, isIncomplete: !1 } : a;
    return {
      items: w([...s, ...l.items]),
      isIncomplete: l.isIncomplete
    };
  }), t.registerResolver(
    "boolean",
    (n) => ["true", "false"].filter((o) => o.startsWith(n.prefix)).map((o) => ({
      label: o,
      kind: "keyword",
      insertText: o,
      replaceLength: n.prefix.length
    }))
  ), t.registerResolver("color", (n, o) => {
    if (n.type !== "argument") return [];
    if (n.argumentIndex > 0 && (n.command === "color" || n.command === "textcolor" || n.command === "colorbox"))
      return [];
    const s = i?.syncProject(
      o.index,
      o.cancellationToken,
      o.document.path
    );
    return {
      items: D(o, s?.shards ?? []),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "counter",
    (n, o) => d(n, o, "counter")
  ), t.registerResolver(
    "length",
    (n, o) => d(n, o, "length")
  ), t.registerResolver(
    "glossary-key",
    (n, o) => d(n, o, "glossary")
  ), t.registerResolver(
    "acronym-key",
    (n, o) => d(n, o, "acronym")
  ), t.registerResolver(
    "key-family",
    (n, o) => ae(n, o)
  ), t.registerResolver(
    "key-value",
    (n, o) => n.type === "argument" ? Ce(n, o, i, t) : []
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
      (o, s) => V(n, o.prefix, s.document.path, s.fs)
    );
  return t;
}
function ze(e, t, i) {
  x.get(e)?.syncProject(t, i);
}
const q = z();
function qe(e, t, i, r, n = {}) {
  const o = n.registry ?? q;
  if (n.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const s = A(e, t, o);
  return s ? o.resolveResult(s, {
    document: e,
    position: t,
    index: i,
    fs: r,
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
function j(e, t, i, r) {
  const n = [], o = i.getLoadedPackages(r);
  for (const s of W) {
    if (!s.name.startsWith(e)) continue;
    const a = !s.package || o.has(s.package), l = {
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
  for (const s of i.getCommandDefs(r))
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
  for (let r = 1; r <= t; r++) i += `{$${r}}`;
  return i;
}
function Q(e, t, i, r) {
  const n = new Set(e.map((o) => o.label.slice(1)));
  for (const [o, s] of r.getEngineCommands()) {
    if (!o.startsWith(t) || n.has(o)) continue;
    const a = s.argCount > 0;
    e.push({
      label: `\\${o}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: a ? G(o, s.argCount) : o,
      snippet: a,
      detail: Y(s.category, s.argCount),
      sortText: `2_${o}`,
      replaceLength: i
    });
  }
}
function Z(e, t, i, r) {
  const n = [];
  for (const o of i.getAllLabels(r)) {
    if (!o.name.startsWith(e)) continue;
    const s = i.resolveLabel(o.name), a = `${o.location.file}:${o.location.line}`;
    n.push({
      label: o.name,
      kind: "reference",
      insertText: o.name,
      detail: s ? `[${s}] ${a}` : a,
      replaceLength: t
    });
  }
  return n;
}
function ee(e, t, i, r) {
  const n = [], o = /* @__PURE__ */ new Set();
  for (const s of i.getAuxCitations())
    s.startsWith(e) && (o.add(s), n.push({
      label: s,
      kind: "reference",
      insertText: s,
      detail: "Citation",
      replaceLength: t
    }));
  for (const s of i.getBibEntries(r)) {
    if (o.has(s.key) || !s.key.startsWith(e)) continue;
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
function te(e, t, i, r, n) {
  const o = [], s = /* @__PURE__ */ new Set();
  for (const a of K) {
    if (!a.name.startsWith(e)) continue;
    s.add(a.name);
    const l = {
      label: a.name,
      kind: "module",
      insertText: a.name,
      replaceLength: t
    };
    a.detail && (l.detail = a.detail), r && (l.sortText = `0_${a.name}`), o.push(l);
  }
  for (const a of i.getAllEnvironments(n))
    !a.startsWith(e) || s.has(a) || (s.add(a), o.push({
      label: a,
      kind: "module",
      insertText: a,
      detail: "Used in project",
      sortText: `1_${a}`,
      replaceLength: t
    }));
  for (const a of i.getEnvironmentDefinitions(n)) {
    const l = o.find((u) => u.label === a.name);
    if (!l) continue;
    const c = `Project definition: ${a.location.file}:${a.location.line}`;
    l.documentation = [l.documentation, c].filter(Boolean).join(`

`), l.sortText = `0_${a.name}`;
  }
  return ne(o, e, t, s, i), o;
}
function ne(e, t, i, r, n) {
  const o = new Set(n.getEngineEnvironments());
  for (const s of E()) o.add(s);
  for (const s of o) {
    if (!s.startsWith(t) || r.has(s)) continue;
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
function ie(e, t, i, r) {
  const n = new Set(e.map((o) => o.insertText));
  for (const o of r)
    for (const s of o.environments) {
      if (!s.name.startsWith(t) || n.has(s.name)) continue;
      n.add(s.name);
      const a = {
        label: s.name,
        kind: "module",
        insertText: s.name,
        detail: `TeX Live ${o.texliveYear}: ${o.scope.name} environment`,
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
  const r = /* @__PURE__ */ new Map();
  for (const o of se(t, i)) {
    const s = r.get(o.name) ?? [];
    s.push(o), r.set(o.name, s);
  }
  return [.../* @__PURE__ */ new Set([...oe[i] ?? [], ...r.keys()])].filter((o) => o.startsWith(e.prefix)).sort().map((o) => {
    const s = r.get(o) ?? [], a = re(s);
    return {
      label: o,
      kind: i === "font-family" ? "text" : "variable",
      insertText: o,
      detail: a[0] ?? (i === "counter" || i === "length" ? "LaTeX kernel value" : i),
      ...a.length > 0 ? { documentation: a.join(`

`) } : {},
      sortText: `${s.length > 0 ? "0" : "1"}_${o}`,
      replaceLength: e.prefix.length
    };
  });
}
function ae(e, t) {
  const i = /* @__PURE__ */ new Map();
  for (const r of t.index.getProjectKeys(t.document.path)) {
    const n = i.get(r.family) ?? [];
    n.push(r), i.set(r.family, n);
  }
  return [...i].filter(([r]) => r.startsWith(e.prefix)).sort(([r], [n]) => r.localeCompare(n)).map(([r, n]) => ({
    label: r,
    kind: "module",
    insertText: r,
    detail: `Project key family · ${n[0].location.file}:${n[0].location.line}`,
    documentation: `${n.length} statically recovered key(s)`,
    replaceLength: e.prefix.length
  }));
}
function le(e) {
  if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
    const i = e.keyFamily === "class-options" ? "class" : "package";
    return (e.selector?.values ?? []).map((r) => r.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((r) => `${i}/${r}`);
  }
  const t = e.keyFamily?.split("/")[0]?.trim();
  return t ? [`package/${t}`] : [];
}
function ce(e, t) {
  return e.keyFamily ? t.flatMap((i) => {
    const r = i.keyFamilies.find((n) => n.name === e.keyFamily);
    return r ? [{ shard: i, keys: r.keys }] : [];
  }) : [];
}
function ue(e, t) {
  const i = e.provenance.map(
    (r) => `${r.evidence}: \`${r.sourcePath}\`${r.line ? `:${r.line}` : ""}`
  ).join(`

`);
  return [
    e.documentation,
    `Scopes: ${t.map((r) => `\`${r}\``).join(", ")}`,
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
  for (const { shard: r, keys: n } of t)
    for (const o of n) {
      const s = i.get(o.name);
      s ? (s.scopes.push(r.scope.id), s.key.repeatable &&= o.repeatable) : i.set(o.name, { key: { ...o }, scopes: [r.scope.id] });
    }
  return [...i.values()].filter(
    ({ key: r }) => r.name.startsWith(e.prefix) && (r.repeatable || !e.usedKeys.includes(r.name))
  ).map(({ key: r, scopes: n }) => ({
    label: r.name,
    kind: "keyword",
    ...fe(r),
    detail: `${r.value.type} key · ${n.join(", ")}`,
    documentation: ue(r, n),
    sortText: `0_${r.name}`,
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
    t.flatMap((r) => r.value.type === "enum" ? r.value.values ?? [] : [])
  )].filter((r) => r.startsWith(e.prefix)).sort().map((r) => ({
    label: r,
    kind: "keyword",
    insertText: r,
    replaceLength: e.prefix.length
  }));
}
function ge(e, t) {
  const i = e.prefix.startsWith("\\"), r = i ? e.prefix.slice(1) : e.prefix;
  return j(r, r.length, t.index, t.document.path).map(
    (n) => ({
      ...n,
      insertText: i ? `\\${n.insertText}` : n.insertText,
      replaceLength: e.prefix.length
    })
  );
}
function he(e, t, i, r) {
  if (r.some((o) => o.value.type === "enum"))
    return { items: de(e, r), isIncomplete: !1 };
  if (r.some((o) => o.value.type === "command"))
    return { items: ge(e, t), isIncomplete: !1 };
  const n = r.map((o) => pe(o.value.type)).find(Boolean);
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
  for (const r of t) {
    const n = i.get(r.name) ?? [];
    n.push(r), i.set(r.name, n);
  }
  return [...i].filter(([r]) => r.startsWith(e.prefix) && !e.usedKeys.includes(r)).sort(([r], [n]) => r.localeCompare(n)).map(([r, n]) => {
    const o = n.at(-1), s = o.valueType !== "flag";
    return {
      label: r,
      kind: "keyword",
      insertText: s ? `${r}=\${1}` : r,
      ...s ? { snippet: !0 } : {},
      detail: `${o.valueType} key · ${o.provenance === "runtime-observed" ? "runtime-observed" : "project"}/${o.family}`,
      documentation: n.map((a) => `${a.location.file}:${a.location.line}`).join(`

`),
      sortText: `00_${r}`,
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
function ve(e, t, i, r) {
  const n = r.at(-1);
  if (!n) return { items: [], isIncomplete: !1 };
  const o = new Set(n.valueType === "enum" ? n.values ?? [] : []);
  if (o.size > 0)
    return {
      items: [...o].filter((a) => a.startsWith(e.prefix)).sort().map((a) => ({
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
function Ce(e, t, i, r) {
  const n = i?.syncScopes(
    le(e),
    t.cancellationToken
  ) ?? {
    shards: [],
    isIncomplete: !1
  }, o = ce(e, n.shards), s = $e(e, t);
  if (e.keyValuePosition !== "value")
    return {
      items: b([
        ...ke(e, s),
        ...me(e, o)
      ]),
      isIncomplete: n.isIncomplete
    };
  if (!e.key) return { items: [], isIncomplete: n.isIncomplete };
  const a = o.flatMap((u) => u.keys.filter((p) => p.name === e.key)), l = he(e, t, r, a), c = ve(
    e,
    t,
    r,
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
function Ee(e, t, i, r) {
  return r.listFiles().map((n) => ({ path: n, name: Re(n, i) })).filter(
    (n) => n.name?.startsWith(e) === !0
  ).map(({ path: n, name: o }) => ({
    label: o,
    kind: i === "font-file" ? "file" : "module",
    insertText: o,
    detail: `Project resource: ${n}`,
    sortText: `0_${o}`,
    replaceLength: t
  }));
}
function xe(e, t, i, r) {
  const n = r === "font-file" ? e.fileName : e.name;
  if (!n.startsWith(t)) return null;
  const o = {
    label: n,
    kind: r === "font-file" ? "file" : "module",
    insertText: n,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${n}`,
    replaceLength: i
  };
  return e.documentationUrl && (o.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), o;
}
function g(e, t) {
  return (i, r) => {
    const n = Ee(i.prefix, i.prefix.length, e, r.fs);
    if (!t) return n;
    const o = t.getState(e);
    if ((o.status === "idle" || o.status === "error") && t.load(e, r.cancellationToken), o.status !== "ready")
      return {
        items: n,
        isIncomplete: o.status !== "mismatch"
      };
    const s = o.shard.resources.map((a) => xe(a, i.prefix, i.prefix.length, e)).filter((a) => a !== null);
    return { items: w([...n, ...s]), isIncomplete: !1 };
  };
}
function w(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((i) => t.has(i.insertText) ? !1 : (t.add(i.insertText), !0));
}
const Se = /\\(?:begin|end)\{(\w+\*?)\}/g, je = new RegExp(`\\\\(?:${C})\\{([^}]+)\\}`, "g"), we = new RegExp(`\\\\(?:${T})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), Le = new RegExp(R, "g");
function f(e, t, i) {
  for (const r of e.matchAll(t))
    if (i >= r.index && i < r.index + r[0].length) return r;
  return null;
}
function Ie(e, t, i) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + i + 1 };
}
function Je(e, t, i) {
  const r = e.lineAt(t.line), n = t.column - 1, o = f(r, Se, n);
  if (o) return { contents: _e(o[1], i), range: y(t.line, o) };
  const s = f(r, je, n);
  if (s) {
    const c = h(s, n) ?? s[1].trim();
    return { contents: Pe(c, i), range: y(t.line, s) };
  }
  const a = f(r, we, n);
  if (a) return { contents: Me(a[1], i), range: y(t.line, a) };
  const l = f(r, Le, n);
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
    const r = [`**${e}** environment`];
    return i.detail && r.push(i.detail), i.package && r.push(`Package: \`${i.package}\``), $(r, t.getEngineCommands().get(e)), r;
  }
  if (t.getEngineEnvironments().has(e) || E().has(e)) {
    const r = [`**${e}** — Package environment`];
    return $(r, t.getEngineCommands().get(e)), r;
  }
  return [`**${e}** environment`];
}
function Pe(e, t) {
  const i = t.resolveLabel(e), r = t.findLabelDef(e), n = [i ? `**\\ref{${e}}** = ${i}` : `**\\ref{${e}}**`];
  return r && n.push(`Defined at ${r.location.file}:${r.location.line}`), n;
}
function Me(e, t) {
  const i = [];
  for (const r of e.split(",")) {
    const n = r.trim(), o = t.findBibEntry(n);
    if (o) {
      const s = M(o);
      i.push(`**[${n}]** ${o.type}${s ? `

${s}` : ""}`);
    } else
      i.push(`**[${n}]**`);
  }
  return i;
}
function De(e, t) {
  const i = O(e);
  if (i) {
    const o = [`**\\${e}**${i.detail ? ` — ${i.detail}` : ""}`], s = N(i.snippet);
    return s.length && o.push(`\`${U(e, s)}\``), i.documentation && o.push(i.documentation), i.package && o.push(`Package: \`${i.package}\``), $(o, t.getEngineCommands().get(e)), o;
  }
  const r = t.findCommandDef(e);
  if (r)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${r.location.file}:${r.location.line}`
    ];
  const n = t.getEngineCommands().get(e);
  if (n) {
    const o = [`**\\${e}** — ${Ae(n.category)}`];
    return $(o, n), o;
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
  let r = e.index + e[0].lastIndexOf("{") + 1;
  for (const n of i.split(",")) {
    if (t >= r && t <= r + n.length) return n.trim() || null;
    r += n.length + 1;
  }
  return i.split(",")[0]?.trim() || null;
}
function Ye(e, t, i) {
  const r = e.lineAt(t.line), n = t.column - 1, o = f(r, L, n);
  if (o) {
    const l = h(o, n), c = l ? i.findLabelDef(l) : null;
    return c ? m(c.location.file, c.location) : null;
  }
  const s = f(r, I, n);
  if (s) {
    const l = h(s, n);
    if (!l) return null;
    const c = i.findBibEntry(l);
    if (c) return m(c.location.file, c.location);
    const u = i.findBibitemDef(l);
    return u ? m(u.location.file, u.location) : null;
  }
  const a = f(r, _, n);
  if (a) {
    const l = i.findCommandDef(a[1]);
    return l ? m(l.location.file, l.location) : null;
  }
  return null;
}
function Ge(e, t, i) {
  const r = e.lineAt(t.line), n = t.column - 1, o = f(r, /\\label\{([^}]+)\}/g, n);
  if (o)
    return i.getAllLabelRefs(o[1].trim()).map((c) => m(c.location.file, c.location));
  const s = f(r, L, n);
  if (s) {
    const c = h(s, n);
    if (!c) return [];
    const u = [], p = i.findLabelDef(c);
    p && u.push(m(p.location.file, p.location));
    for (const k of i.getAllLabelRefs(c)) u.push(m(k.location.file, k.location));
    return u;
  }
  const a = f(r, I, n);
  if (a) {
    const c = h(a, n);
    return c ? v(i.findAllOccurrences(c, "citation")) : [];
  }
  const l = f(r, _, n);
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
