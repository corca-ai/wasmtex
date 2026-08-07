import { boundCompletionSnapshot as e } from "../engine/completion-snapshot.js";
import { parseLatexFile as t } from "./latex-parser.js";
import { parseAuxFile as n } from "./aux-parser.js";
//#region src/lsp/project-index.ts
var r = /* @__PURE__ */ new Set([
	"csname",
	"group",
	"input",
	"linechar",
	"write"
]), i = /[_:]/;
function a(e) {
	return e >= 111 && e <= 118 ? "macro" : e > 0 ? "primitive" : "unknown";
}
function o(e) {
	let t = e.indexOf("	");
	if (t < 0) return {
		name: e,
		eqType: -1,
		argCount: -1,
		category: "unknown"
	};
	let n = e.slice(0, t), r = e.slice(t + 1), i = r.indexOf("	");
	if (i < 0) {
		let e = parseInt(r, 10);
		return Number.isNaN(e) ? {
			name: n,
			eqType: -1,
			argCount: -1,
			category: "unknown"
		} : {
			name: n,
			eqType: e,
			argCount: -1,
			category: a(e)
		};
	}
	let o = parseInt(r.slice(0, i), 10), s = parseInt(r.slice(i + 1), 10);
	return Number.isNaN(o) ? {
		name: n,
		eqType: -1,
		argCount: -1,
		category: "unknown"
	} : {
		name: n,
		eqType: o,
		argCount: Number.isNaN(s) ? -1 : s,
		category: a(o)
	};
}
function s(e, t, n) {
	for (let r of t) {
		let t = n(r), i = e.get(t);
		i ? i.push(r) : e.set(t, [r]);
	}
}
function c(e, t, n, r) {
	for (let i of new Set(t.map(n))) {
		let t = e.get(i);
		if (!t) continue;
		let n = t.filter((e) => e.location.file !== r);
		n.length ? e.set(i, n) : e.delete(i);
	}
}
function l(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) if (n.length > 3 && n.startsWith("end")) {
		let i = n.slice(3);
		!r.has(i) && e.has(i) && t.add(i);
	}
	return t;
}
var u = class {
	files = /* @__PURE__ */ new Map();
	auxData = {
		labels: /* @__PURE__ */ new Map(),
		citations: /* @__PURE__ */ new Set(),
		includes: []
	};
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
	labelDefIndex = /* @__PURE__ */ new Map();
	labelRefIndex = /* @__PURE__ */ new Map();
	citationIndex = /* @__PURE__ */ new Map();
	bibItemIndex = /* @__PURE__ */ new Map();
	commandIndex = /* @__PURE__ */ new Map();
	commandRefIndex = /* @__PURE__ */ new Map();
	envDefIndex = /* @__PURE__ */ new Map();
	bibEntryIndex = /* @__PURE__ */ new Map();
	allLabelsCache = null;
	updateFile(e, n) {
		this.updateFileSymbols(e, t(n, e));
	}
	updateFileSymbols(e, t) {
		this.invalidateCompletionSnapshot();
		let n = this.files.get(e);
		n && this.removeFromIndexes(e, n), this.files.set(e, t), this.addToIndexes(t), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
	}
	removeFile(e) {
		this.invalidateCompletionSnapshot();
		let t = this.files.get(e);
		t && this.removeFromIndexes(e, t), this.files.delete(e), this.allLabelsCache = null, this.activeFilesCache.clear(), this.activeBibFilesCache.clear();
	}
	addToIndexes(e) {
		s(this.labelDefIndex, e.labels, (e) => e.name), s(this.labelRefIndex, e.labelRefs, (e) => e.name), s(this.citationIndex, e.citations, (e) => e.key), s(this.bibItemIndex, e.bibItems, (e) => e.key), s(this.commandIndex, e.commands, (e) => e.name), s(this.commandRefIndex, e.commandUses, (e) => e.name), s(this.envDefIndex, e.environmentDefs, (e) => e.name);
	}
	removeFromIndexes(e, t) {
		c(this.labelDefIndex, t.labels, (e) => e.name, e), c(this.labelRefIndex, t.labelRefs, (e) => e.name, e), c(this.citationIndex, t.citations, (e) => e.key, e), c(this.bibItemIndex, t.bibItems, (e) => e.key, e), c(this.commandIndex, t.commands, (e) => e.name, e), c(this.commandRefIndex, t.commandUses, (e) => e.name, e), c(this.envDefIndex, t.environmentDefs, (e) => e.name, e);
	}
	updateAux(e) {
		this.auxData = n(e);
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
		this.bibEntries = [...this.legacyBibEntries, ...[...this.bibFiles.values()].flatMap((e) => e.entries)], this.bibStrings = [...this.bibFiles.values()].flatMap((e) => e.strings), this.bibEntryIndex = /* @__PURE__ */ new Map(), s(this.bibEntryIndex, this.bibEntries, (e) => e.key), this.activeBibFilesCache.clear();
	}
	updateAuxData(e) {
		this.auxData = e;
	}
	getFiles() {
		return [...this.files.keys()];
	}
	hasFile(e) {
		return this.files.has(e);
	}
	getAllLabels(e) {
		return e ? this.symbolsInScope(e).flatMap((e) => e.labels) : (this.allLabelsCache ||= [...this.files.values()].flatMap((e) => e.labels), this.allLabelsCache);
	}
	getAllLabelRefs(e) {
		return [...this.labelRefIndex.get(e) ?? []];
	}
	getFileSymbols(e) {
		return this.files.get(e);
	}
	getActiveFiles(e) {
		if (!this.files.has(e)) return [];
		let t = this.activeFilesCache.get(e);
		if (t) return [...t];
		let { edges: n, reverse: r } = this.includeGraph(), i = /* @__PURE__ */ new Set([e]), a = [e];
		for (; a.length > 0;) for (let e of r.get(a.pop()) ?? []) i.has(e) || (i.add(e), a.push(e));
		let o = [...i].filter((e) => ![...r.get(e) ?? []].some((e) => i.has(e))).sort(), s = [], c = /* @__PURE__ */ new Set(), l = (e) => {
			if (!c.has(e)) {
				c.add(e), s.push(e);
				for (let t of n.get(e) ?? []) l(t);
			}
		};
		for (let t of o.length > 0 ? o : [e]) l(t);
		return this.activeFilesCache.set(e, s), [...s];
	}
	includeGraph() {
		let e = /* @__PURE__ */ new Map(), t = /* @__PURE__ */ new Map();
		for (let [n, r] of this.files) {
			let i = [
				...r.includes.map((e) => ({
					target: this.resolveInclude(n, e.path),
					location: e.location
				})),
				...r.packages.map((e) => ({
					target: this.resolveLoadedResource(n, e.name, "sty"),
					location: e.location
				})),
				...r.classes.map((e) => ({
					target: this.resolveLoadedResource(n, e.name, "cls"),
					location: e.location
				}))
			].sort((e, t) => e.location.line - t.location.line || e.location.column - t.location.column).map((e) => e.target).filter((e) => e !== null);
			e.set(n, i);
			for (let e of i) {
				let r = t.get(e) ?? /* @__PURE__ */ new Set();
				r.add(n), t.set(e, r);
			}
		}
		return {
			edges: e,
			reverse: t
		};
	}
	getActiveColors(e) {
		let t = new Set(this.getActiveFiles(e));
		if (t.size === 0) return [];
		let { reverse: n } = this.includeGraph(), r = [...t].filter((e) => ![...n.get(e) ?? []].some((e) => t.has(e))).sort(), i = [...this.runtimeColors], a = (e, n) => {
			if (n.has(e)) return;
			let r = this.files.get(e);
			if (!r) return;
			let o = new Set(n).add(e), s = [
				...r.colors.map((e, t) => ({
					type: "color",
					line: e.location.line,
					column: e.location.column,
					order: t,
					color: e
				})),
				...r.includes.map((t, n) => ({
					type: "include",
					line: t.location.line,
					column: t.location.column,
					order: n,
					target: this.resolveInclude(e, t.path)
				})),
				...r.packages.map((t, n) => ({
					type: "load",
					line: t.location.line,
					column: t.location.column,
					order: n,
					target: this.resolveLoadedResource(e, t.name, "sty")
				})),
				...r.classes.map((t, n) => ({
					type: "load",
					line: t.location.line,
					column: t.location.column,
					order: n,
					target: this.resolveLoadedResource(e, t.name, "cls")
				}))
			].sort((e, t) => e.line - t.line || e.column - t.column || e.type.localeCompare(t.type) || e.order - t.order);
			for (let e of s) e.type === "color" ? i.push(e.color) : e.target && t.has(e.target) && a(e.target, o);
		};
		for (let t of r.length > 0 ? r : [e]) a(t, /* @__PURE__ */ new Set());
		return i;
	}
	getActiveColorNames(e) {
		return new Set(this.getActiveFiles(e).flatMap((e) => this.files.get(e)?.colorActivations.flatMap((e) => e.names) ?? []));
	}
	getLoadedClasses(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of this.symbolsInScope(e)) for (let e of n.classes) t.add(e.name);
		return t;
	}
	getClassOptions(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of this.symbolsInScope(e)) for (let e of n.classes) for (let n of e.options.split(",")) n.trim() && t.add(n.trim());
		return t;
	}
	getPackageOptions(e, t) {
		let n = /* @__PURE__ */ new Set();
		for (let r of this.symbolsInScope(t)) for (let t of r.packages) if (t.name === e) for (let e of t.options.split(",")) e.trim() && n.add(e.trim());
		return n;
	}
	getCommandDefs(e) {
		return this.itemsInScope(e, (e) => e.commands);
	}
	getAllEnvironments(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of this.symbolsInScope(e)) {
			for (let e of n.environmentDefs) t.add(e.name);
			for (let e of n.environments) t.add(e.name);
		}
		return [...t];
	}
	getEnvironmentDefinitions(e) {
		return this.itemsInScope(e, (e) => e.environmentDefs);
	}
	getLoadedPackages(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of this.symbolsInScope(e)) for (let e of n.packages) t.add(e.name);
		return t;
	}
	symbolsInScope(e) {
		return e && this.files.has(e) ? this.getActiveFiles(e).flatMap((e) => {
			let t = this.files.get(e);
			return t ? [t] : [];
		}) : [...this.files.values()];
	}
	resolveInclude(e, t) {
		let n = this.resolveProjectPath(e, t);
		if (!n) return null;
		for (let e of /\.[A-Za-z0-9]+$/.test(n) ? [n] : [n, `${n}.tex`]) if (this.files.has(e)) return e;
		return null;
	}
	resolveLoadedResource(e, t, n) {
		let r = this.resolveProjectPath(e, t), i = this.resolveProjectPath("", t);
		for (let e of [r, i]) {
			if (!e) continue;
			let t = e.endsWith(`.${n}`) ? e : `${e}.${n}`;
			if (this.files.has(t)) return t;
		}
		return null;
	}
	resolveProjectPath(e, t) {
		let n = t.trim().replaceAll("\\\\", "/");
		if (!n || /[\\#{}]/.test(n)) return null;
		let r = e.split("/").slice(0, -1), i = n.startsWith("/") ? n.slice(1).split("/") : [...r, ...n.split("/")], a = [];
		for (let e of i) !e || e === "." || (e === ".." ? a.pop() : a.push(e));
		return a.join("/");
	}
	bibliographyPathsFromTex(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of this.symbolsInScope(e)) for (let e of n.bibliographies) for (let n of this.resolveBibliographyRef(e.location.file, e.path)) t.add(n);
		return [...t];
	}
	resolveBibliographyRef(e, t) {
		let n = this.resolveProjectPath(e, t);
		return n ? (/\.[A-Za-z0-9]+$/.test(n) ? [n] : [n, `${n}.bib`]).filter((e) => this.bibFiles.has(e)) : [];
	}
	getActiveBibFiles(e) {
		if (!e || this.bibFiles.size === 0) return [...this.bibFiles.keys()];
		let t = this.activeBibFilesCache.get(e);
		if (t) return [...t];
		if (/\.(?:tex|sty|cls|ltx)$/i.test(e)) {
			let t = this.bibliographyPathsFromTex(e), n = t.length > 0 ? t : [...this.bibFiles.keys()];
			return this.activeBibFilesCache.set(e, n), [...n];
		}
		if (!e.toLowerCase().endsWith(".bib")) return [...this.bibFiles.keys()];
		let n = /* @__PURE__ */ new Set(), r = [...this.files].filter(([t, n]) => n.bibliographies.some((n) => this.resolveBibliographyRef(t, n.path).includes(e)));
		for (let [e] of r) {
			let t = this.bibliographyPathsFromTex(e);
			for (let e of t) n.add(e);
		}
		let i = n.size > 0 ? [...n] : [...this.bibFiles.keys()];
		return this.activeBibFilesCache.set(e, i), [...i];
	}
	getBibEntries(e) {
		return !e || this.bibFiles.size === 0 ? [...this.bibEntries] : this.getActiveBibFiles(e).flatMap((e) => this.bibFiles.get(e)?.entries ?? []);
	}
	getBibStrings(e) {
		return e ? this.getActiveBibFiles(e).flatMap((e) => this.bibFiles.get(e)?.strings ?? []) : [...this.bibStrings];
	}
	getProjectValues(e, t) {
		let n = this.itemsInScope(t, (t) => e === "counter" ? t.counters : e === "length" ? t.lengths : e === "glossary" ? t.glossaryEntries : e === "acronym" ? t.acronymEntries : t.fontFamilies);
		return e === "counter" || e === "length" ? [...this.runtimeValues.get(e) ?? [], ...n] : n;
	}
	getProjectKeys(e, t) {
		return [...this.runtimeKeys, ...this.itemsInScope(e, (e) => e.keys)].filter((e) => !t || t.has(e.family));
	}
	itemsInScope(e, t) {
		if (!e || !this.files.has(e)) return [...this.files.values()].flatMap(t);
		let n = new Set(this.getActiveFiles(e)), { reverse: r } = this.includeGraph(), i = [...n].filter((e) => ![...r.get(e) ?? []].some((e) => n.has(e))).sort(), a = [], o = (e, r) => {
			if (r.has(e)) return;
			let i = this.files.get(e);
			if (!i) return;
			let s = new Set(r).add(e), c = [...t(i).map((e, t) => ({
				type: "item",
				location: e.location,
				order: t,
				item: e
			})), ...this.loadEvents(e, i)].sort((e, t) => e.location.line - t.location.line || e.location.column - t.location.column || e.type.localeCompare(t.type) || e.order - t.order);
			for (let e of c) e.type === "item" ? a.push(e.item) : e.target && n.has(e.target) && o(e.target, s);
		};
		for (let t of i.length > 0 ? i : [e]) o(t, /* @__PURE__ */ new Set());
		return a;
	}
	loadEvents(e, t) {
		return [
			...t.includes.map((t, n) => ({
				type: "load",
				location: t.location,
				order: n,
				target: this.resolveInclude(e, t.path)
			})),
			...t.packages.map((t, n) => ({
				type: "load",
				location: t.location,
				order: n,
				target: this.resolveLoadedResource(e, t.name, "sty")
			})),
			...t.classes.map((t, n) => ({
				type: "load",
				location: t.location,
				order: n,
				target: this.resolveLoadedResource(e, t.name, "cls")
			}))
		];
	}
	getStats() {
		let e = 0, t = 0;
		for (let [n, r] of this.files) {
			t += n.length + JSON.stringify(r).length;
			for (let t of Object.values(r)) e += t.length;
		}
		for (let [e, n] of this.bibFiles) t += e.length + JSON.stringify(n).length;
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
	findLabelDef(e) {
		return this.labelDefIndex.get(e)?.[0];
	}
	updateEngineCommands(e) {
		this.completionSnapshot = null, this.completionSnapshotStale = !1, this.runtimeColors = [], this.runtimeValues.clear(), this.runtimeKeys = [];
		let { commands: t, environments: n } = this.parseEngineCommands(e);
		this.engineCommands = t, this.engineEnvironments = n;
	}
	parseEngineCommands(e) {
		let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Set();
		for (let r of e) {
			let e = o(r);
			i.test(e.name) || (t.set(e.name, e), n.add(e.name));
		}
		for (let [e, n] of t) {
			if (!e.endsWith(" ") || n.argCount <= 0) continue;
			let r = e.trimEnd(), i = t.get(r);
			i && i.argCount <= 0 && (i.argCount = n.argCount);
		}
		return {
			commands: t,
			environments: l(n)
		};
	}
	updateCompletionSnapshot(t) {
		let n = e(t), r = /* @__PURE__ */ new Map();
		for (let e of n.fields.commands.values) r.set(e.name, {
			name: e.name,
			eqType: e.eqType,
			argCount: e.argCount,
			category: a(e.eqType)
		});
		let i = {
			file: `completion-snapshot:${n.identity.projectRevision}`,
			line: 1,
			column: 1
		}, o = /* @__PURE__ */ new Map([["counter", n.fields.counters.values.map((e) => ({
			name: e.name,
			role: "runtime-observed",
			location: i
		}))], ["length", n.fields.lengths.values.map((e) => ({
			name: e.name,
			role: "runtime-observed",
			location: i
		}))]]), s = n.fields.keyFamilies.values.flatMap((e) => e.keys.map((t) => ({
			family: e.name,
			name: t.name,
			valueType: "free-text",
			location: i,
			provenance: "runtime-observed"
		}))), c = n.fields.colors.values.map((e) => ({
			name: e.name,
			kind: "define",
			location: i,
			provenance: "runtime-observed"
		}));
		this.engineCommands = r, this.engineEnvironments = new Set(n.fields.environments.values.map((e) => e.name)), this.runtimeValues = o, this.runtimeKeys = s, this.runtimeColors = c, this.completionSnapshot = n, this.completionSnapshotStale = !1;
	}
	invalidateCompletionSnapshot() {
		!this.completionSnapshot || this.completionSnapshotStale || (this.completionSnapshotStale = !0, this.engineCommands = /* @__PURE__ */ new Map(), this.engineEnvironments = /* @__PURE__ */ new Set(), this.runtimeColors = [], this.runtimeValues.clear(), this.runtimeKeys = []);
	}
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
	findBibitemDef(e) {
		return this.bibItemIndex.get(e)?.[0];
	}
	findBibEntry(e) {
		return this.bibEntryIndex.get(e)?.[0];
	}
	findCommandDef(e) {
		return this.commandIndex.get(e)?.[0];
	}
	findEnvironmentDef(e) {
		return this.envDefIndex.get(e)?.[0];
	}
	findSymbolAt(e, t, n) {
		let r = this.files.get(e);
		if (r) return this.findLabelAt(r, t, n) || this.findCitationAt(r, t, n) || this.findCommandAt(r, t, n);
	}
	findLabelAt(e, t, n) {
		for (let r of e.labels) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.name.length) return {
			name: r.name,
			type: "label"
		};
		for (let r of e.labelRefs) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.name.length) return {
			name: r.name,
			type: "label"
		};
	}
	findCitationAt(e, t, n) {
		for (let r of e.citations) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.key.length) return {
			name: r.key,
			type: "citation"
		};
		for (let r of e.bibItems) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.key.length) return {
			name: r.key,
			type: "citation"
		};
	}
	findCommandAt(e, t, n) {
		for (let r of e.commands) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.name.length) return {
			name: r.name,
			type: "command"
		};
		for (let r of e.commandUses) if (r.location.line === t && n >= r.location.column && n <= r.location.column + r.name.length && this.commandIndex.has(r.name)) return {
			name: r.name,
			type: "command"
		};
	}
	findAllOccurrences(e, t) {
		return this.occurrenceLocations(e, t).map((t) => ({
			filePath: t.file,
			line: t.line,
			column: t.column,
			length: e.length
		}));
	}
	occurrenceLocations(e, t) {
		return t === "label" ? [...d(this.labelDefIndex.get(e)), ...d(this.labelRefIndex.get(e))] : t === "citation" ? [
			...d(this.citationIndex.get(e)),
			...d(this.bibItemIndex.get(e)),
			...d(this.bibEntryIndex.get(e))
		] : d(this.commandRefIndex.get(e));
	}
};
function d(e) {
	return (e ?? []).map((e) => e.location);
}
//#endregion
export { u as ProjectIndex };
