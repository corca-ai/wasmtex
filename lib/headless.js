import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runRemoteBiber as s } from "./engine/biber-backend.js";
import { BIBLIOGRAPHY_STAGE as c, biblatexLiteBackend as l, detectBiblatexBackend as u, detectBiblatexSort as d, detectBibliographyMode as f, generateBiblatexBbl as p, parseBcfCitedKeys as m, resolveBstFile as h, runRemoteBibliography as g, selectBiblatexBackend as _ } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as v, backendCacheKey as y, contentKey as b, withCache as x } from "./engine/content-cache.js";
import { createMakeindexBackend as S, detectIndexUse as C, runRemoteIndex as w } from "./engine/index-backend.js";
import { createXindyBackend as T } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as E, COMPLETION_SNAPSHOT_SCHEMA_VERSION as D, CompletionFileDigestCache as O, createCompletionSnapshot as k } from "./engine/completion-snapshot.js";
import { BibtexEngine as A } from "./engine/bibtex-engine.js";
import { buildDiagnostics as j, parseTexErrors as M } from "./engine/parse-errors.js";
import { buildDependencyManifest as N, buildIncrementalDependencyManifest as P, normalizeProjectDependencyPath as F } from "./engine/dependency-manifest.js";
import { WasmTexPdftexEngine as I } from "./engine/wasmtex-engine.js";
import { createCompileEngine as L, unavailableEngineResult as R } from "./engine/compile-engine.js";
import { resolveEngine as z } from "./engine/engine-select.js";
import { IncrementalCompiler as B } from "./engine/incremental.js";
import { RerunController as V, signatureOf as H } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as U } from "./fs/engine-sync.js";
import { VirtualFS as W } from "./fs/virtual-fs.js";
import { parseAuxFile as G } from "./lsp/aux-parser.js";
import { parseBibFile as K, rebuildBibIndex as q } from "./lsp/bib-parser.js";
import { ProjectIndex as J } from "./lsp/project-index.js";
import { parseTraceFile as Y } from "./lsp/trace-parser.js";
import { MakeindexEngine as X } from "./engine/makeindex-engine.js";
//#region src/headless.ts
function Z(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var Q = class {
	engine = null;
	engineKind = "pdflatex";
	detection = {
		engine: "pdflatex",
		reason: "default",
		forced: !1
	};
	unavailable = null;
	bibtexEngine = null;
	makeindexEngine = null;
	incremental = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	fs;
	projectIndex = new J();
	completionDigests = new O();
	mainFile;
	assetBaseUrl;
	opts;
	initialized = !1;
	generatedFiles = /* @__PURE__ */ new Set();
	generatedDependencyObservations = /* @__PURE__ */ new Map();
	currentAuxiliaryDependencies = /* @__PURE__ */ new Map();
	lastFullDependencyManifest;
	constructor(e = {}) {
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = Z(e.assetBaseUrl), this.fs = new W({ empty: !0 });
		for (let [t, n] of Object.entries(e.files ?? {})) this.fs.writeFile(t, n), this.updateIndexForFile(t, n);
	}
	engineBaseOpts() {
		let e = {
			assetBaseUrl: this.assetBaseUrl,
			skipFormatPreload: !!this.opts.skipFormatPreload,
			disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
			persistentCache: !!this.opts.persistentCache,
			persistentPreambleCache: !!this.opts.persistentPreambleCache,
			preambleCacheIdentity: { mirrorRevision: this.opts.completionProfile?.mirrorRevision ?? null },
			resolverProfile: this.completionProfile(),
			texliveVersion: this.opts.texliveVersion ?? "2025",
			...this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}
		};
		return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
	}
	mainSource() {
		let e = this.fs.readFile(this.mainFile);
		return typeof e == "string" ? e : "";
	}
	projectTexFiles() {
		let e = /* @__PURE__ */ new Map();
		for (let t of this.fs.listFiles()) {
			if (!t.endsWith(".tex")) continue;
			let n = this.fs.readFile(t);
			typeof n == "string" && e.set(t, n);
		}
		return e;
	}
	async ensureEngine() {
		if (this.detection = z(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
			this.engine?.terminate(), this.engineKind = this.detection.engine, this.engine = L(this.detection.engine, this.engineBaseOpts()), this.incremental = this.opts.incremental && this.engine instanceof I ? new B(this.engine, { mainFile: this.mainFile }) : null;
			try {
				await this.engine.init(), this.unavailable = null, await this.syncAllFilesToEngine();
			} catch (e) {
				if (this.detection.engine === "pdflatex") throw e;
				this.unavailable = this.detection;
			}
		}
	}
	async init() {
		this.initialized ||= (await this.ensureEngine(), !0);
	}
	async compile() {
		this.ensureInitialized(), this.prebuildInFlight && await this.prebuildInFlight, this.compileInFlight = !0;
		try {
			return await this.compileIdle();
		} finally {
			this.compileInFlight = !1;
		}
	}
	async compileIdle() {
		if (this.currentAuxiliaryDependencies.clear(), await this.ensureEngine(), this.unavailable || !this.engine) {
			let e = R(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let e = this.engine;
		if (await this.syncModifiedFilesToEngine(), e.setPreambleSnapshot) {
			let t = !this.opts.disablePreambleSnapshot && !C(this.mainSource());
			e.setPreambleSnapshot(t);
		}
		if (this.incremental) {
			let e = performance.now(), t = await this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles());
			if (t?.final && t.pdf) return this.toCompileResult(t, performance.now() - e);
		}
		let t = await e.compile(), n = await this.runAuxStages(t), r = new V();
		for (; (t.success || t.pdf) && !(!r.decide(t.log, H(t.semanticTrace ?? t.log)).rerun && !n);) await this.syncModifiedFilesToEngine(), t = await e.compile(), n = await this.runAuxStages(t);
		return await this.updateMetadata(t), this.attachDependencyManifest(t), await this.attachCompletionSnapshot(t), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), t.synctex), t;
	}
	async prepareIncrementalCompile(e = this.mainFile, t) {
		this.ensureInitialized();
		let n = this.incremental;
		if (!n || this.unavailable || !this.engine || this.compileInFlight || this.fs.getModifiedFiles().length > 0) return !1;
		if (this.prebuildInFlight) return this.prebuildInFlight;
		let r = this.fs.readFile(e);
		if (typeof r != "string" || !e.toLowerCase().endsWith(".tex")) return !1;
		let i = this.mainSource(), a = this.projectTexFiles(), o = n.prebuildForEdit(i, a, e, t ?? r.length);
		this.prebuildInFlight = o;
		try {
			return await o;
		} finally {
			this.prebuildInFlight === o && (this.prebuildInFlight = null);
		}
	}
	toCompileResult(e, t) {
		let n = {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: M(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: j(e.log) }
		};
		return n.telemetry.dependencyManifest = P(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.projectIndex.invalidateCompletionSnapshot(), this.fs.writeFile(e, t);
		let n = F(e) ?? e;
		if (this.generatedFiles.delete(n), this.generatedDependencyObservations.delete(n), this.currentAuxiliaryDependencies.clear(), (e.endsWith(".tex") || e.endsWith(".bib") || e.endsWith(".bst")) && !e.endsWith(".bbl")) {
			let e = this.mainFile.replace(/\.tex$/, "");
			this.dropGeneratedFile(`${e}.bbl`), this.dropGeneratedFile(`${e}.ind`);
		}
		e.endsWith(".tex") || this.incremental?.reset(), this.updateIndexForFile(e, t);
	}
	async loadProject(e) {
		this.fs = new W({ empty: !0 }), this.projectIndex = new J(), this.generatedFiles.clear(), this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset();
		for (let [t, n] of Object.entries(e)) this.fs.writeFile(t, n), this.updateIndexForFile(t, n);
		this.initialized && (this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.engine && !this.unavailable ? (await this.engine.flushCache(), await this.syncAllFilesToEngine()) : (this.engine?.terminate(), this.engine = null));
	}
	getFile(e) {
		return this.fs.readFile(e);
	}
	listFiles() {
		return this.fs.listFiles();
	}
	getMainFile() {
		return this.mainFile;
	}
	setMainFile(e) {
		this.projectIndex.invalidateCompletionSnapshot(), this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.setMainFile(e), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e);
	}
	getProjectIndex() {
		return this.projectIndex;
	}
	getCompletionSnapshotState() {
		return this.projectIndex.getCompletionSnapshotState();
	}
	async readOutput(e) {
		return this.ensureInitialized(), await this.engine?.readFile(e) ?? null;
	}
	async flushCache() {
		this.ensureInitialized(), await this.engine?.flushCache();
	}
	async clearCache() {
		await this.engine?.clearCache();
	}
	dispose() {
		this.engine?.terminate(), this.engine = null, this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.lastFullDependencyManifest = void 0, this.initialized = !1;
	}
	dropGeneratedFile(e) {
		this.fs.deleteFile(e);
		let t = F(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = new Map(this.currentAuxiliaryDependencies);
		for (let n of e.inputFiles ?? []) {
			let e = F(n);
			if (!e) continue;
			let r = this.generatedDependencyObservations.get(e);
			r && t.set(r.stage, r);
		}
		return [...t.values()];
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: j(e.log) };
		let t = N({
			engine: this.engineKind,
			root: this.mainFile,
			projectFiles: this.fs.listFiles(),
			generatedFiles: this.generatedFiles,
			auxiliaryStages: this.auxiliaryDependencyObservations(e),
			result: e
		});
		e.telemetry.dependencyManifest = t, this.lastFullDependencyManifest = e.success && e.pdf ? t : void 0;
	}
	completionProfile() {
		let e = this.opts.texliveVersion ?? "2025";
		return {
			id: this.opts.completionProfile?.id ?? `wasmtex:${e}:${this.opts.texliveUrl ?? "default-mirror"}`,
			texliveYear: e,
			mirrorRevision: this.opts.completionProfile?.mirrorRevision ?? null
		};
	}
	async attachCompletionSnapshot(e) {
		if (!e.success || !this.engine || this.fs.getModifiedFiles().length > 0) return;
		let t = this.engine, n = this.mainFile, r = await Promise.all(this.fs.listFiles().filter((e) => !this.generatedFiles.has(e)).flatMap((e) => {
			let t = this.fs.getFile(e);
			return t ? [t] : [];
		}).map(async (e) => ({
			path: e.path,
			content: e.content,
			digest: await this.completionDigests.digest(e, e.content)
		}))), i = t.getCompletionObservation?.(), a = await k({
			engine: this.engineKind,
			root: n,
			profile: this.completionProfile(),
			projectFiles: r,
			...e.engineCommands ? { engineCommands: e.engineCommands } : {},
			engineCommandsComplete: e.engineCommandsComplete === !0,
			...e.engineCommandsDropped === void 0 ? {} : { engineCommandsDropped: e.engineCommandsDropped },
			...i ? { engineObservation: i } : {},
			...e.inputFiles ? { inputFiles: e.inputFiles } : {},
			inputFilesComplete: e.inputFilesComplete === !0
		});
		n !== this.mainFile || t !== this.engine || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: j(e.log) }, e.telemetry.completionSnapshot = a, this.projectIndex.updateCompletionSnapshot(a));
	}
	async syncAllFilesToEngine() {
		let e = this.engine;
		!e || this.unavailable || await U(this.fs, e, (e) => this.ensureEngineDirectories(e), this.mainFile);
	}
	async syncModifiedFilesToEngine() {
		let e = this.engine;
		if (!e || this.unavailable) return;
		let t = this.fs.getModifiedFiles();
		await this.ensureEngineDirectories(t.map((e) => e.path)), await Promise.all(t.map((t) => e.writeFile(t.path, t.content))), this.fs.markSynced(t), e.setMainFile(this.mainFile);
	}
	async ensureEngineDirectories(e) {
		let t = this.engine;
		if (!t) return;
		let n = /* @__PURE__ */ new Set();
		for (let t of e) {
			let e = t.split("/"), r = "";
			for (let t = 0; t < e.length - 1; t++) r = r ? `${r}/${e[t]}` : e[t], n.add(r);
		}
		for (let e of Array.from(n).sort()) await t.mkdir(e);
	}
	updateIndexForFile(e, t) {
		typeof t == "string" && (e.endsWith(".tex") && this.projectIndex.updateFile(e, t), e.endsWith(".bib") && this.updateBibIndex());
	}
	updateBibIndex() {
		q(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		let t = this.mainFile.replace(/\.tex$/, ""), n = await this.engine.readFile(`${t}.aux`);
		if (n && this.projectIndex.updateAuxData(G(n)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(Y(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = F(t);
			if (!e) continue;
			let n = this.fs.getFile(e);
			n && typeof n.content == "string" && this.projectIndex.updateFile(n.path, n.content);
		}
	}
	async runAuxStages(e) {
		let t = await this.maybeRunBibtex(e) || await this.maybeRunBiblatex(e), n = await this.maybeRunMakeindex(e);
		return t || n;
	}
	async maybeRunBibtex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !this.fs.listFiles().some((e) => e.endsWith(".bib"))) return !1;
		let n = this.mainFile.replace(/\.tex$/, ""), r = await t.readFile(`${n}.aux`);
		if (!r?.includes("\\citation{") || !r.includes("\\bibdata{") || this.fs.readFile(`${n}.bbl`)) return !1;
		let i = this.collectBibFiles(), a = {
			aux: r,
			bibFiles: i
		}, o = this.resolveProjectBst(r);
		o && (a.bstFiles = { [o.path]: o.content });
		let s = await g(this.opts.backends, a) ?? await this.runClientBibtex(n, r, i), c = {
			stage: "bibliography",
			projectInputs: [...Object.keys(i), ...Object.keys(a.bstFiles ?? {})],
			complete: !!s
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", c), !s) return !1;
		let l = `${n}.bbl`, u = F(l) ?? l;
		return this.fs.writeFile(l, s), this.generatedFiles.add(u), this.generatedDependencyObservations.set(u, c), await t.writeFile(l, s), !0;
	}
	async maybeRunBiblatex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.mainSource();
		if (f(n) !== "biblatex") return !1;
		let r = this.mainFile.replace(/\.tex$/, "");
		if (this.fs.readFile(`${r}.bbl`)) return !1;
		let i = await t.readFile(`${r}.bcf`);
		if (!i?.trim()) return !1;
		let a = this.collectBibFiles(), o = (u(n) === "biber" ? await s(this.opts.backends, {
			bcf: i,
			bibFiles: a
		}) : null) ?? this.runClientBiblatexLite(n, i, a), c = {
			stage: "bibliography",
			projectInputs: Object.keys(a),
			complete: !!o
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", c), !o) return !1;
		let l = `${r}.bbl`, d = F(l) ?? l;
		return this.fs.writeFile(l, o), this.generatedFiles.add(d), this.generatedDependencyObservations.set(d, c), await t.writeFile(l, o), !0;
	}
	runClientBiblatexLite(e, t, n) {
		let r = Object.entries(n).flatMap(([e, t]) => K(t, e)), i = m(t), a = i.includes("*") ? r.map((e) => e.key) : i;
		return p({
			entries: r,
			citedKeys: a,
			sort: d(e)
		});
	}
	async maybeRunMakeindex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !C(this.mainSource())) return !1;
		let n = this.mainFile.replace(/\.tex$/, "");
		if (this.fs.readFile(`${n}.ind`)) return !1;
		let r = await t.readFile(`${n}.idx`);
		if (!r?.trim()) return !1;
		let i = { idx: r }, a = await w(this.opts.backends, i) ?? await this.runClientMakeindex(n, r), o = {
			stage: "index",
			projectInputs: [],
			complete: !!a
		};
		if (this.currentAuxiliaryDependencies.set("index", o), !a) return !1;
		let s = `${n}.ind`, c = F(s) ?? s;
		return this.fs.writeFile(s, a), this.generatedFiles.add(c), this.generatedDependencyObservations.set(c, o), await t.writeFile(s, a), !0;
	}
	resolveProjectBst(e) {
		return h(e, (e) => {
			let t = this.fs.readFile(e);
			return typeof t == "string" ? t : null;
		});
	}
	collectBibFiles() {
		let e = {};
		for (let t of this.fs.listFiles()) {
			if (!t.endsWith(".bib")) continue;
			let n = this.fs.readFile(t);
			typeof n == "string" && (e[t] = n);
		}
		return e;
	}
	async runClientBibtex(e, t, n) {
		let r = await this.ensureBibtexEngine();
		await r.writeFile(`${e}.aux`, t);
		for (let [e, t] of Object.entries(n)) await r.writeFile(e, t);
		let i = this.resolveProjectBst(t);
		return i && await r.writeFile(i.path, i.content), await r.compile(e), await r.readFile(`${e}.bbl`) ?? null;
	}
	auxEngineOpts() {
		let e = {
			assetBaseUrl: this.assetBaseUrl,
			texliveVersion: this.opts.texliveVersion ?? "2025"
		};
		return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
	}
	async ensureBibtexEngine() {
		if (this.bibtexEngine) return this.bibtexEngine;
		let e = new A(this.auxEngineOpts());
		return await e.init(), this.bibtexEngine = e, e;
	}
	async runClientMakeindex(e, t) {
		let n = await this.ensureMakeindexEngine();
		return await n.writeFile(`${e}.idx`, t), await n.compile(e), await n.readFile(`${e}.ind`) ?? null;
	}
	async ensureMakeindexEngine() {
		if (this.makeindexEngine) return this.makeindexEngine;
		let e = new X(this.auxEngineOpts());
		return await e.init(), this.makeindexEngine = e, e;
	}
	ensureInitialized() {
		if (!this.initialized) throw Error("WasmTexCompiler is not initialized. Call init() first.");
	}
};
//#endregion
export { e as BIBER_STAGE, c as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, E as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, D as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, v as MemoryCacheStore, Q as WasmTexCompiler, y as backendCacheKey, l as biblatexLiteBackend, b as contentKey, o as createBiberBackend, i as createJsonTextBackend, S as createMakeindexBackend, a as createRemoteBackend, T as createXindyBackend, u as detectBiblatexBackend, d as detectBiblatexSort, f as detectBibliographyMode, C as detectIndexUse, p as generateBiblatexBbl, m as parseBcfCitedKeys, s as runRemoteBiber, g as runRemoteBibliography, w as runRemoteIndex, _ as selectBiblatexBackend, x as withCache };
