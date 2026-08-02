import { registerBibCompletionResolvers as M } from "./bib-completion.js";
import { formatReference as D } from "./bib-parser.js";
import { completeColors as A } from "./color-completion.js";
import { analyzeCompletionContext as F } from "./completion-context.js";
import { CompletionResolverRegistry as V } from "./completion-registry.js";
import { completeProjectFiles as W } from "./file-completion.js";
import { LATEX_COMMANDS as U, LATEX_ENVIRONMENTS as K, getEnvironmentByName as B, getCommandByName as O } from "./latex-commands.js";
import { REF_CMDS as v, CITE_CMDS as R, COMMAND_TOKEN as E } from "./latex-patterns.js";
import { getShardEnvironments as w, parseSignature as N, formatSignature as X } from "./package-db.js";
import { registerTexSemanticShard as q } from "./semantic-catalog.js";
class z {
  constructor(t, o) {
    this.provider = t, this.registry = o;
  }
  registeredScopes = /* @__PURE__ */ new Set();
  syncProject(t, o, r, n) {
    return this.syncScopes(
      [
        ...[...t.getLoadedPackages(r)].map((i) => `package/${i}`),
        ...[...t.getLoadedClasses(r)].map((i) => `class/${i}`)
      ],
      o,
      n
    );
  }
  syncScopes(t, o, r) {
    const n = [];
    let i = !1;
    const s = [...new Set(t)], a = /* @__PURE__ */ new Set();
    for (; s.length > 0; ) {
      const l = s.shift();
      if (a.has(l)) continue;
      a.add(l);
      const c = this.provider.getState(l);
      if (c.status === "ready") {
        this.register(c.shard), n.push(c.shard);
        for (const u of c.shard.dependencies)
          s.push(`package/${u}`);
      } else if (c.status === "idle" || c.status === "loading" || c.status === "error") {
        i = !0;
        const u = this.provider.load(l, o).then((m) => {
          m.status === "ready" && this.register(m.shard);
        });
        r?.(u);
      }
    }
    return { shards: n, isIncomplete: i };
  }
  register(t) {
    this.registeredScopes.has(t.scope.id) || (q(this.registry, t), this.registeredScopes.add(t.scope.id));
  }
}
const S = /* @__PURE__ */ new WeakMap();
function H(e = {}) {
  const t = new V(), o = e.semanticCatalog ? new z(e.semanticCatalog, t) : void 0;
  o && S.set(t, o), M(t), t.registerResolver("command", (n, i) => {
    const s = o?.syncProject(
      i.index,
      i.cancellationToken,
      i.document.path,
      i.waitUntil
    );
    return {
      items: j(n.prefix, n.prefix.length, i.index, i.document.path),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "label",
    (n, i) => ee(n.prefix, n.prefix.length, i.index, i.document.path)
  ), t.registerResolver(
    "citation",
    (n, i) => te(n.prefix, n.prefix.length, i.index, i.document.path)
  ), t.registerResolver("environment", (n, i) => {
    const s = o?.syncProject(
      i.index,
      i.cancellationToken,
      i.document.path,
      i.waitUntil
    ), a = ne(
      n.prefix,
      n.prefix.length,
      i.index,
      n.type === "argument" && n.command === "begin",
      i.document.path
    );
    return oe(a, n.prefix, n.prefix.length, s?.shards ?? []), { items: a, isIncomplete: s?.isIncomplete ?? !1 };
  }), t.registerResolver("tex-class", g("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", g("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", g("bib-style", e.resourceCatalog)), t.registerResolver(
    "biblatex-style",
    g("biblatex-style", e.resourceCatalog)
  );
  const r = g("font-file", e.resourceCatalog);
  t.registerResolver("font-family", (n, i) => {
    const s = d(n, i, "font-family"), a = r(n, i), l = Array.isArray(a) ? { items: a, isIncomplete: !1 } : a;
    return {
      items: L([...s, ...l.items]),
      isIncomplete: l.isIncomplete
    };
  }), t.registerResolver(
    "boolean",
    (n) => ["true", "false"].filter((i) => i.startsWith(n.prefix)).map((i) => ({
      label: i,
      kind: "keyword",
      insertText: i,
      replaceLength: n.prefix.length
    }))
  ), t.registerResolver("color", (n, i) => {
    if (n.type !== "argument") return [];
    if (n.argumentIndex > 0 && (n.command === "color" || n.command === "textcolor" || n.command === "colorbox"))
      return [];
    const s = o?.syncProject(
      i.index,
      i.cancellationToken,
      i.document.path,
      i.waitUntil
    );
    return {
      items: A(i, s?.shards ?? []),
      isIncomplete: s?.isIncomplete ?? !1
    };
  }), t.registerResolver(
    "counter",
    (n, i) => d(n, i, "counter")
  ), t.registerResolver(
    "length",
    (n, i) => d(n, i, "length")
  ), t.registerResolver(
    "glossary-key",
    (n, i) => d(n, i, "glossary")
  ), t.registerResolver(
    "acronym-key",
    (n, i) => d(n, i, "acronym")
  ), t.registerResolver(
    "key-family",
    (n, i) => le(n, i)
  ), t.registerResolver(
    "key-value",
    (n, i) => n.type === "argument" ? ve(n, i, o, t) : []
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
      (i, s) => W(n, i.prefix, s.document.path, s.fs)
    );
  return t;
}
function He(e, t, o) {
  S.get(e)?.syncProject(t, o);
}
const J = H();
function b(e, t, o, r, n = {}) {
  const i = n.registry ?? J;
  if (n.cancellationToken?.isCancellationRequested)
    return { items: [], isIncomplete: !1 };
  const s = F(e, t, i);
  return s ? i.resolveResult(s, {
    document: e,
    position: t,
    index: o,
    fs: r,
    ...n.cancellationToken ? { cancellationToken: n.cancellationToken } : {},
    ...n.waitUntil ? { waitUntil: n.waitUntil } : {}
  }) : { items: [], isIncomplete: !1 };
}
async function Je(e, t, o, r, n = {}) {
  const i = /* @__PURE__ */ new Set(), s = b(e, t, o, r, {
    ...n,
    waitUntil: (a) => i.add(a)
  });
  return !s.isIncomplete || i.size === 0 || n.cancellationToken?.isCancellationRequested ? s : (await Promise.allSettled(i), n.cancellationToken?.isCancellationRequested ? { items: [], isIncomplete: !1 } : b(e, t, o, r, n));
}
function x(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function Y(e, t) {
  const o = [];
  return e.documentation && o.push(e.documentation), e.package && o.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), o.join(`

`);
}
function j(e, t, o, r) {
  const n = [], i = o.getLoadedPackages(r);
  for (const s of U) {
    if (!s.name.startsWith(e)) continue;
    const a = !s.package || i.has(s.package), l = {
      label: `\\${s.name}`,
      kind: "command",
      insertText: s.snippet.slice(1),
      snippet: !0,
      sortText: `${a ? "0a" : "0b"}_${s.name}`,
      replaceLength: t
    };
    s.detail && (l.detail = s.detail);
    const c = Y(s, a);
    c && (l.documentation = c), n.push(l);
  }
  for (const s of o.getCommandDefs(r))
    s.name.startsWith(e) && n.push({
      label: `\\${s.name}`,
      kind: "variable",
      insertText: s.name,
      detail: `User command (${s.location.file}:${s.location.line})`,
      sortText: `1_${s.name}`,
      replaceLength: t
    });
  return Z(n, e, t, o), n;
}
function G(e, t) {
  return e === "macro" ? `Package macro${x(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function Q(e, t) {
  let o = e;
  for (let r = 1; r <= t; r++) o += `{$${r}}`;
  return o;
}
function Z(e, t, o, r) {
  const n = new Set(e.map((i) => i.label.slice(1)));
  for (const [i, s] of r.getEngineCommands()) {
    if (!i.startsWith(t) || n.has(i)) continue;
    const a = s.argCount > 0;
    e.push({
      label: `\\${i}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: a ? Q(i, s.argCount) : i,
      snippet: a,
      detail: G(s.category, s.argCount),
      sortText: `2_${i}`,
      replaceLength: o
    });
  }
}
function ee(e, t, o, r) {
  const n = [];
  for (const i of o.getAllLabels(r)) {
    if (!i.name.startsWith(e)) continue;
    const s = o.resolveLabel(i.name), a = `${i.location.file}:${i.location.line}`;
    n.push({
      label: i.name,
      kind: "reference",
      insertText: i.name,
      detail: s ? `[${s}] ${a}` : a,
      replaceLength: t
    });
  }
  return n;
}
function te(e, t, o, r) {
  const n = [], i = /* @__PURE__ */ new Set();
  for (const s of o.getAuxCitations())
    s.startsWith(e) && (i.add(s), n.push({
      label: s,
      kind: "reference",
      insertText: s,
      detail: "Citation",
      replaceLength: t
    }));
  for (const s of o.getBibEntries(r)) {
    if (i.has(s.key) || !s.key.startsWith(e)) continue;
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
function ne(e, t, o, r, n) {
  const i = [], s = /* @__PURE__ */ new Set();
  for (const a of K) {
    if (!a.name.startsWith(e)) continue;
    s.add(a.name);
    const l = {
      label: a.name,
      kind: "module",
      insertText: a.name,
      replaceLength: t
    };
    a.detail && (l.detail = a.detail), r && (l.sortText = `0_${a.name}`), i.push(l);
  }
  for (const a of o.getAllEnvironments(n))
    !a.startsWith(e) || s.has(a) || (s.add(a), i.push({
      label: a,
      kind: "module",
      insertText: a,
      detail: "Used in project",
      sortText: `1_${a}`,
      replaceLength: t
    }));
  for (const a of o.getEnvironmentDefinitions(n)) {
    const l = i.find((u) => u.label === a.name);
    if (!l) continue;
    const c = `Project definition: ${a.location.file}:${a.location.line}`;
    l.documentation = [l.documentation, c].filter(Boolean).join(`

`), l.sortText = `0_${a.name}`;
  }
  return ie(i, e, t, s, o), i;
}
function ie(e, t, o, r, n) {
  const i = new Set(n.getEngineEnvironments());
  for (const s of w()) i.add(s);
  for (const s of i) {
    if (!s.startsWith(t) || r.has(s)) continue;
    const a = n.getEngineCommands().get(s)?.argCount ?? -1;
    e.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: `Package environment${x(a)}`,
      sortText: `2_${s}`,
      replaceLength: o
    });
  }
}
function oe(e, t, o, r) {
  const n = new Set(e.map((i) => i.insertText));
  for (const i of r)
    for (const s of i.environments) {
      if (!s.name.startsWith(t) || n.has(s.name)) continue;
      n.add(s.name);
      const a = {
        label: s.name,
        kind: "module",
        insertText: s.name,
        detail: `TeX Live ${i.texliveYear}: ${i.scope.name} environment`,
        sortText: `2_${s.name}`,
        replaceLength: o
      };
      s.doc && (a.documentation = s.doc), e.push(a);
    }
}
const re = {
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
function se(e) {
  return e.map(
    (t) => `${t.role}: ${t.location.file}:${t.location.line}` + (t.target ? ` (alias ${t.target})` : "")
  );
}
function ae(e, t) {
  const o = e.index.getProjectValues(t, e.document.path);
  return t === "glossary" ? [...o, ...e.index.getProjectValues("acronym", e.document.path)] : o;
}
function d(e, t, o) {
  const r = /* @__PURE__ */ new Map();
  for (const i of ae(t, o)) {
    const s = r.get(i.name) ?? [];
    s.push(i), r.set(i.name, s);
  }
  return [.../* @__PURE__ */ new Set([...re[o] ?? [], ...r.keys()])].filter((i) => i.startsWith(e.prefix)).sort().map((i) => {
    const s = r.get(i) ?? [], a = se(s);
    return {
      label: i,
      kind: o === "font-family" ? "text" : "variable",
      insertText: i,
      detail: a[0] ?? (o === "counter" || o === "length" ? "LaTeX kernel value" : o),
      ...a.length > 0 ? { documentation: a.join(`

`) } : {},
      sortText: `${s.length > 0 ? "0" : "1"}_${i}`,
      replaceLength: e.prefix.length
    };
  });
}
function le(e, t) {
  const o = /* @__PURE__ */ new Map();
  for (const r of t.index.getProjectKeys(t.document.path)) {
    const n = o.get(r.family) ?? [];
    n.push(r), o.set(r.family, n);
  }
  return [...o].filter(([r]) => r.startsWith(e.prefix)).sort(([r], [n]) => r.localeCompare(n)).map(([r, n]) => ({
    label: r,
    kind: "module",
    insertText: r,
    detail: `Project key family · ${n[0].location.file}:${n[0].location.line}`,
    documentation: `${n.length} statically recovered key(s)`,
    replaceLength: e.prefix.length
  }));
}
function ce(e) {
  if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
    const o = e.keyFamily === "class-options" ? "class" : "package";
    return (e.selector?.values ?? []).map((r) => r.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((r) => `${o}/${r}`);
  }
  const t = e.keyFamily?.split("/")[0]?.trim();
  return t ? [`package/${t}`] : [];
}
function ue(e, t) {
  return e.keyFamily ? t.flatMap((o) => {
    const r = o.keyFamilies.find((n) => n.name === e.keyFamily);
    return r ? [{ shard: o, keys: r.keys }] : [];
  }) : [];
}
function fe(e, t) {
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
function me(e) {
  return e.value.type === "flag" ? { insertText: e.name } : { insertText: `${e.name}=\${1}`, snippet: !0 };
}
function pe(e, t) {
  const o = /* @__PURE__ */ new Map();
  for (const { shard: r, keys: n } of t)
    for (const i of n) {
      const s = o.get(i.name);
      s ? (s.scopes.push(r.scope.id), s.key.repeatable &&= i.repeatable) : o.set(i.name, { key: { ...i }, scopes: [r.scope.id] });
    }
  return [...o.values()].filter(
    ({ key: r }) => r.name.startsWith(e.prefix) && (r.repeatable || !e.usedKeys.includes(r.name))
  ).map(({ key: r, scopes: n }) => ({
    label: r.name,
    kind: "keyword",
    ...me(r),
    detail: `${r.value.type} key · ${n.join(", ")}`,
    documentation: fe(r, n),
    sortText: `0_${r.name}`,
    replaceLength: e.prefix.length
  }));
}
function de(e) {
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
function ge(e, t) {
  return [...new Set(
    t.flatMap((r) => r.value.type === "enum" ? r.value.values ?? [] : [])
  )].filter((r) => r.startsWith(e.prefix)).sort().map((r) => ({
    label: r,
    kind: "keyword",
    insertText: r,
    replaceLength: e.prefix.length
  }));
}
function he(e, t) {
  const o = e.prefix.startsWith("\\"), r = o ? e.prefix.slice(1) : e.prefix;
  return j(r, r.length, t.index, t.document.path).map(
    (n) => ({
      ...n,
      insertText: o ? `\\${n.insertText}` : n.insertText,
      replaceLength: e.prefix.length
    })
  );
}
function ye(e, t, o, r) {
  if (r.some((i) => i.value.type === "enum"))
    return { items: ge(e, r), isIncomplete: !1 };
  if (r.some((i) => i.value.type === "command"))
    return { items: he(e, t), isIncomplete: !1 };
  const n = r.map((i) => de(i.value.type)).find(Boolean);
  return n ? o.resolveResult({ ...e, domain: n, valueKind: n }, t) : { items: [], isIncomplete: !1 };
}
function $e(e) {
  const t = new Set(
    (e.keyFamilySelector?.values ?? []).map(
      (o) => o.trim().replace(/^\/+|\/+$/g, "")
    )
  );
  e.keyFamily && t.add(e.keyFamily.replace(/^\/+|\/+$/g, ""));
  for (const o of e.usedKeys)
    o.endsWith("/.cd") && t.add(o.slice(0, -4).replace(/^\/+|\/+$/g, ""));
  return t;
}
function ke(e, t) {
  const o = $e(e);
  return t.index.getProjectKeys(
    t.document.path,
    o.size > 0 ? o : void 0
  );
}
function be(e, t) {
  const o = /* @__PURE__ */ new Map();
  for (const r of t) {
    const n = o.get(r.name) ?? [];
    n.push(r), o.set(r.name, n);
  }
  return [...o].filter(([r]) => r.startsWith(e.prefix) && !e.usedKeys.includes(r)).sort(([r], [n]) => r.localeCompare(n)).map(([r, n]) => {
    const i = n.at(-1), s = i.valueType !== "flag";
    return {
      label: r,
      kind: "keyword",
      insertText: s ? `${r}=\${1}` : r,
      ...s ? { snippet: !0 } : {},
      detail: `${i.valueType} key · ${i.provenance === "runtime-observed" ? "runtime-observed" : "project"}/${i.family}`,
      documentation: n.map((a) => `${a.location.file}:${a.location.line}`).join(`

`),
      sortText: `00_${r}`,
      replaceLength: e.prefix.length
    };
  });
}
function Ce(e) {
  return {
    boolean: "boolean",
    color: "color",
    file: "project-file",
    command: "command"
  }[e.valueType] ?? null;
}
function Te(e, t, o, r) {
  const n = r.at(-1);
  if (!n) return { items: [], isIncomplete: !1 };
  const i = new Set(n.valueType === "enum" ? n.values ?? [] : []);
  if (i.size > 0)
    return {
      items: [...i].filter((a) => a.startsWith(e.prefix)).sort().map((a) => ({
        label: a,
        kind: "keyword",
        insertText: a,
        detail: `Project enum value for ${e.key}`,
        replaceLength: e.prefix.length
      })),
      isIncomplete: !1
    };
  const s = Ce(n);
  return s ? o.resolveResult({ ...e, domain: s, valueKind: s }, t) : { items: [], isIncomplete: !1 };
}
function C(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((o) => t.has(o.insertText) ? !1 : (t.add(o.insertText), !0));
}
function ve(e, t, o, r) {
  const n = o?.syncScopes(
    ce(e),
    t.cancellationToken,
    t.waitUntil
  ) ?? {
    shards: [],
    isIncomplete: !1
  }, i = ue(e, n.shards), s = ke(e, t);
  if (e.keyValuePosition !== "value")
    return {
      items: C([
        ...be(e, s),
        ...pe(e, i)
      ]),
      isIncomplete: n.isIncomplete
    };
  if (!e.key) return { items: [], isIncomplete: n.isIncomplete };
  const a = i.flatMap((u) => u.keys.filter((m) => m.name === e.key)), l = ye(e, t, r, a), c = Te(
    e,
    t,
    r,
    s.filter((u) => u.name === e.key)
  );
  return {
    items: C([...c.items, ...l.items]),
    isIncomplete: n.isIncomplete || l.isIncomplete || c.isIncomplete
  };
}
const Re = {
  "tex-class": /* @__PURE__ */ new Set(["cls"]),
  "tex-package": /* @__PURE__ */ new Set(["sty"]),
  "bib-style": /* @__PURE__ */ new Set(["bst"]),
  "biblatex-style": /* @__PURE__ */ new Set(["bbx", "cbx", "lbx"]),
  "font-file": /* @__PURE__ */ new Set(["otf", "ttf", "ttc"])
};
function Ee(e, t) {
  const o = e.lastIndexOf(".");
  return o < 0 || !Re[t].has(e.slice(o + 1).toLowerCase()) ? null : e.slice(0, o);
}
function we(e, t, o, r) {
  return r.listFiles().map((n) => ({ path: n, name: Ee(n, o) })).filter(
    (n) => n.name?.startsWith(e) === !0
  ).map(({ path: n, name: i }) => ({
    label: i,
    kind: o === "font-file" ? "file" : "module",
    insertText: i,
    detail: `Project resource: ${n}`,
    sortText: `0_${i}`,
    replaceLength: t
  }));
}
function Se(e, t, o, r) {
  const n = r === "font-file" ? e.fileName : e.name;
  if (!n.startsWith(t)) return null;
  const i = {
    label: n,
    kind: r === "font-file" ? "file" : "module",
    insertText: n,
    detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
    sortText: `1_${n}`,
    replaceLength: o
  };
  return e.documentationUrl && (i.documentation = `[Package documentation](${e.documentationUrl})

Source: \`${e.sourcePath}\``), i;
}
function g(e, t) {
  return (o, r) => {
    const n = we(o.prefix, o.prefix.length, e, r.fs);
    if (!t) return n;
    const i = t.getState(e);
    if (i.status === "idle" || i.status === "loading" || i.status === "error") {
      const a = t.load(e, r.cancellationToken);
      r.waitUntil?.(a), r.waitUntil;
    }
    if (i.status !== "ready")
      return {
        items: n,
        isIncomplete: i.status !== "mismatch"
      };
    const s = i.shard.resources.map((a) => Se(a, o.prefix, o.prefix.length, e)).filter((a) => a !== null);
    return { items: L([...n, ...s]), isIncomplete: !1 };
  };
}
function L(e) {
  const t = /* @__PURE__ */ new Set();
  return e.filter((o) => t.has(o.insertText) ? !1 : (t.add(o.insertText), !0));
}
const xe = /\\(?:begin|end)\{(\w+\*?)\}/g, je = new RegExp(`\\\\(?:${v})\\{([^}]+)\\}`, "g"), Le = new RegExp(`\\\\(?:${R})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), Ie = new RegExp(E, "g");
function f(e, t, o) {
  for (const r of e.matchAll(t))
    if (o >= r.index && o < r.index + r[0].length) return r;
  return null;
}
function Pe(e, t, o) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + o + 1 };
}
function Ye(e, t, o) {
  const r = e.lineAt(t.line), n = t.column - 1, i = f(r, xe, n);
  if (i) return { contents: _e(i[1], o), range: y(t.line, i) };
  const s = f(r, je, n);
  if (s) {
    const c = h(s, n) ?? s[1].trim();
    return { contents: Me(c, o), range: y(t.line, s) };
  }
  const a = f(r, Le, n);
  if (a) return { contents: De(a[1], o), range: y(t.line, a) };
  const l = f(r, Ie, n);
  if (l) {
    const c = Ae(l[1], o);
    return c ? { contents: c, range: y(t.line, l) } : null;
  }
  return null;
}
function y(e, t) {
  return Pe(e, t.index, t[0].length);
}
function _e(e, t) {
  const o = B(e);
  if (o) {
    const r = [`**${e}** environment`];
    return o.detail && r.push(o.detail), o.package && r.push(`Package: \`${o.package}\``), $(r, t.getEngineCommands().get(e)), r;
  }
  if (t.getEngineEnvironments().has(e) || w().has(e)) {
    const r = [`**${e}** — Package environment`];
    return $(r, t.getEngineCommands().get(e)), r;
  }
  return [`**${e}** environment`];
}
function Me(e, t) {
  const o = t.resolveLabel(e), r = t.findLabelDef(e), n = [o ? `**\\ref{${e}}** = ${o}` : `**\\ref{${e}}**`];
  return r && n.push(`Defined at ${r.location.file}:${r.location.line}`), n;
}
function De(e, t) {
  const o = [];
  for (const r of e.split(",")) {
    const n = r.trim(), i = t.findBibEntry(n);
    if (i) {
      const s = D(i);
      o.push(`**[${n}]** ${i.type}${s ? `

${s}` : ""}`);
    } else
      o.push(`**[${n}]**`);
  }
  return o;
}
function Ae(e, t) {
  const o = O(e);
  if (o) {
    const i = [`**\\${e}**${o.detail ? ` — ${o.detail}` : ""}`], s = N(o.snippet);
    return s.length && i.push(`\`${X(e, s)}\``), o.documentation && i.push(o.documentation), o.package && i.push(`Package: \`${o.package}\``), $(i, t.getEngineCommands().get(e)), i;
  }
  const r = t.findCommandDef(e);
  if (r)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${r.location.file}:${r.location.line}`
    ];
  const n = t.getEngineCommands().get(e);
  if (n) {
    const i = [`**\\${e}** — ${Fe(n.category)}`];
    return $(i, n), i;
  }
  return null;
}
function Fe(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function $(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const I = new RegExp(`\\\\(?:${v})\\{([^}]+)\\}`, "g"), P = new RegExp(`\\\\(?:${R})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), _ = new RegExp(E, "g");
function p(e, t) {
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
  const o = e[1];
  let r = e.index + e[0].lastIndexOf("{") + 1;
  for (const n of o.split(",")) {
    if (t >= r && t <= r + n.length) return n.trim() || null;
    r += n.length + 1;
  }
  return o.split(",")[0]?.trim() || null;
}
function Ge(e, t, o) {
  const r = e.lineAt(t.line), n = t.column - 1, i = f(r, I, n);
  if (i) {
    const l = h(i, n), c = l ? o.findLabelDef(l) : null;
    return c ? p(c.location.file, c.location) : null;
  }
  const s = f(r, P, n);
  if (s) {
    const l = h(s, n);
    if (!l) return null;
    const c = o.findBibEntry(l);
    if (c) return p(c.location.file, c.location);
    const u = o.findBibitemDef(l);
    return u ? p(u.location.file, u.location) : null;
  }
  const a = f(r, _, n);
  if (a) {
    const l = o.findCommandDef(a[1]);
    return l ? p(l.location.file, l.location) : null;
  }
  return null;
}
function Qe(e, t, o) {
  const r = e.lineAt(t.line), n = t.column - 1, i = f(r, /\\label\{([^}]+)\}/g, n);
  if (i)
    return o.getAllLabelRefs(i[1].trim()).map((c) => p(c.location.file, c.location));
  const s = f(r, I, n);
  if (s) {
    const c = h(s, n);
    if (!c) return [];
    const u = [], m = o.findLabelDef(c);
    m && u.push(p(m.location.file, m.location));
    for (const k of o.getAllLabelRefs(c)) u.push(p(k.location.file, k.location));
    return u;
  }
  const a = f(r, P, n);
  if (a) {
    const c = h(a, n);
    return c ? T(o.findAllOccurrences(c, "citation")) : [];
  }
  const l = f(r, _, n);
  return l && o.findCommandDef(l[1]) ? T(o.findAllOccurrences(l[1], "command")) : [];
}
function T(e) {
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
  H as createDefaultCompletionRegistry,
  He as preloadSemanticCatalog,
  b as provideCompletionResult,
  Je as provideCompletionResultAsync,
  Ge as provideDefinition,
  Ye as provideHover,
  Qe as provideReferences
};
