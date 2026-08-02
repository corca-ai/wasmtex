import { parseAuxFile as I } from "./aux-parser.js";
import { parseLatexFile as x } from "./latex-parser.js";
const F = /* @__PURE__ */ new Set(["csname", "group", "input", "linechar", "write"]), C = /[_:]/;
function y(l) {
  return l >= 111 && l <= 118 ? "macro" : l > 0 ? "primitive" : "unknown";
}
function S(l) {
  const e = l.indexOf("	");
  if (e < 0) return { name: l, eqType: -1, argCount: -1, category: "unknown" };
  const t = l.slice(0, e), n = l.slice(e + 1), s = n.indexOf("	");
  if (s < 0) {
    const r = parseInt(n, 10);
    return Number.isNaN(r) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : { name: t, eqType: r, argCount: -1, category: y(r) };
  }
  const o = parseInt(n.slice(0, s), 10), i = parseInt(n.slice(s + 1), 10);
  return Number.isNaN(o) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : {
    name: t,
    eqType: o,
    argCount: Number.isNaN(i) ? -1 : i,
    category: y(o)
  };
}
function b(l, e, t) {
  for (const n of e) {
    const s = t(n), o = l.get(s);
    o ? o.push(n) : l.set(s, [n]);
  }
}
function g(l, e, t, n) {
  for (const s of new Set(e.map(t))) {
    const o = l.get(s);
    if (!o) continue;
    const i = o.filter((r) => r.location.file !== n);
    i.length ? l.set(s, i) : l.delete(s);
  }
}
function w(l) {
  const e = /* @__PURE__ */ new Set();
  for (const t of l)
    if (t.length > 3 && t.startsWith("end")) {
      const n = t.slice(3);
      !F.has(n) && l.has(n) && e.add(n);
    }
  return e;
}
class A {
  files = /* @__PURE__ */ new Map();
  auxData = { labels: /* @__PURE__ */ new Map(), citations: /* @__PURE__ */ new Set(), includes: [] };
  bibEntries = [];
  bibStrings = [];
  bibFiles = /* @__PURE__ */ new Map();
  legacyBibEntries = [];
  engineCommands = /* @__PURE__ */ new Map();
  engineEnvironments = /* @__PURE__ */ new Set();
  semanticTrace = null;
  activeFilesCache = /* @__PURE__ */ new Map();
  activeBibFilesCache = /* @__PURE__ */ new Map();
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
    const s = x(t, e);
    this.files.set(e, s), this.addToIndexes(s), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
  }
  removeFile(e) {
    const t = this.files.get(e);
    t && this.removeFromIndexes(e, t), this.files.delete(e), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
  }
  addToIndexes(e) {
    b(this.labelDefIndex, e.labels, (t) => t.name), b(this.labelRefIndex, e.labelRefs, (t) => t.name), b(this.citationIndex, e.citations, (t) => t.key), b(this.bibItemIndex, e.bibItems, (t) => t.key), b(this.commandIndex, e.commands, (t) => t.name), b(this.commandRefIndex, e.commandUses, (t) => t.name), b(this.envDefIndex, e.environmentDefs, (t) => t.name);
  }
  removeFromIndexes(e, t) {
    g(this.labelDefIndex, t.labels, (n) => n.name, e), g(this.labelRefIndex, t.labelRefs, (n) => n.name, e), g(this.citationIndex, t.citations, (n) => n.key, e), g(this.bibItemIndex, t.bibItems, (n) => n.key, e), g(this.commandIndex, t.commands, (n) => n.name, e), g(this.commandRefIndex, t.commandUses, (n) => n.name, e), g(this.envDefIndex, t.environmentDefs, (n) => n.name, e);
  }
  updateAux(e) {
    this.auxData = I(e);
  }
  updateBib(e) {
    this.bibFiles.clear(), this.legacyBibEntries = e, this.rebuildBibIndexes();
  }
  updateBibFile(e, t) {
    this.legacyBibEntries = [], this.bibFiles.set(e, t), this.rebuildBibIndexes();
  }
  removeBibFile(e) {
    this.bibFiles.delete(e) && this.rebuildBibIndexes();
  }
  replaceBibFiles(e) {
    this.legacyBibEntries = [], this.bibFiles = new Map(e), this.rebuildBibIndexes();
  }
  rebuildBibIndexes() {
    this.bibEntries = [
      ...this.legacyBibEntries,
      ...[...this.bibFiles.values()].flatMap((e) => e.entries)
    ], this.bibStrings = [...this.bibFiles.values()].flatMap((e) => e.strings), this.bibEntryIndex = /* @__PURE__ */ new Map(), b(this.bibEntryIndex, this.bibEntries, (e) => e.key), this.activeBibFilesCache.clear();
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
  getAllLabels(e) {
    return e ? this.symbolsInScope(e).flatMap((t) => t.labels) : (this.allLabelsCache || (this.allLabelsCache = [...this.files.values()].flatMap((t) => t.labels)), this.allLabelsCache);
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
    const r = [...o].filter((f) => ![...s.get(f) ?? []].some((a) => o.has(a))).sort(), c = [], u = /* @__PURE__ */ new Set(), d = (f) => {
      if (!u.has(f)) {
        u.add(f), c.push(f);
        for (const a of n.get(f) ?? []) d(a);
      }
    };
    for (const f of r.length > 0 ? r : [e]) d(f);
    return this.activeFilesCache.set(e, c), [...c];
  }
  includeGraph() {
    const e = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map();
    for (const [n, s] of this.files) {
      const o = [
        ...s.includes.map((i) => ({
          target: this.resolveInclude(n, i.path),
          location: i.location
        })),
        ...s.packages.map((i) => ({
          target: this.resolveLoadedResource(n, i.name, "sty"),
          location: i.location
        })),
        ...s.classes.map((i) => ({
          target: this.resolveLoadedResource(n, i.name, "cls"),
          location: i.location
        }))
      ].sort((i, r) => i.location.line - r.location.line || i.location.column - r.location.column).map((i) => i.target).filter((i) => i !== null);
      e.set(n, o);
      for (const i of o) {
        const r = t.get(i) ?? /* @__PURE__ */ new Set();
        r.add(n), t.set(i, r);
      }
    }
    return { edges: e, reverse: t };
  }
  getActiveColors(e) {
    const t = new Set(this.getActiveFiles(e));
    if (t.size === 0) return [];
    const { reverse: n } = this.includeGraph(), s = [...t].filter((r) => ![...n.get(r) ?? []].some((c) => t.has(c))).sort(), o = [], i = (r, c) => {
      if (c.has(r)) return;
      const u = this.files.get(r);
      if (!u) return;
      const d = new Set(c).add(r), f = [
        ...u.colors.map((a, h) => ({
          type: "color",
          line: a.location.line,
          column: a.location.column,
          order: h,
          color: a
        })),
        ...u.includes.map((a, h) => ({
          type: "include",
          line: a.location.line,
          column: a.location.column,
          order: h,
          target: this.resolveInclude(r, a.path)
        })),
        ...u.packages.map((a, h) => ({
          type: "load",
          line: a.location.line,
          column: a.location.column,
          order: h,
          target: this.resolveLoadedResource(r, a.name, "sty")
        })),
        ...u.classes.map((a, h) => ({
          type: "load",
          line: a.location.line,
          column: a.location.column,
          order: h,
          target: this.resolveLoadedResource(r, a.name, "cls")
        }))
      ].sort(
        (a, h) => a.line - h.line || a.column - h.column || a.type.localeCompare(h.type) || a.order - h.order
      );
      for (const a of f)
        a.type === "color" ? o.push(a.color) : a.target && t.has(a.target) && i(a.target, d);
    };
    for (const r of s.length > 0 ? s : [e]) i(r, /* @__PURE__ */ new Set());
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
  getCommandDefs(e) {
    return this.itemsInScope(e, (t) => t.commands);
  }
  getAllEnvironments(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e)) {
      for (const s of n.environmentDefs) t.add(s.name);
      for (const s of n.environments)
        t.add(s.name);
    }
    return [...t];
  }
  getEnvironmentDefinitions(e) {
    return this.itemsInScope(e, (t) => t.environmentDefs);
  }
  /** Names of all packages loaded via `\usepackage`/`\RequirePackage` in the project. */
  getLoadedPackages(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e))
      for (const s of n.packages) t.add(s.name);
    return t;
  }
  symbolsInScope(e) {
    return e && this.files.has(e) ? this.getActiveFiles(e).flatMap((t) => {
      const n = this.files.get(t);
      return n ? [n] : [];
    }) : [...this.files.values()];
  }
  resolveInclude(e, t) {
    const n = this.resolveProjectPath(e, t);
    if (!n) return null;
    for (const s of /\.[A-Za-z0-9]+$/.test(n) ? [n] : [n, `${n}.tex`])
      if (this.files.has(s)) return s;
    return null;
  }
  resolveLoadedResource(e, t, n) {
    const s = this.resolveProjectPath(e, t), o = this.resolveProjectPath("", t);
    for (const i of [s, o]) {
      if (!i) continue;
      const r = i.endsWith(`.${n}`) ? i : `${i}.${n}`;
      if (this.files.has(r)) return r;
    }
    return null;
  }
  resolveProjectPath(e, t) {
    const n = t.trim().replaceAll("\\\\", "/");
    if (!n || /[\\#{}]/.test(n)) return null;
    const s = e.split("/").slice(0, -1), o = n.startsWith("/") ? n.slice(1).split("/") : [...s, ...n.split("/")], i = [];
    for (const r of o)
      !r || r === "." || (r === ".." ? i.pop() : i.push(r));
    return i.join("/");
  }
  bibliographyPathsFromTex(e) {
    const t = /* @__PURE__ */ new Set();
    for (const n of this.symbolsInScope(e))
      for (const s of n.bibliographies)
        for (const o of this.resolveBibliographyRef(s.location.file, s.path)) t.add(o);
    return [...t];
  }
  resolveBibliographyRef(e, t) {
    const n = this.resolveProjectPath(e, t);
    return n ? (/\.[A-Za-z0-9]+$/.test(n) ? [n] : [n, `${n}.bib`]).filter((o) => this.bibFiles.has(o)) : [];
  }
  getActiveBibFiles(e) {
    if (!e || this.bibFiles.size === 0) return [...this.bibFiles.keys()];
    const t = this.activeBibFilesCache.get(e);
    if (t) return [...t];
    if (/\.(?:tex|sty|cls|ltx)$/i.test(e)) {
      const i = this.bibliographyPathsFromTex(e), r = i.length > 0 ? i : [...this.bibFiles.keys()];
      return this.activeBibFilesCache.set(e, r), [...r];
    }
    if (!e.toLowerCase().endsWith(".bib")) return [...this.bibFiles.keys()];
    const n = /* @__PURE__ */ new Set(), s = [...this.files].filter(
      ([i, r]) => r.bibliographies.some(
        (c) => this.resolveBibliographyRef(i, c.path).includes(e)
      )
    );
    for (const [i] of s) {
      const r = this.bibliographyPathsFromTex(i);
      for (const c of r) n.add(c);
    }
    const o = n.size > 0 ? [...n] : [...this.bibFiles.keys()];
    return this.activeBibFilesCache.set(e, o), [...o];
  }
  getBibEntries(e) {
    return !e || this.bibFiles.size === 0 ? [...this.bibEntries] : this.getActiveBibFiles(e).flatMap(
      (t) => this.bibFiles.get(t)?.entries ?? []
    );
  }
  getBibStrings(e) {
    return e ? this.getActiveBibFiles(e).flatMap(
      (t) => this.bibFiles.get(t)?.strings ?? []
    ) : [...this.bibStrings];
  }
  getProjectValues(e, t) {
    return this.itemsInScope(t, (n) => e === "counter" ? n.counters : e === "length" ? n.lengths : e === "glossary" ? n.glossaryEntries : e === "acronym" ? n.acronymEntries : n.fontFamilies);
  }
  getProjectKeys(e, t) {
    return this.itemsInScope(e, (n) => n.keys).filter(
      (n) => !t || t.has(n.family)
    );
  }
  itemsInScope(e, t) {
    if (!e || !this.files.has(e))
      return [...this.files.values()].flatMap(t);
    const n = new Set(this.getActiveFiles(e)), { reverse: s } = this.includeGraph(), o = [...n].filter((c) => ![...s.get(c) ?? []].some((u) => n.has(u))).sort(), i = [], r = (c, u) => {
      if (u.has(c)) return;
      const d = this.files.get(c);
      if (!d) return;
      const f = new Set(u).add(c), h = [
        ...t(d).map((m, p) => ({
          type: "item",
          location: m.location,
          order: p,
          item: m
        })),
        ...this.loadEvents(c, d)
      ].sort(
        (m, p) => m.location.line - p.location.line || m.location.column - p.location.column || m.type.localeCompare(p.type) || m.order - p.order
      );
      for (const m of h)
        m.type === "item" ? i.push(m.item) : m.target && n.has(m.target) && r(m.target, f);
    };
    for (const c of o.length > 0 ? o : [e]) r(c, /* @__PURE__ */ new Set());
    return i;
  }
  loadEvents(e, t) {
    return [
      ...t.includes.map((n, s) => ({
        type: "load",
        location: n.location,
        order: s,
        target: this.resolveInclude(e, n.path)
      })),
      ...t.packages.map((n, s) => ({
        type: "load",
        location: n.location,
        order: s,
        target: this.resolveLoadedResource(e, n.name, "sty")
      })),
      ...t.classes.map((n, s) => ({
        type: "load",
        location: n.location,
        order: s,
        target: this.resolveLoadedResource(e, n.name, "cls")
      }))
    ];
  }
  getStats() {
    let e = 0, t = 0;
    for (const [n, s] of this.files) {
      t += n.length + JSON.stringify(s).length;
      for (const o of Object.values(s)) e += o.length;
    }
    for (const [n, s] of this.bibFiles)
      t += n.length + JSON.stringify(s).length;
    return t += JSON.stringify(this.legacyBibEntries).length, {
      sourceFiles: this.files.size,
      bibliographyFiles: this.bibFiles.size,
      latexSymbols: e,
      bibliographyEntries: this.bibEntries.length,
      bibliographyStrings: this.bibStrings.length,
      estimatedBytes: t * 2
    };
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
      const s = S(n);
      C.test(s.name) || (this.engineCommands.set(s.name, s), t.add(s.name));
    }
    for (const [n, s] of this.engineCommands) {
      if (!n.endsWith(" ") || s.argCount <= 0) continue;
      const o = n.trimEnd(), i = this.engineCommands.get(o);
      i && i.argCount <= 0 && (i.argCount = s.argCount);
    }
    this.engineEnvironments = w(t);
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
    return t === "label" ? [...v(this.labelDefIndex.get(e)), ...v(this.labelRefIndex.get(e))] : t === "citation" ? [
      ...v(this.citationIndex.get(e)),
      ...v(this.bibItemIndex.get(e)),
      ...v(this.bibEntryIndex.get(e))
    ] : v(this.commandRefIndex.get(e));
  }
}
function v(l) {
  return (l ?? []).map((e) => e.location);
}
export {
  A as ProjectIndex
};
