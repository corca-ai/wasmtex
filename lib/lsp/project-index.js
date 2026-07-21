import { parseAuxFile as d } from "./aux-parser.js";
import { parseLatexFile as u } from "./latex-parser.js";
const h = /* @__PURE__ */ new Set(["csname", "group", "input", "linechar", "write"]), g = /[_:]/;
function f(a) {
  return a >= 111 && a <= 118 ? "macro" : a > 0 ? "primitive" : "unknown";
}
function b(a) {
  const e = a.indexOf("	");
  if (e < 0) return { name: a, eqType: -1, argCount: -1, category: "unknown" };
  const t = a.slice(0, e), i = a.slice(e + 1), n = i.indexOf("	");
  if (n < 0) {
    const m = parseInt(i, 10);
    return Number.isNaN(m) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : { name: t, eqType: m, argCount: -1, category: f(m) };
  }
  const s = parseInt(i.slice(0, n), 10), o = parseInt(i.slice(n + 1), 10);
  return Number.isNaN(s) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : {
    name: t,
    eqType: s,
    argCount: Number.isNaN(o) ? -1 : o,
    category: f(s)
  };
}
function r(a, e, t) {
  for (const i of e) {
    const n = t(i), s = a.get(n);
    s ? s.push(i) : a.set(n, [i]);
  }
}
function c(a, e, t, i) {
  for (const n of new Set(e.map(t))) {
    const s = a.get(n);
    if (!s) continue;
    const o = s.filter((m) => m.location.file !== i);
    o.length ? a.set(n, o) : a.delete(n);
  }
}
function I(a) {
  const e = /* @__PURE__ */ new Set();
  for (const t of a)
    if (t.length > 3 && t.startsWith("end")) {
      const i = t.slice(3);
      !h.has(i) && a.has(i) && e.add(i);
    }
  return e;
}
class v {
  files = /* @__PURE__ */ new Map();
  auxData = { labels: /* @__PURE__ */ new Map(), citations: /* @__PURE__ */ new Set(), includes: [] };
  bibEntries = [];
  engineCommands = /* @__PURE__ */ new Map();
  engineEnvironments = /* @__PURE__ */ new Set();
  semanticTrace = null;
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
    const i = this.files.get(e);
    i && this.removeFromIndexes(e, i);
    const n = u(t, e);
    this.files.set(e, n), this.addToIndexes(n), this.allLabelsCache = null;
  }
  removeFile(e) {
    const t = this.files.get(e);
    t && this.removeFromIndexes(e, t), this.files.delete(e), this.allLabelsCache = null;
  }
  addToIndexes(e) {
    r(this.labelDefIndex, e.labels, (t) => t.name), r(this.labelRefIndex, e.labelRefs, (t) => t.name), r(this.citationIndex, e.citations, (t) => t.key), r(this.bibItemIndex, e.bibItems, (t) => t.key), r(this.commandIndex, e.commands, (t) => t.name), r(this.commandRefIndex, e.commandUses, (t) => t.name), r(this.envDefIndex, e.environmentDefs, (t) => t.name);
  }
  removeFromIndexes(e, t) {
    c(this.labelDefIndex, t.labels, (i) => i.name, e), c(this.labelRefIndex, t.labelRefs, (i) => i.name, e), c(this.citationIndex, t.citations, (i) => i.key, e), c(this.bibItemIndex, t.bibItems, (i) => i.key, e), c(this.commandIndex, t.commands, (i) => i.name, e), c(this.commandRefIndex, t.commandUses, (i) => i.name, e), c(this.envDefIndex, t.environmentDefs, (i) => i.name, e);
  }
  updateAux(e) {
    this.auxData = d(e);
  }
  updateBib(e) {
    this.bibEntries = e, this.bibEntryIndex = /* @__PURE__ */ new Map(), r(this.bibEntryIndex, e, (t) => t.key);
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
  getCommandDefs() {
    return [...this.files.values()].flatMap((e) => e.commands);
  }
  getAllEnvironments() {
    const e = /* @__PURE__ */ new Set();
    for (const t of this.files.values())
      for (const i of t.environments)
        e.add(i.name);
    return [...e];
  }
  /** Names of all packages loaded via `\usepackage`/`\RequirePackage` in the project. */
  getLoadedPackages() {
    const e = /* @__PURE__ */ new Set();
    for (const t of this.files.values())
      for (const i of t.packages) e.add(i.name);
    return e;
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
    for (const i of e) {
      const n = b(i);
      g.test(n.name) || (this.engineCommands.set(n.name, n), t.add(n.name));
    }
    for (const [i, n] of this.engineCommands) {
      if (!i.endsWith(" ") || n.argCount <= 0) continue;
      const s = i.trimEnd(), o = this.engineCommands.get(s);
      o && o.argCount <= 0 && (o.argCount = n.argCount);
    }
    this.engineEnvironments = I(t);
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
  findSymbolAt(e, t, i) {
    const n = this.files.get(e);
    if (n)
      return this.findLabelAt(n, t, i) || this.findCitationAt(n, t, i) || this.findCommandAt(n, t, i);
  }
  findLabelAt(e, t, i) {
    for (const n of e.labels)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.name.length)
        return { name: n.name, type: "label" };
    for (const n of e.labelRefs)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.name.length)
        return { name: n.name, type: "label" };
  }
  findCitationAt(e, t, i) {
    for (const n of e.citations)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.key.length)
        return { name: n.key, type: "citation" };
    for (const n of e.bibItems)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.key.length)
        return { name: n.key, type: "citation" };
  }
  findCommandAt(e, t, i) {
    for (const n of e.commands)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.name.length)
        return { name: n.name, type: "command" };
    for (const n of e.commandUses)
      if (n.location.line === t && i >= n.location.column && i <= n.location.column + n.name.length && this.commandIndex.has(n.name))
        return { name: n.name, type: "command" };
  }
  /**
   * Find all occurrences of a symbol across the project. O(result) — backed by
   * the inverted indexes, not a full-project scan.
   */
  findAllOccurrences(e, t) {
    return this.occurrenceLocations(e, t).map((n) => ({
      filePath: n.file,
      line: n.line,
      column: n.column,
      length: e.length
    }));
  }
  occurrenceLocations(e, t) {
    return t === "label" ? [...l(this.labelDefIndex.get(e)), ...l(this.labelRefIndex.get(e))] : t === "citation" ? [
      ...l(this.citationIndex.get(e)),
      ...l(this.bibItemIndex.get(e)),
      ...l(this.bibEntryIndex.get(e))
    ] : l(this.commandRefIndex.get(e));
  }
}
function l(a) {
  return (a ?? []).map((e) => e.location);
}
export {
  v as ProjectIndex
};
