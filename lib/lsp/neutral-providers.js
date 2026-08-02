import { formatReference as _ } from "./bib-parser.js";
import { analyzeCompletionContext as A } from "./completion-context.js";
import { CompletionResolverRegistry as D } from "./completion-registry.js";
import { LATEX_COMMANDS as M, LATEX_ENVIRONMENTS as x, COMMON_PACKAGES as w, getEnvironmentByName as S, getCommandByName as O } from "./latex-commands.js";
import { REF_CMDS as $, CITE_CMDS as k, COMMAND_TOKEN as R } from "./latex-patterns.js";
import { getShardEnvironments as v, parseSignature as P, formatSignature as W } from "./package-db.js";
function j() {
  const e = new D();
  e.registerResolver(
    "command",
    (n, i) => I(n.prefix, n.prefix.length, i.index)
  ), e.registerResolver(
    "label",
    (n, i) => X(n.prefix, n.prefix.length, i.index)
  ), e.registerResolver(
    "citation",
    (n, i) => K(n.prefix, n.prefix.length, i.index)
  ), e.registerResolver(
    "environment",
    (n, i) => U(
      n.prefix,
      n.prefix.length,
      i.index,
      n.type === "argument" && n.command === "begin"
    )
  ), e.registerResolver(
    "tex-package",
    (n) => z(n.prefix, n.prefix.length)
  );
  const t = (n, i) => G(n.prefix, n.prefix.length, i.fs);
  return e.registerResolver("project-tex", t), e.registerResolver("project-bib", t), e.registerResolver("project-image", t), e.registerResolver("project-file", t), e;
}
const B = j();
function me(e, t, n, i, r = {}) {
  const o = r.registry ?? B;
  if (r.cancellationToken?.isCancellationRequested) return [];
  const s = A(e, t, o);
  return s ? o.resolve(s, {
    document: e,
    position: t,
    index: n,
    fs: i,
    ...r.cancellationToken ? { cancellationToken: r.cancellationToken } : {}
  }) : [];
}
function b(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function F(e, t) {
  const n = [];
  return e.documentation && n.push(e.documentation), e.package && n.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), n.join(`

`);
}
function I(e, t, n) {
  const i = [], r = n.getLoadedPackages();
  for (const o of M) {
    if (!o.name.startsWith(e)) continue;
    const s = !o.package || r.has(o.package), c = {
      label: `\\${o.name}`,
      kind: "command",
      insertText: o.snippet.slice(1),
      snippet: !0,
      sortText: `${s ? "0a" : "0b"}_${o.name}`,
      replaceLength: t
    };
    o.detail && (c.detail = o.detail);
    const l = F(o, s);
    l && (c.documentation = l), i.push(c);
  }
  for (const o of n.getCommandDefs())
    o.name.startsWith(e) && i.push({
      label: `\\${o.name}`,
      kind: "variable",
      insertText: o.name,
      detail: `User command (${o.location.file}:${o.location.line})`,
      sortText: `1_${o.name}`,
      replaceLength: t
    });
  return N(i, e, t, n), i;
}
function V(e, t) {
  return e === "macro" ? `Package macro${b(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function H(e, t) {
  let n = e;
  for (let i = 1; i <= t; i++) n += `{$${i}}`;
  return n;
}
function N(e, t, n, i) {
  const r = new Set(e.map((o) => o.label.slice(1)));
  for (const [o, s] of i.getEngineCommands()) {
    if (!o.startsWith(t) || r.has(o)) continue;
    const c = s.argCount > 0;
    e.push({
      label: `\\${o}`,
      kind: s.category === "primitive" ? "keyword" : "text",
      insertText: c ? H(o, s.argCount) : o,
      snippet: c,
      detail: V(s.category, s.argCount),
      sortText: `2_${o}`,
      replaceLength: n
    });
  }
}
function X(e, t, n) {
  const i = [];
  for (const r of n.getAllLabels()) {
    if (!r.name.startsWith(e)) continue;
    const o = n.resolveLabel(r.name), s = `${r.location.file}:${r.location.line}`;
    i.push({
      label: r.name,
      kind: "reference",
      insertText: r.name,
      detail: o ? `[${o}] ${s}` : s,
      replaceLength: t
    });
  }
  return i;
}
function K(e, t, n) {
  const i = [], r = /* @__PURE__ */ new Set();
  for (const o of n.getAuxCitations())
    o.startsWith(e) && (r.add(o), i.push({
      label: o,
      kind: "reference",
      insertText: o,
      detail: "Citation",
      replaceLength: t
    }));
  for (const o of n.getBibEntries()) {
    if (r.has(o.key) || !o.key.startsWith(e)) continue;
    const s = [o.author, o.year].filter(Boolean).join(", ");
    i.push({
      label: o.key,
      kind: "reference",
      insertText: o.key,
      detail: s || (o.title ?? o.type),
      replaceLength: t
    });
  }
  return i;
}
function U(e, t, n, i) {
  const r = [], o = /* @__PURE__ */ new Set();
  for (const s of x) {
    if (!s.name.startsWith(e)) continue;
    o.add(s.name);
    const c = {
      label: s.name,
      kind: "module",
      insertText: s.name,
      replaceLength: t
    };
    s.detail && (c.detail = s.detail), i && (c.sortText = `0_${s.name}`), r.push(c);
  }
  for (const s of n.getAllEnvironments())
    !s.startsWith(e) || o.has(s) || (o.add(s), r.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: "Used in project",
      sortText: `1_${s}`,
      replaceLength: t
    }));
  return q(r, e, t, o, n), r;
}
function q(e, t, n, i, r) {
  const o = new Set(r.getEngineEnvironments());
  for (const s of v()) o.add(s);
  for (const s of o) {
    if (!s.startsWith(t) || i.has(s)) continue;
    const c = r.getEngineCommands().get(s)?.argCount ?? -1;
    e.push({
      label: s,
      kind: "module",
      insertText: s,
      detail: `Package environment${b(c)}`,
      sortText: `2_${s}`,
      replaceLength: n
    });
  }
}
function z(e, t) {
  return w.filter((n) => n.startsWith(e)).map((n) => ({
    label: n,
    kind: "module",
    insertText: n,
    replaceLength: t
  }));
}
function G(e, t, n) {
  return n.listFiles().filter((i) => i.startsWith(e)).map((i) => ({ label: i, kind: "file", insertText: i, replaceLength: t }));
}
const J = /\\(?:begin|end)\{(\w+\*?)\}/g, Q = new RegExp(`\\\\(?:${$})\\{([^}]+)\\}`, "g"), Y = new RegExp(`\\\\(?:${k})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), Z = new RegExp(R, "g");
function f(e, t, n) {
  for (const i of e.matchAll(t))
    if (n >= i.index && n < i.index + i[0].length) return i;
  return null;
}
function ee(e, t, n) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + n + 1 };
}
function ge(e, t, n) {
  const i = e.lineAt(t.line), r = t.column - 1, o = f(i, J, r);
  if (o) return { contents: ne(o[1], n), range: p(t.line, o) };
  const s = f(i, Q, r);
  if (s) {
    const a = g(s, r) ?? s[1].trim();
    return { contents: te(a, n), range: p(t.line, s) };
  }
  const c = f(i, Y, r);
  if (c) return { contents: ie(c[1], n), range: p(t.line, c) };
  const l = f(i, Z, r);
  if (l) {
    const a = oe(l[1], n);
    return a ? { contents: a, range: p(t.line, l) } : null;
  }
  return null;
}
function p(e, t) {
  return ee(e, t.index, t[0].length);
}
function ne(e, t) {
  const n = S(e);
  if (n) {
    const i = [`**${e}** environment`];
    return n.detail && i.push(n.detail), n.package && i.push(`Package: \`${n.package}\``), d(i, t.getEngineCommands().get(e)), i;
  }
  if (t.getEngineEnvironments().has(e) || v().has(e)) {
    const i = [`**${e}** — Package environment`];
    return d(i, t.getEngineCommands().get(e)), i;
  }
  return [`**${e}** environment`];
}
function te(e, t) {
  const n = t.resolveLabel(e), i = t.findLabelDef(e), r = [n ? `**\\ref{${e}}** = ${n}` : `**\\ref{${e}}**`];
  return i && r.push(`Defined at ${i.location.file}:${i.location.line}`), r;
}
function ie(e, t) {
  const n = [];
  for (const i of e.split(",")) {
    const r = i.trim(), o = t.findBibEntry(r);
    if (o) {
      const s = _(o);
      n.push(`**[${r}]** ${o.type}${s ? `

${s}` : ""}`);
    } else
      n.push(`**[${r}]**`);
  }
  return n;
}
function oe(e, t) {
  const n = O(e);
  if (n) {
    const o = [`**\\${e}**${n.detail ? ` — ${n.detail}` : ""}`], s = P(n.snippet);
    return s.length && o.push(`\`${W(e, s)}\``), n.documentation && o.push(n.documentation), n.package && o.push(`Package: \`${n.package}\``), d(o, t.getEngineCommands().get(e)), o;
  }
  const i = t.findCommandDef(e);
  if (i)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${i.location.file}:${i.location.line}`
    ];
  const r = t.getEngineCommands().get(e);
  if (r) {
    const o = [`**\\${e}** — ${re(r.category)}`];
    return d(o, r), o;
  }
  return null;
}
function re(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function d(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const y = new RegExp(`\\\\(?:${$})\\{([^}]+)\\}`, "g"), T = new RegExp(`\\\\(?:${k})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), L = new RegExp(R, "g");
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
  const n = e[1];
  let i = e.index + e[0].lastIndexOf("{") + 1;
  for (const r of n.split(",")) {
    if (t >= i && t <= i + r.length) return r.trim() || null;
    i += r.length + 1;
  }
  return n.split(",")[0]?.trim() || null;
}
function pe(e, t, n) {
  const i = e.lineAt(t.line), r = t.column - 1, o = f(i, y, r);
  if (o) {
    const l = g(o, r), a = l ? n.findLabelDef(l) : null;
    return a ? m(a.location.file, a.location) : null;
  }
  const s = f(i, T, r);
  if (s) {
    const l = g(s, r);
    if (!l) return null;
    const a = n.findBibEntry(l);
    if (a) return m(a.location.file, a.location);
    const u = n.findBibitemDef(l);
    return u ? m(u.location.file, u.location) : null;
  }
  const c = f(i, L, r);
  if (c) {
    const l = n.findCommandDef(c[1]);
    return l ? m(l.location.file, l.location) : null;
  }
  return null;
}
function de(e, t, n) {
  const i = e.lineAt(t.line), r = t.column - 1, o = f(i, /\\label\{([^}]+)\}/g, r);
  if (o)
    return n.getAllLabelRefs(o[1].trim()).map((a) => m(a.location.file, a.location));
  const s = f(i, y, r);
  if (s) {
    const a = g(s, r);
    if (!a) return [];
    const u = [], h = n.findLabelDef(a);
    h && u.push(m(h.location.file, h.location));
    for (const E of n.getAllLabelRefs(a)) u.push(m(E.location.file, E.location));
    return u;
  }
  const c = f(i, T, r);
  if (c) {
    const a = g(c, r);
    return a ? C(n.findAllOccurrences(a, "citation")) : [];
  }
  const l = f(i, L, r);
  return l && n.findCommandDef(l[1]) ? C(n.findAllOccurrences(l[1], "command")) : [];
}
function C(e) {
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
  j as createDefaultCompletionRegistry,
  me as provideCompletions,
  pe as provideDefinition,
  ge as provideHover,
  de as provideReferences
};
