import { parseAuxFile as I } from "./aux-parser.js";
import { parseLatexFile as v } from "./latex-parser.js";
const x = /* @__PURE__ */ new Set(["csname", "group", "input", "linechar", "write"]), C = /[_:]/;
function b(c) {
  return c >= 111 && c <= 118 ? "macro" : c > 0 ? "primitive" : "unknown";
}
function w(c) {
  const e = c.indexOf("	");
  if (e < 0) return { name: c, eqType: -1, argCount: -1, category: "unknown" };
  const t = c.slice(0, e), n = c.slice(e + 1), s = n.indexOf("	");
  if (s < 0) {
    const a = parseInt(n, 10);
    return Number.isNaN(a) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : { name: t, eqType: a, argCount: -1, category: b(a) };
  }
  const o = parseInt(n.slice(0, s), 10), i = parseInt(n.slice(s + 1), 10);
  return Number.isNaN(o) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : {
    name: t,
    eqType: o,
    argCount: Number.isNaN(i) ? -1 : i,
    category: b(o)
  };
}
function u(c, e, t) {
  for (const n of e) {
    const s = t(n), o = c.get(s);
    o ? o.push(n) : c.set(s, [n]);
  }
}
function d(c, e, t, n) {
  for (const s of new Set(e.map(t))) {
    const o = c.get(s);
    if (!o) continue;
    const i = o.filter((a) => a.location.file !== n);
    i.length ? c.set(s, i) : c.delete(s);
  }
}
function y(c) {
  const e = /* @__PURE__ */ new Set();
  for (const t of c)
    if (t.length > 3 && t.startsWith("end")) {
      const n = t.slice(3);
      !x.has(n) && c.has(n) && e.add(n);
    }
  return e;
}
class E {
  files = /* @__PURE__ */ new Map();
  auxData = { labels: /* @__PURE__ */ new Map(), citations: /* @__PURE__ */ new Set(), includes: [] };
  bibEntries = [];
  engineCommands = /* @__PURE__ */ new Map();
  engineEnvironments = /* @__PURE__ */ new Set();
  semanticTrace = null;
  activeFilesCache = /* @__PURE__ */ new Map();
  // Inverted indexes (symbol name → definitions/uses) for O(result) lookups,
  // maintained incrementally so a query never rescans the whole project.
  labelDefIndex = /* @__PURE__ */ new Map();
  labelRefIndex = /* @__PURE__ */ new Map();
  citationIndex = /* @__PURE__ */ new Map();
  bibItemIndex = /* @__PURE__ */ new Map();
  commandIndex = /* @__PURE__ */ new Map();
  commandRefIndex = /* @__PURE__ */ new Map();
  envDefIndex = /* @__PURE__ */ new Map();
  // .bib entries keyed by cite key for O(1) lookup (a shared .bib can hold thousands).
  bibEntryIndex = /* @__PURE__ */ new Map();
  // Flattened label list, rebuilt lazily — getAllLabels() is called ~4× per diagnostic run.
  allLabelsCache = null;
  updateFile(e, t) {
    const n = this.files.get(e);
    n && this.removeFromIndexes(e, n);
    const s = v(t, e);
    this.files.set(e, s), this.addToIndexes(s), this.allLabelsCache = null, this.activeFilesCache.clear();
  }
  removeFile(e) {
    const t = this.files.get(e);
    t && this.removeFromIndexes(e, t), this.files.delete(e), this.allLabelsCache = null, this.activeFilesCache.clear();
  }
  addToIndexes(e) {
    u(this.labelDefIndex, e.labels, (t) => t.name), u(this.labelRefIndex, e.labelRefs, (t) => t.name), u(this.citationIndex, e.citations, (t) => t.key), u(this.bibItemIndex, e.bibItems, (t) => t.key), u(this.commandIndex, e.commands, (t) => t.name), u(this.commandRefIndex, e.commandUses, (t) => t.name), u(this.envDefIndex, e.environmentDefs, (t) => t.name);
  }
  removeFromIndexes(e, t) {
    d(this.labelDefIndex, t.labels, (n) => n.name, e), d(this.labelRefIndex, t.labelRefs, (n) => n.name, e), d(this.citationIndex, t.citations, (n) => n.key, e), d(this.bibItemIndex, t.bibItems, (n) => n.key, e), d(this.commandIndex, t.commands, (n) => n.name, e), d(this.commandRefIndex, t.commandUses, (n) => n.name, e), d(this.envDefIndex, t.environmentDefs, (n) => n.name, e);
  }
  updateAux(e) {
    this.auxData = I(e);
  }
  updateBib(e) {
    this.bibEntries = e, this.bibEntryIndex = /* @__PURE__ */ new Map(), u(this.bibEntryIndex, e, (t) => t.key);
  }
  updateAuxData(e) {
    this.auxData = e;
  }
  // --- Queries ---
  getFiles() {
    return [...this.files.keys()];
  }
  hasFile(e) {
    return this.files.has(e);
  }
  getAllLabels() {
    return this.allLabelsCache || (this.allLabelsCache = [...this.files.values()].flatMap((e) => e.labels)), this.allLabelsCache;
  }
  getAllLabelRefs(e) {
    return [...this.labelRefIndex.get(e) ?? []];
  }
  getFileSymbols(e) {
    return this.files.get(e);
  }
  /** Files in the deterministic include component that compiles the requested document. */
  getActiveFiles(e) {
    if (!this.files.has(e)) return [];
    const t = this.activeFilesCache.get(e);
    if (t) return [...t];
    const { edges: n, reverse: s } = this.includeGraph(), o = /* @__PURE__ */ new Set([e]), i = [e];
    for (; i.length > 0; )
      for (const f of s.get(i.pop()) ?? [])
        o.has(f) || (o.add(f), i.push(f));
    const a = [...o].filter((f) => ![...s.get(f) ?? []].some((r) => o.has(r))).sort(), l = [], h = /* @__PURE__ */ new Set(), p = (f) => {
      if (!h.has(f)) {
        h.add(f), l.push(f);
        for (const r of n.get(f) ?? []) p(r);
      }
    };
    for (const f of a.length > 0 ? a : [e]) p(f);
    return this.activeFilesCache.set(e, l), [...l];
  }
  includeGraph() {
    const e = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map();
    for (const [n, s] of this.files) {
      const o = s.includes.map((i) => this.resolveInclude(n, i.path)).filter((i) => i !== null);
      e.set(n, o);
      for (const i of o) {
        const a = t.get(i) ?? /* @__PURE__ */ new Set();
        a.add(n), t.set(i, a);
      }
    }
    return { edges: e, reverse: t };
  }
  getActiveColors(e) {
    const t = new Set(this.getActiveFiles(e));
    if (t.size === 0) return [];
    const { reverse: n } = this.includeGraph(), s = [...t].filter((a) => ![...n.get(a) ?? []].some((l) => t.has(l))).sort(), o = [], i = (a, l) => {
      if (l.has(a)) return;
      const h = this.files.get(a);
      if (!h) return;
      const p = new Set(l).add(a), f = [
        ...h.colors.map((r, m) => ({
          type: "color",
          line: r.location.line,
          column: r.location.column,
          order: m,
          color: r
        })),
        ...h.includes.map((r, m) => ({
          type: "include",
          line: r.location.line,
          column: r.location.column,
          order: m,
          target: this.resolveInclude(a, r.path)
        }))
      ].sort(
        (r, m) => r.line - m.line || r.column - m.column || r.type.localeCompare(m.type) || r.order - m.order
      );
      for (const r of f)
        r.type === "color" ? o.push(r.color) : r.target && t.has(r.target) && i(r.target, p);
    };
    for (const a of s.length > 0 ? s : [e]) i(a, /* @__PURE__ */ new Set());
    return o;
  }
  getActiveColorNames(e) {
    return new Set(
      this.getActiveFiles(e).flatMap(
        (t) => this.files.get(t)?.colorActivations.flatMap((n) => n.names) ?? []
      )
    );
  }
  getLoadedClasses(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e))
      for (const s of n.classes) t.add(s.name);
    return t;
  }
  getClassOptions(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e))
      for (const s of n.classes)
        for (const o of s.options.split(",")) o.trim() && t.add(o.trim());
    return t;
  }
  getPackageOptions(e, t) {
    const n = /* @__PURE__ */ new Set();
    for (const s of this.symbolsInScope(t))
      for (const o of s.packages)
        if (o.name === e)
          for (const i of o.options.split(",")) i.trim() && n.add(i.trim());
    return n;
  }
  getCommandDefs() {
    return [...this.files.values()].flatMap((e) => e.commands);
  }
  getAllEnvironments() {
    const e = /* @__PURE__ */ new Set();
    for (const t of this.files.values())
      for (const n of t.environments)
        e.add(n.name);
    return [...e];
  }
  /** Names of all packages loaded via `\usepackage`/`\RequirePackage` in the project. */
  getLoadedPackages(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e))
      for (const s of n.packages) t.add(s.name);
    return t;
  }
  symbolsInScope(e) {
    return e ? this.getActiveFiles(e).flatMap((t) => {
      const n = this.files.get(t);
      return n ? [n] : [];
    }) : [...this.files.values()];
  }
  resolveInclude(e, t) {
    const n = t.trim().replaceAll("\\\\", "/");
    if (!n || /[\\#{}]/.test(n)) return null;
    const s = e.split("/").slice(0, -1), o = n.startsWith("/") ? n.slice(1).split("/") : [...s, ...n.split("/")], i = [];
    for (const l of o)
      !l || l === "." || (l === ".." ? i.pop() : i.push(l));
    const a = i.join("/");
    for (const l of /\.[A-Za-z0-9]+$/.test(a) ? [a] : [a, `${a}.tex`])
      if (this.files.has(l)) return l;
    return null;
  }
  getBibEntries() {
    return this.bibEntries;
  }
  getAuxLabels() {
    return this.auxData.labels;
  }
  getAuxCitations() {
    return this.auxData.citations;
  }
  resolveLabel(e) {
    return this.auxData.labels.get(e);
  }
  /** Find the LabelDef for a given label name */
  findLabelDef(e) {
    return this.labelDefIndex.get(e)?.[0];
  }
  updateEngineCommands(e) {
    this.engineCommands = /* @__PURE__ */ new Map();
    const t = /* @__PURE__ */ new Set();
    for (const n of e) {
      const s = w(n);
      C.test(s.name) || (this.engineCommands.set(s.name, s), t.add(s.name));
    }
    for (const [n, s] of this.engineCommands) {
      if (!n.endsWith(" ") || s.argCount <= 0) continue;
      const o = n.trimEnd(), i = this.engineCommands.get(o);
      i && i.argCount <= 0 && (i.argCount = s.argCount);
    }
    this.engineEnvironments = y(t);
  }
  getEngineCommands() {
    return this.engineCommands;
  }
  getEngineEnvironments() {
    return this.engineEnvironments;
  }
  updateSemanticTrace(e) {
    this.semanticTrace = e;
  }
  getSemanticTrace() {
    return this.semanticTrace;
  }
  /** Find the BibitemDef for a given citation key */
  findBibitemDef(e) {
    return this.bibItemIndex.get(e)?.[0];
  }
  /** Find the BibEntry for a given citation key in .bib files */
  findBibEntry(e) {
    return this.bibEntryIndex.get(e)?.[0];
  }
  /** Find the CommandDef for a given command name */
  findCommandDef(e) {
    return this.commandIndex.get(e)?.[0];
  }
  /** Find the Environment definition for a given environment name */
  findEnvironmentDef(e) {
    return this.envDefIndex.get(e)?.[0];
  }
  /** Find the symbol at a given position and its usage locations */
  findSymbolAt(e, t, n) {
    const s = this.files.get(e);
    if (s)
      return this.findLabelAt(s, t, n) || this.findCitationAt(s, t, n) || this.findCommandAt(s, t, n);
  }
  findLabelAt(e, t, n) {
    for (const s of e.labels)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.name.length)
        return { name: s.name, type: "label" };
    for (const s of e.labelRefs)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.name.length)
        return { name: s.name, type: "label" };
  }
  findCitationAt(e, t, n) {
    for (const s of e.citations)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.key.length)
        return { name: s.key, type: "citation" };
    for (const s of e.bibItems)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.key.length)
        return { name: s.key, type: "citation" };
  }
  findCommandAt(e, t, n) {
    for (const s of e.commands)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.name.length)
        return { name: s.name, type: "command" };
    for (const s of e.commandUses)
      if (s.location.line === t && n >= s.location.column && n <= s.location.column + s.name.length && this.commandIndex.has(s.name))
        return { name: s.name, type: "command" };
  }
  /**
   * Find all occurrences of a symbol across the project. O(result) — backed by
   * the inverted indexes, not a full-project scan.
   */
  findAllOccurrences(e, t) {
    return this.occurrenceLocations(e, t).map((s) => ({
      filePath: s.file,
      line: s.line,
      column: s.column,
      length: e.length
    }));
  }
  occurrenceLocations(e, t) {
    return t === "label" ? [...g(this.labelDefIndex.get(e)), ...g(this.labelRefIndex.get(e))] : t === "citation" ? [
      ...g(this.citationIndex.get(e)),
      ...g(this.bibItemIndex.get(e)),
      ...g(this.bibEntryIndex.get(e))
    ] : g(this.commandRefIndex.get(e));
  }
}
function g(c) {
  return (c ?? []).map((e) => e.location);
}
export {
  E as ProjectIndex
};
