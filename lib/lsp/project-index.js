import { boundCompletionSnapshot as S } from "../engine/completion-snapshot.js";
import { parseAuxFile as I } from "./aux-parser.js";
import { parseLatexFile as C } from "./latex-parser.js";
const x = /* @__PURE__ */ new Set(["csname", "group", "input", "linechar", "write"]), F = /[_:]/;
function y(c) {
  return c >= 111 && c <= 118 ? "macro" : c > 0 ? "primitive" : "unknown";
}
function w(c) {
  const e = c.indexOf("	");
  if (e < 0) return { name: c, eqType: -1, argCount: -1, category: "unknown" };
  const t = c.slice(0, e), n = c.slice(e + 1), s = n.indexOf("	");
  if (s < 0) {
    const a = parseInt(n, 10);
    return Number.isNaN(a) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : { name: t, eqType: a, argCount: -1, category: y(a) };
  }
  const o = parseInt(n.slice(0, s), 10), i = parseInt(n.slice(s + 1), 10);
  return Number.isNaN(o) ? { name: t, eqType: -1, argCount: -1, category: "unknown" } : {
    name: t,
    eqType: o,
    argCount: Number.isNaN(i) ? -1 : i,
    category: y(o)
  };
}
function p(c, e, t) {
  for (const n of e) {
    const s = t(n), o = c.get(s);
    o ? o.push(n) : c.set(s, [n]);
  }
}
function g(c, e, t, n) {
  for (const s of new Set(e.map(t))) {
    const o = c.get(s);
    if (!o) continue;
    const i = o.filter((a) => a.location.file !== n);
    i.length ? c.set(s, i) : c.delete(s);
  }
}
function E(c) {
  const e = /* @__PURE__ */ new Set();
  for (const t of c)
    if (t.length > 3 && t.startsWith("end")) {
      const n = t.slice(3);
      !x.has(n) && c.has(n) && e.add(n);
    }
  return e;
}
class L {
  files = /* @__PURE__ */ new Map();
  auxData = { labels: /* @__PURE__ */ new Map(), citations: /* @__PURE__ */ new Set(), includes: [] };
  bibEntries = [];
  bibStrings = [];
  bibFiles = /* @__PURE__ */ new Map();
  legacyBibEntries = [];
  engineCommands = /* @__PURE__ */ new Map();
  engineEnvironments = /* @__PURE__ */ new Set();
  semanticTrace = null;
  completionSnapshot = null;
  completionSnapshotStale = !1;
  runtimeColors = [];
  runtimeValues = /* @__PURE__ */ new Map();
  runtimeKeys = [];
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
    this.invalidateCompletionSnapshot();
    const n = this.files.get(e);
    n && this.removeFromIndexes(e, n);
    const s = C(t, e);
    this.files.set(e, s), this.addToIndexes(s), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
  }
  removeFile(e) {
    this.invalidateCompletionSnapshot();
    const t = this.files.get(e);
    t && this.removeFromIndexes(e, t), this.files.delete(e), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
  }
  addToIndexes(e) {
    p(this.labelDefIndex, e.labels, (t) => t.name), p(this.labelRefIndex, e.labelRefs, (t) => t.name), p(this.citationIndex, e.citations, (t) => t.key), p(this.bibItemIndex, e.bibItems, (t) => t.key), p(this.commandIndex, e.commands, (t) => t.name), p(this.commandRefIndex, e.commandUses, (t) => t.name), p(this.envDefIndex, e.environmentDefs, (t) => t.name);
  }
  removeFromIndexes(e, t) {
    g(this.labelDefIndex, t.labels, (n) => n.name, e), g(this.labelRefIndex, t.labelRefs, (n) => n.name, e), g(this.citationIndex, t.citations, (n) => n.key, e), g(this.bibItemIndex, t.bibItems, (n) => n.key, e), g(this.commandIndex, t.commands, (n) => n.name, e), g(this.commandRefIndex, t.commandUses, (n) => n.name, e), g(this.envDefIndex, t.environmentDefs, (n) => n.name, e);
  }
  updateAux(e) {
    this.auxData = I(e);
  }
  updateBib(e) {
    this.invalidateCompletionSnapshot(), this.bibFiles.clear(), this.legacyBibEntries = e, this.rebuildBibIndexes();
  }
  updateBibFile(e, t) {
    this.invalidateCompletionSnapshot(), this.legacyBibEntries = [], this.bibFiles.set(e, t), this.rebuildBibIndexes();
  }
  removeBibFile(e) {
    this.bibFiles.delete(e) && (this.invalidateCompletionSnapshot(), this.rebuildBibIndexes());
  }
  replaceBibFiles(e) {
    this.invalidateCompletionSnapshot(), this.legacyBibEntries = [], this.bibFiles = new Map(e), this.rebuildBibIndexes();
  }
  rebuildBibIndexes() {
    this.bibEntries = [
      ...this.legacyBibEntries,
      ...[...this.bibFiles.values()].flatMap((e) => e.entries)
    ], this.bibStrings = [...this.bibFiles.values()].flatMap((e) => e.strings), this.bibEntryIndex = /* @__PURE__ */ new Map(), p(this.bibEntryIndex, this.bibEntries, (e) => e.key), this.activeBibFilesCache.clear();
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
      for (const m of s.get(i.pop()) ?? [])
        o.has(m) || (o.add(m), i.push(m));
    const a = [...o].filter((m) => ![...s.get(m) ?? []].some((l) => o.has(l))).sort(), r = [], h = /* @__PURE__ */ new Set(), d = (m) => {
      if (!h.has(m)) {
        h.add(m), r.push(m);
        for (const l of n.get(m) ?? []) d(l);
      }
    };
    for (const m of a.length > 0 ? a : [e]) d(m);
    return this.activeFilesCache.set(e, r), [...r];
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
      ].sort((i, a) => i.location.line - a.location.line || i.location.column - a.location.column).map((i) => i.target).filter((i) => i !== null);
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
    const { reverse: n } = this.includeGraph(), s = [...t].filter((a) => ![...n.get(a) ?? []].some((r) => t.has(r))).sort(), o = [...this.runtimeColors], i = (a, r) => {
      if (r.has(a)) return;
      const h = this.files.get(a);
      if (!h) return;
      const d = new Set(r).add(a), m = [
        ...h.colors.map((l, u) => ({
          type: "color",
          line: l.location.line,
          column: l.location.column,
          order: u,
          color: l
        })),
        ...h.includes.map((l, u) => ({
          type: "include",
          line: l.location.line,
          column: l.location.column,
          order: u,
          target: this.resolveInclude(a, l.path)
        })),
        ...h.packages.map((l, u) => ({
          type: "load",
          line: l.location.line,
          column: l.location.column,
          order: u,
          target: this.resolveLoadedResource(a, l.name, "sty")
        })),
        ...h.classes.map((l, u) => ({
          type: "load",
          line: l.location.line,
          column: l.location.column,
          order: u,
          target: this.resolveLoadedResource(a, l.name, "cls")
        }))
      ].sort(
        (l, u) => l.line - u.line || l.column - u.column || l.type.localeCompare(u.type) || l.order - u.order
      );
      for (const l of m)
        l.type === "color" ? o.push(l.color) : l.target && t.has(l.target) && i(l.target, d);
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
      const a = i.endsWith(`.${n}`) ? i : `${i}.${n}`;
      if (this.files.has(a)) return a;
    }
    return null;
  }
  resolveProjectPath(e, t) {
    const n = t.trim().replaceAll("\\\\", "/");
    if (!n || /[\\#{}]/.test(n)) return null;
    const s = e.split("/").slice(0, -1), o = n.startsWith("/") ? n.slice(1).split("/") : [...s, ...n.split("/")], i = [];
    for (const a of o)
      !a || a === "." || (a === ".." ? i.pop() : i.push(a));
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
      const i = this.bibliographyPathsFromTex(e), a = i.length > 0 ? i : [...this.bibFiles.keys()];
      return this.activeBibFilesCache.set(e, a), [...a];
    }
    if (!e.toLowerCase().endsWith(".bib")) return [...this.bibFiles.keys()];
    const n = /* @__PURE__ */ new Set(), s = [...this.files].filter(
      ([i, a]) => a.bibliographies.some(
        (r) => this.resolveBibliographyRef(i, r.path).includes(e)
      )
    );
    for (const [i] of s) {
      const a = this.bibliographyPathsFromTex(i);
      for (const r of a) n.add(r);
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
    const n = this.itemsInScope(t, (s) => e === "counter" ? s.counters : e === "length" ? s.lengths : e === "glossary" ? s.glossaryEntries : e === "acronym" ? s.acronymEntries : s.fontFamilies);
    return e === "counter" || e === "length" ? [...this.runtimeValues.get(e) ?? [], ...n] : n;
  }
  getProjectKeys(e, t) {
    return [...this.runtimeKeys, ...this.itemsInScope(e, (n) => n.keys)].filter(
      (n) => !t || t.has(n.family)
    );
  }
  itemsInScope(e, t) {
    if (!e || !this.files.has(e))
      return [...this.files.values()].flatMap(t);
    const n = new Set(this.getActiveFiles(e)), { reverse: s } = this.includeGraph(), o = [...n].filter((r) => ![...s.get(r) ?? []].some((h) => n.has(h))).sort(), i = [], a = (r, h) => {
      if (h.has(r)) return;
      const d = this.files.get(r);
      if (!d) return;
      const m = new Set(h).add(r), u = [
        ...t(d).map((f, b) => ({
          type: "item",
          location: f.location,
          order: b,
          item: f
        })),
        ...this.loadEvents(r, d)
      ].sort(
        (f, b) => f.location.line - b.location.line || f.location.column - b.location.column || f.type.localeCompare(b.type) || f.order - b.order
      );
      for (const f of u)
        f.type === "item" ? i.push(f.item) : f.target && n.has(f.target) && a(f.target, m);
    };
    for (const r of o.length > 0 ? o : [e]) a(r, /* @__PURE__ */ new Set());
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
    return t += JSON.stringify(this.legacyBibEntries).length, this.completionSnapshot && (t += JSON.stringify(this.completionSnapshot).length), {
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
    this.completionSnapshot = null, this.completionSnapshotStale = !1, this.runtimeColors = [], this.runtimeValues.clear(), this.runtimeKeys = [];
    const { commands: t, environments: n } = this.parseEngineCommands(e);
    this.engineCommands = t, this.engineEnvironments = n;
  }
  parseEngineCommands(e) {
    const t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Set();
    for (const s of e) {
      const o = w(s);
      F.test(o.name) || (t.set(o.name, o), n.add(o.name));
    }
    for (const [s, o] of t) {
      if (!s.endsWith(" ") || o.argCount <= 0) continue;
      const i = s.trimEnd(), a = t.get(i);
      a && a.argCount <= 0 && (a.argCount = o.argCount);
    }
    return { commands: t, environments: E(n) };
  }
  /** Atomically replace every runtime-observed completion field. */
  updateCompletionSnapshot(e) {
    const t = S(e), n = /* @__PURE__ */ new Map();
    for (const r of t.fields.commands.values)
      n.set(r.name, {
        name: r.name,
        eqType: r.eqType,
        argCount: r.argCount,
        category: y(r.eqType)
      });
    const s = {
      file: `completion-snapshot:${t.identity.projectRevision}`,
      line: 1,
      column: 1
    }, o = /* @__PURE__ */ new Map([
      [
        "counter",
        t.fields.counters.values.map((r) => ({
          name: r.name,
          role: "runtime-observed",
          location: s
        }))
      ],
      [
        "length",
        t.fields.lengths.values.map((r) => ({
          name: r.name,
          role: "runtime-observed",
          location: s
        }))
      ]
    ]), i = t.fields.keyFamilies.values.flatMap(
      (r) => r.keys.map((h) => ({
        family: r.name,
        name: h.name,
        valueType: "free-text",
        location: s,
        provenance: "runtime-observed"
      }))
    ), a = t.fields.colors.values.map((r) => ({
      name: r.name,
      kind: "define",
      location: s,
      provenance: "runtime-observed"
    }));
    this.engineCommands = n, this.engineEnvironments = new Set(
      t.fields.environments.values.map((r) => r.name)
    ), this.runtimeValues = o, this.runtimeKeys = i, this.runtimeColors = a, this.completionSnapshot = t, this.completionSnapshotStale = !1;
  }
  /** Mark observations stale on any project/source topology change. Static/project
   *  declarations stay available, but runtime values are no longer consumed. */
  invalidateCompletionSnapshot() {
    !this.completionSnapshot || this.completionSnapshotStale || (this.completionSnapshotStale = !0, this.engineCommands = /* @__PURE__ */ new Map(), this.engineEnvironments = /* @__PURE__ */ new Set(), this.runtimeColors = [], this.runtimeValues.clear(), this.runtimeKeys = []);
  }
  /** Remove runtime completion evidence when the host changes compile profile. */
  clearCompletionSnapshot() {
    this.completionSnapshot = null, this.completionSnapshotStale = !1, this.engineCommands = /* @__PURE__ */ new Map(), this.engineEnvironments = /* @__PURE__ */ new Set(), this.runtimeColors = [], this.runtimeValues.clear(), this.runtimeKeys = [];
  }
  getCompletionSnapshotState() {
    return this.completionSnapshot ? {
      status: this.completionSnapshotStale ? "stale" : "fresh",
      snapshot: structuredClone(this.completionSnapshot)
    } : { status: "absent" };
  }
  getCompletionSnapshotStatus() {
    return this.completionSnapshot ? this.completionSnapshotStale ? "stale" : "fresh" : "absent";
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
function v(c) {
  return (c ?? []).map((e) => e.location);
}
export {
  L as ProjectIndex
};
