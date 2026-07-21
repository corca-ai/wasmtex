import { formatReference as T } from "./bib-parser.js";
import { COMMON_PACKAGES as _, LATEX_ENVIRONMENTS as A, LATEX_COMMANDS as x, getEnvironmentByName as D, getCommandByName as S } from "./latex-commands.js";
import { REF_CMDS as $, CITE_CMDS as E, USEPACKAGE_CMDS as w, INPUT_CMDS as O, COMMAND_TOKEN as b } from "./latex-patterns.js";
import { getShardEnvironments as y, parseSignature as P, formatSignature as I } from "./package-db.js";
function W(e, t) {
  const n = e.slice(0, t - 1), o = n.match(new RegExp(`\\\\(?:${$})\\{([^}]*)$`));
  if (o) {
    const f = o[1], u = f.lastIndexOf(",");
    return {
      type: "ref",
      prefix: u >= 0 ? f.slice(u + 1).trim() : f.trimStart()
    };
  }
  const r = n.match(new RegExp(`\\\\(?:${E})(?:\\[.*?\\])?\\{([^}]*)$`));
  if (r) {
    const f = r[1], u = f.lastIndexOf(",");
    return {
      type: "cite",
      prefix: u >= 0 ? f.slice(u + 1).trim() : f.trimStart()
    };
  }
  const i = n.match(/\\begin\{([^}]*)$/);
  if (i) return { type: "begin", prefix: i[1].trimStart() };
  const c = n.match(/\\end\{([^}]*)$/);
  if (c) return { type: "end", prefix: c[1].trimStart() };
  const a = n.match(new RegExp(`\\\\(?:${w})(?:\\[.*?\\])?\\{([^}]*)$`));
  if (a) {
    const f = a[1], u = f.lastIndexOf(",");
    return {
      type: "usepackage",
      prefix: u >= 0 ? f.slice(u + 1).trim() : f.trimStart()
    };
  }
  const l = n.match(new RegExp(`\\\\(?:${O})\\{([^}]*)$`));
  if (l) return { type: "include", prefix: l[1].trimStart() };
  const s = n.match(/\\(\w*)$/);
  return s ? { type: "command", prefix: s[1] } : null;
}
function le(e, t, n, o) {
  const r = W(e.lineAt(t.line), t.column);
  if (!r) return [];
  const i = r.prefix.length;
  switch (r.type) {
    case "command":
      return F(r.prefix, i, n);
    case "ref":
      return U(r.prefix, i, n);
    case "cite":
      return K(r.prefix, i, n);
    case "begin":
    case "end":
      return X(r.prefix, i, n, r.type === "begin");
    case "usepackage":
      return G(r.prefix, i);
    case "include":
      return q(r.prefix, i, o);
  }
}
function R(e) {
  return e <= 0 ? "" : ` (${e} arg${e !== 1 ? "s" : ""})`;
}
function B(e, t) {
  const n = [];
  return e.documentation && n.push(e.documentation), e.package && n.push(
    t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``
  ), n.join(`

`);
}
function F(e, t, n) {
  const o = [], r = n.getLoadedPackages();
  for (const i of x) {
    if (!i.name.startsWith(e)) continue;
    const c = !i.package || r.has(i.package), a = {
      label: `\\${i.name}`,
      kind: "command",
      insertText: i.snippet.slice(1),
      snippet: !0,
      sortText: `${c ? "0a" : "0b"}_${i.name}`,
      replaceLength: t
    };
    i.detail && (a.detail = i.detail);
    const l = B(i, c);
    l && (a.documentation = l), o.push(a);
  }
  for (const i of n.getCommandDefs())
    i.name.startsWith(e) && o.push({
      label: `\\${i.name}`,
      kind: "variable",
      insertText: i.name,
      detail: `User command (${i.location.file}:${i.location.line})`,
      sortText: `1_${i.name}`,
      replaceLength: t
    });
  return N(o, e, t, n), o;
}
function V(e, t) {
  return e === "macro" ? `Package macro${R(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function H(e, t) {
  let n = e;
  for (let o = 1; o <= t; o++) n += `{$${o}}`;
  return n;
}
function N(e, t, n, o) {
  const r = new Set(e.map((i) => i.label.slice(1)));
  for (const [i, c] of o.getEngineCommands()) {
    if (!i.startsWith(t) || r.has(i)) continue;
    const a = c.argCount > 0;
    e.push({
      label: `\\${i}`,
      kind: c.category === "primitive" ? "keyword" : "text",
      insertText: a ? H(i, c.argCount) : i,
      snippet: a,
      detail: V(c.category, c.argCount),
      sortText: `2_${i}`,
      replaceLength: n
    });
  }
}
function U(e, t, n) {
  const o = [];
  for (const r of n.getAllLabels()) {
    if (!r.name.startsWith(e)) continue;
    const i = n.resolveLabel(r.name), c = `${r.location.file}:${r.location.line}`;
    o.push({
      label: r.name,
      kind: "reference",
      insertText: r.name,
      detail: i ? `[${i}] ${c}` : c,
      replaceLength: t
    });
  }
  return o;
}
function K(e, t, n) {
  const o = [], r = /* @__PURE__ */ new Set();
  for (const i of n.getAuxCitations())
    i.startsWith(e) && (r.add(i), o.push({
      label: i,
      kind: "reference",
      insertText: i,
      detail: "Citation",
      replaceLength: t
    }));
  for (const i of n.getBibEntries()) {
    if (r.has(i.key) || !i.key.startsWith(e)) continue;
    const c = [i.author, i.year].filter(Boolean).join(", ");
    o.push({
      label: i.key,
      kind: "reference",
      insertText: i.key,
      detail: c || (i.title ?? i.type),
      replaceLength: t
    });
  }
  return o;
}
function X(e, t, n, o) {
  const r = [], i = /* @__PURE__ */ new Set();
  for (const c of A) {
    if (!c.name.startsWith(e)) continue;
    i.add(c.name);
    const a = {
      label: c.name,
      kind: "module",
      insertText: c.name,
      replaceLength: t
    };
    c.detail && (a.detail = c.detail), o && (a.sortText = `0_${c.name}`), r.push(a);
  }
  for (const c of n.getAllEnvironments())
    !c.startsWith(e) || i.has(c) || (i.add(c), r.push({
      label: c,
      kind: "module",
      insertText: c,
      detail: "Used in project",
      sortText: `1_${c}`,
      replaceLength: t
    }));
  return j(r, e, t, i, n), r;
}
function j(e, t, n, o, r) {
  const i = new Set(r.getEngineEnvironments());
  for (const c of y()) i.add(c);
  for (const c of i) {
    if (!c.startsWith(t) || o.has(c)) continue;
    const a = r.getEngineCommands().get(c)?.argCount ?? -1;
    e.push({
      label: c,
      kind: "module",
      insertText: c,
      detail: `Package environment${R(a)}`,
      sortText: `2_${c}`,
      replaceLength: n
    });
  }
}
function G(e, t) {
  return _.filter((n) => n.startsWith(e)).map((n) => ({
    label: n,
    kind: "module",
    insertText: n,
    replaceLength: t
  }));
}
function q(e, t, n) {
  return n.listFiles().filter((o) => o.startsWith(e)).map((o) => ({ label: o, kind: "file", insertText: o, replaceLength: t }));
}
const z = /\\(?:begin|end)\{(\w+\*?)\}/g, J = new RegExp(`\\\\(?:${$})\\{([^}]+)\\}`, "g"), Q = new RegExp(`\\\\(?:${E})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), Y = new RegExp(b, "g");
function m(e, t, n) {
  for (const o of e.matchAll(t))
    if (n >= o.index && n < o.index + o[0].length) return o;
  return null;
}
function Z(e, t, n) {
  return { startLine: e, startColumn: t + 1, endLine: e, endColumn: t + n + 1 };
}
function fe(e, t, n) {
  const o = e.lineAt(t.line), r = t.column - 1, i = m(o, z, r);
  if (i) return { contents: ee(i[1], n), range: d(t.line, i) };
  const c = m(o, J, r);
  if (c) {
    const s = p(c, r) ?? c[1].trim();
    return { contents: ne(s, n), range: d(t.line, c) };
  }
  const a = m(o, Q, r);
  if (a) return { contents: te(a[1], n), range: d(t.line, a) };
  const l = m(o, Y, r);
  if (l) {
    const s = ie(l[1], n);
    return s ? { contents: s, range: d(t.line, l) } : null;
  }
  return null;
}
function d(e, t) {
  return Z(e, t.index, t[0].length);
}
function ee(e, t) {
  const n = D(e);
  if (n) {
    const o = [`**${e}** environment`];
    return n.detail && o.push(n.detail), n.package && o.push(`Package: \`${n.package}\``), h(o, t.getEngineCommands().get(e)), o;
  }
  if (t.getEngineEnvironments().has(e) || y().has(e)) {
    const o = [`**${e}** — Package environment`];
    return h(o, t.getEngineCommands().get(e)), o;
  }
  return [`**${e}** environment`];
}
function ne(e, t) {
  const n = t.resolveLabel(e), o = t.findLabelDef(e), r = [n ? `**\\ref{${e}}** = ${n}` : `**\\ref{${e}}**`];
  return o && r.push(`Defined at ${o.location.file}:${o.location.line}`), r;
}
function te(e, t) {
  const n = [];
  for (const o of e.split(",")) {
    const r = o.trim(), i = t.findBibEntry(r);
    if (i) {
      const c = T(i);
      n.push(`**[${r}]** ${i.type}${c ? `

${c}` : ""}`);
    } else
      n.push(`**[${r}]**`);
  }
  return n;
}
function ie(e, t) {
  const n = S(e);
  if (n) {
    const i = [`**\\${e}**${n.detail ? ` — ${n.detail}` : ""}`], c = P(n.snippet);
    return c.length && i.push(`\`${I(e, c)}\``), n.documentation && i.push(n.documentation), n.package && i.push(`Package: \`${n.package}\``), h(i, t.getEngineCommands().get(e)), i;
  }
  const o = t.findCommandDef(e);
  if (o)
    return [
      `**\\${e}** — User-defined command`,
      `Defined at ${o.location.file}:${o.location.line}`
    ];
  const r = t.getEngineCommands().get(e);
  if (r) {
    const i = [`**\\${e}** — ${oe(r.category)}`];
    return h(i, r), i;
  }
  return null;
}
function oe(e) {
  return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function h(e, t) {
  !t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
const v = new RegExp(`\\\\(?:${$})\\{([^}]+)\\}`, "g"), M = new RegExp(`\\\\(?:${E})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), L = new RegExp(b, "g");
function g(e, t) {
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
function p(e, t) {
  const n = e[1];
  let o = e.index + e[0].lastIndexOf("{") + 1;
  for (const r of n.split(",")) {
    if (t >= o && t <= o + r.length) return r.trim() || null;
    o += r.length + 1;
  }
  return n.split(",")[0]?.trim() || null;
}
function ue(e, t, n) {
  const o = e.lineAt(t.line), r = t.column - 1, i = m(o, v, r);
  if (i) {
    const l = p(i, r), s = l ? n.findLabelDef(l) : null;
    return s ? g(s.location.file, s.location) : null;
  }
  const c = m(o, M, r);
  if (c) {
    const l = p(c, r);
    if (!l) return null;
    const s = n.findBibEntry(l);
    if (s) return g(s.location.file, s.location);
    const f = n.findBibitemDef(l);
    return f ? g(f.location.file, f.location) : null;
  }
  const a = m(o, L, r);
  if (a) {
    const l = n.findCommandDef(a[1]);
    return l ? g(l.location.file, l.location) : null;
  }
  return null;
}
function me(e, t, n) {
  const o = e.lineAt(t.line), r = t.column - 1, i = m(o, /\\label\{([^}]+)\}/g, r);
  if (i)
    return n.getAllLabelRefs(i[1].trim()).map((s) => g(s.location.file, s.location));
  const c = m(o, v, r);
  if (c) {
    const s = p(c, r);
    if (!s) return [];
    const f = [], u = n.findLabelDef(s);
    u && f.push(g(u.location.file, u.location));
    for (const C of n.getAllLabelRefs(s)) f.push(g(C.location.file, C.location));
    return f;
  }
  const a = m(o, M, r);
  if (a) {
    const s = p(a, r);
    return s ? k(n.findAllOccurrences(s, "citation")) : [];
  }
  const l = m(o, L, r);
  return l && n.findCommandDef(l[1]) ? k(n.findAllOccurrences(l[1], "command")) : [];
}
function k(e) {
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
  W as detectCompletionContext,
  le as provideCompletions,
  ue as provideDefinition,
  fe as provideHover,
  me as provideReferences
};
