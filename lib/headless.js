import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runRemoteBiber as s } from "./engine/biber-backend.js";
import { BIBLIOGRAPHY_STAGE as c, biblatexLiteBackend as l, detectBiblatexBackend as u, detectBiblatexSort as d, detectBibliographyMode as f, generateBiblatexBbl as p, parseBcfCitedKeys as m, resolveBstFile as h, runRemoteBibliography as g, selectBiblatexBackend as _ } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as v, backendCacheKey as y, contentKey as b, withCache as ee } from "./engine/content-cache.js";
import { createMakeindexBackend as te, detectIndexUse as x, runRemoteIndex as S } from "./engine/index-backend.js";
import { createXindyBackend as ne } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as re, COMPLETION_SNAPSHOT_SCHEMA_VERSION as ie, CompletionFileDigestCache as C, createCompletionSnapshot as ae } from "./engine/completion-snapshot.js";
import { BibtexEngine as w } from "./engine/bibtex-engine.js";
import { buildDiagnostics as T, parseTexErrors as E } from "./engine/parse-errors.js";
import { buildDependencyManifest as D, buildIncrementalDependencyManifest as O, normalizeProjectDependencyPath as k } from "./engine/dependency-manifest.js";
import { WasmTexPdftexEngine as A } from "./engine/wasmtex-engine.js";
import { createCompileEngine as oe, unavailableEngineResult as se } from "./engine/compile-engine.js";
import { resolveEngine as ce } from "./engine/engine-select.js";
import { IncrementalCompiler as le } from "./engine/incremental.js";
import { RerunController as ue, signatureOf as j } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as M } from "./fs/engine-sync.js";
import { VirtualFS as N } from "./fs/virtual-fs.js";
import { parseAuxFiles as P, readAuxFiles as F } from "./lsp/aux-files.js";
import { parseBibFile as I, rebuildBibIndex as L } from "./lsp/bib-parser.js";
import { ProjectIndex as R } from "./lsp/project-index.js";
import { parseTraceFile as z } from "./lsp/trace-parser.js";
import { CompilerOperations as B } from "./engine/compiler-operation.js";
import { MakeindexEngine as V } from "./engine/makeindex-engine.js";
import { buildTexliveDependencySet as H, mergeTexliveDependencySets as U } from "./engine/texlive-dependencies.js";
import { PREAMBLE_SNAPSHOT_JOBNAME as W, defaultFigureWorkers as de, detectAutoBlocker as fe, detectTikzExternalization as pe, figureJobSource as me, mainJobSource as he, parseFigureList as ge, parseFigureMd5 as _e } from "./engine/tikz-externalization.js";
//#region src/headless.ts
function G(e, t) {
	let n = [];
	for (let r of t) {
		let t = e.cache.get(r)?.log;
		t && n.push(...K(t));
	}
	return n;
}
function K(e) {
	return E(e).filter((e) => !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(e.message));
}
async function ve(e, t = {}) {
	let n = e.mainFile ?? "main.tex", r = e.files?.[n], i = typeof r == "string" ? r : "", { injectDocumentMetadata: a, documentClassOf: o, CLASS_SUPPORT: s } = await J(), c = a(i, t), l = o(i), u = l && s[l] || "unknown", d = Y(l, u, c.injected), f = new $({
		...e,
		files: {
			...e.files,
			[n]: c.source
		},
		incremental: !1,
		tikzExternalization: { mode: "off" }
	});
	try {
		return await f.init(), await q(await f.compile(), c, l, u, d);
	} finally {
		f.dispose();
	}
}
async function q(e, t, n, r, i) {
	let { kernelLacksTagging: a, inspectPdfTagging: o } = await J(), s = !a(e.log);
	s || i.push("This engine's LaTeX kernel predates tagging support (TeX Live 2025); use the TeX Live 2026 profile for accessible export.");
	let c = e.pdf ? await o(e.pdf) : null;
	return c && i.push(...ye(c, s)), {
		result: e,
		declaration: {
			lang: t.lang,
			standard: t.standard,
			injected: t.injected
		},
		documentClass: n,
		classSupport: r,
		kernelSupported: s,
		tagging: c,
		notes: i
	};
}
function J() {
	return import("./engine/accessible-export.js");
}
function Y(e, t, n) {
	let r = [];
	return t === "unsupported" ? r.push(`Document class '${e}' is known not to work with the LaTeX tagging kernel; the export may fail or come out untagged.`) : t === "partial" ? r.push(`Document class '${e}' produces a structure tree but logs tagging errors; check the exported PDF.`) : t === "unknown" && e && r.push(`Document class '${e}' has not been verified with the tagging kernel.`), n || r.push("The document declares its own \\DocumentMetadata; it was exported as written."), r;
}
function ye(e, t) {
	let n = [];
	return !e.tagged && t && n.push("The compile produced no structure tree; the PDF is not tagged."), e.figures > e.figuresWithAlt && n.push(`${e.figures - e.figuresWithAlt} of ${e.figures} figures have no text alternative (alt={…}).`), n;
}
function be() {
	return typeof globalThis.process?.versions?.node == "string";
}
function X(e, t) {
	return e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = t, e;
}
function Z(e, t) {
	for (let n of t.pdfConversionInputs ?? []) e.add(n);
}
function xe(e, t) {
	t.size && (e.pdfConversionInputs = [...t].sort());
}
function Se(e, t) {
	let n = (e) => `${e.file ?? ""}:${e.line ?? ""}:${e.message}`, r = new Set(e.errors.map(n));
	for (let i of t) r.has(n(i)) || (r.add(n(i)), e.errors.push(i));
	return t.length;
}
function Q(e) {
	return {
		mode: e,
		figures: 0,
		compiled: 0,
		reused: 0,
		failed: [],
		workers: 0,
		figureTimeMs: 0,
		pictureErrors: 0
	};
}
function Ce(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var we = [
	"aux",
	"toc",
	"lof",
	"lot",
	"out",
	"bbl",
	"ind",
	"nav",
	"snm",
	"vrb",
	"glo",
	"gls",
	"acn",
	"acr",
	"loa",
	"thm",
	"xdy"
], $ = class e {
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
	heap = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	operations = new B();
	initInFlight = null;
	replacingProject = !1;
	disposalRevision = 0;
	inputRevision = 0;
	fs;
	projectIndex = new R();
	completionDigests = new C();
	mainFile;
	assetBaseUrl;
	opts;
	initialized = !1;
	generatedFiles = /* @__PURE__ */ new Set();
	generatedDependencyObservations = /* @__PURE__ */ new Map();
	currentAuxiliaryDependencies = /* @__PURE__ */ new Map();
	lastFullDependencyManifest;
	sessionDependencies;
	tikzPool = null;
	tikzAutoDisabled = !1;
	tikzAutoBlocker = null;
	exportCompiler = null;
	exportSynced = /* @__PURE__ */ new Map();
	constructor(e = {}) {
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = Ce(e.assetBaseUrl), this.fs = new N({ empty: !0 });
		for (let [t, n] of Object.entries(e.files ?? {})) this.fs.writeFile(t, n), this.updateIndexForFile(t, n);
	}
	attachLoadProgress(e) {
		let t = this.opts.onLoadProgress;
		if (!t) return;
		let n = 0;
		e.onProgress = (e) => t({
			phase: "format",
			percent: e
		}), e.onFileDownload = (e) => {
			n += 1, t({
				phase: "file",
				file: e,
				count: n
			});
		};
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
			heapCheckpoints: !!this.opts.incremental && !be(),
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
		if (this.detection = ce(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
			if (this.engine?.terminate(), this.engineKind = this.detection.engine, this.engine = oe(this.detection.engine, this.engineBaseOpts()), this.attachLoadProgress(this.engine), this.opts.onEngineSelected) {
				let e = (e) => console.error("Engine selection observer failed", e);
				try {
					Promise.resolve(this.opts.onEngineSelected({ ...this.detection })).catch(e);
				} catch (t) {
					e(t);
				}
			}
			this.operations.assertCurrent(), this.incremental = this.opts.incremental && this.engine instanceof A ? new le(this.engine, { mainFile: this.mainFile }) : null, this.heap = this.opts.incremental && this.engine instanceof A ? new ((await this.operations.observe(import("./engine/heap-checkpoints.js"))).resume()).HeapCheckpointCompiler(this.engine, { mainFile: this.mainFile }) : null;
			try {
				(await this.operations.observe(this.engine.init())).resume(), this.unavailable = null, (await this.operations.observe(this.syncAllFilesToEngine())).resume();
			} catch (e) {
				if (this.operations.assertCurrent(), this.detection.engine === "pdflatex") throw e;
				this.unavailable = this.detection;
			}
		}
	}
	async init() {
		if (this.initInFlight) return this.initInFlight;
		if (this.initialized) return;
		this.assertNoProjectReplacement();
		let e = this.operations.run(async () => {
			this.sessionDependencies = void 0;
			try {
				await this.ensureEngine(), this.operations.assertCurrent(), this.initialized = !0;
			} catch (e) {
				throw this.retireEngines(), e;
			}
		});
		this.initInFlight = e;
		try {
			await e;
		} finally {
			this.initInFlight === e && (this.initInFlight = null);
		}
	}
	async compile() {
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		this.compileInFlight = !0;
		let e = this.inputRevision;
		try {
			this.prebuildInFlight && await this.prebuildInFlight, this.assertRevision(e);
			let t = await this.operations.run(() => this.compileIdle());
			return this.assertRevision(e), t;
		} finally {
			this.compileInFlight = !1;
		}
	}
	async compileIdle() {
		if (this.currentAuxiliaryDependencies.clear(), (await this.operations.observe(this.ensureEngine())).resume(), this.unavailable || !this.engine) {
			let e = se(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let e = this.engine;
		if ((await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), e.setPreambleSnapshot) {
			let t = !this.opts.disablePreambleSnapshot && !x(this.mainSource());
			e.setPreambleSnapshot(t);
		}
		let t = this.tikzExternalizationKind(), n = (await this.operations.observe(this.tryIncrementalFastPath(t))).resume();
		if (n) return n;
		let r = (await this.operations.observe(this.tryHeapResume(t))).resume() ?? (await this.operations.observe(e.compile(this.heapArms()))).resume(), i = new Set(r.pdfConversionInputs ?? []), a = [r.telemetry?.resolver];
		r = (await this.operations.observe(this.applyTikzExternalization(r, t, a))).resume(), Z(i, r);
		let o = r.telemetry?.tikzExternalization, s = (await this.operations.observe(this.runAuxStages(r))).resume(), c = new ue();
		for (; (r.success || r.pdf) && !(!c.decide(r.log, j(r.semanticTrace ?? r.log)).rerun && !s);) (await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), r = (await this.operations.observe(e.compile(this.heapArms()))).resume(), a.push(r.telemetry?.resolver), Z(i, r), s = (await this.operations.observe(this.runAuxStages(r))).resume();
		return this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), r), o && (r.telemetry ??= { diagnostics: T(r.log) }, r.telemetry.tikzExternalization = o), xe(r, i), this.attachTexliveDependencies(r, a), (await this.operations.observe(this.updateMetadata(r))).resume(), this.attachDependencyManifest(r), (await this.operations.observe(this.attachCompletionSnapshot(r))).resume(), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), r.synctex), r;
	}
	async prepareIncrementalCompile(e = this.mainFile, t) {
		this.ensureInitialized();
		let n = this.incremental;
		if (!n || this.unavailable || !this.engine || this.compileInFlight || this.replacingProject || this.fs.getModifiedFiles().length > 0) return !1;
		if (this.prebuildInFlight) return this.prebuildInFlight;
		let r = this.fs.readFile(e);
		if (typeof r != "string" || !e.toLowerCase().endsWith(".tex")) return !1;
		let i = this.mainSource(), a = this.projectTexFiles();
		if (this.operations.busy && !this.prebuildInFlight) return !1;
		let o = this.operations.run(async () => (await this.operations.observe(this.heap?.enabled ? this.prepareHeapCheckpoint(i, a, e, t ?? r.length) : n.prebuildForEdit(i, a, e, t ?? r.length))).resume());
		this.prebuildInFlight = o;
		try {
			return await o;
		} finally {
			this.prebuildInFlight === o && (this.prebuildInFlight = null);
		}
	}
	async prepareHeapCheckpoint(e, t, n, r) {
		let i = this.heap, a = this.engine;
		if (!i || !a || !(a instanceof A)) return !1;
		let o = r;
		if (n !== this.mainFile) {
			let t = e.indexOf(`{${n.replace(/\.tex$/, "")}}`);
			if (t < 0) return !1;
			o = t;
		}
		let s = i.armsForFullCompile(e, t, o);
		if (s.length === 0) return !1;
		let c = (await this.operations.observe(a.compile({ checkpoints: s }))).resume();
		return i.noteFull(e, t, c), (c.heapCheckpoints?.length ?? 0) > 0;
	}
	heapArms() {
		if (!this.heap?.enabled) return;
		let e = this.heap.armsForFullCompile(this.mainSource(), this.projectTexFiles());
		return e.length ? { checkpoints: e } : void 0;
	}
	async tryHeapResume(e) {
		if (!this.heap?.enabled || e) return null;
		let t = (await this.operations.observe(this.heap.tryResume(this.mainSource(), this.projectTexFiles()))).resume();
		return !t || !t.final || !t.result.pdf ? null : t.result;
	}
	toCompileResult(e, t) {
		let n = {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: E(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: T(e.log) }
		};
		return n.telemetry.dependencyManifest = O(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.assertNoProjectReplacement(), this.invalidateOperation(), this.projectIndex.invalidateCompletionSnapshot(), this.fs.writeFile(e, t);
		let n = k(e) ?? e;
		if (this.generatedFiles.delete(n), this.generatedDependencyObservations.delete(n), this.currentAuxiliaryDependencies.clear(), (e.endsWith(".tex") || e.endsWith(".bib") || e.endsWith(".bst")) && !e.endsWith(".bbl")) {
			let e = this.mainFile.replace(/\.tex$/, "");
			this.dropGeneratedFile(`${e}.bbl`), this.dropGeneratedFile(`${e}.ind`);
		}
		e.endsWith(".tex") || (this.incremental?.reset(), this.heap?.reset()), this.updateIndexForFile(e, t);
	}
	async loadProject(e) {
		this.assertNoProjectReplacement(), this.replacingProject = !0;
		let t = this.disposalRevision;
		try {
			if (await this.invalidateOperation(), t !== this.disposalRevision) throw new DOMException("Compiler disposed", "AbortError");
			await this.operations.run(() => this.replaceProject(e));
		} finally {
			this.replacingProject = !1;
		}
	}
	async replaceProject(e) {
		this.fs = new N({ empty: !0 }), this.projectIndex = new R(), this.generatedFiles.clear(), this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset(), this.heap?.reset();
		for (let [t, n] of Object.entries(e)) this.fs.writeFile(t, n), this.updateIndexForFile(t, n);
		this.initialized && (this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.engine && !this.unavailable ? ((await this.operations.observe(this.engine.flushCache())).resume(), (await this.operations.observe(this.syncAllFilesToEngine())).resume()) : (this.engine?.terminate(), this.engine = null));
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
		this.assertNoProjectReplacement();
		let t = e !== this.mainFile;
		t && (this.projectIndex.invalidateCompletionSnapshot(), t && this.invalidateOperation(), this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, t && (this.incremental?.setMainFile(e), this.heap?.reset()), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e));
	}
	getProjectIndex() {
		return this.projectIndex;
	}
	getCompletionSnapshotState() {
		return this.projectIndex.getCompletionSnapshotState();
	}
	async readOutput(e) {
		return this.ensureInitialized(), this.assertNoProjectReplacement(), this.operations.run(async () => (await this.operations.observe(this.engine?.readFile(e))).resume() ?? null);
	}
	async flushCache() {
		this.ensureInitialized(), this.assertNoProjectReplacement(), await this.operations.run(async () => {
			(await this.operations.observe(this.engine?.flushCache())).resume(), this.fs.markAllModified(), this.incremental?.reset(), this.heap?.reset();
		});
	}
	async clearCache() {
		this.assertNoProjectReplacement(), await this.operations.run(async () => {
			(await this.operations.observe(this.engine?.clearCache())).resume();
		});
	}
	dispose() {
		this.disposalRevision += 1, this.inputRevision += 1, this.operations.cancel(), this.retireEngines(), this.projectIndex.invalidateCompletionSnapshot(), this.initialized = !1;
	}
	assertNoProjectReplacement() {
		if (this.replacingProject) throw Error("Project replacement in progress");
	}
	assertRevision(e) {
		if (e !== this.inputRevision) throw new DOMException("Compiler input changed", "AbortError");
	}
	invalidateOperation() {
		this.inputRevision += 1;
		let e = this.operations.busy, t = this.operations.cancel();
		return e && this.retireEngines(), t;
	}
	retireEngines() {
		this.incremental = null, this.heap = null, this.engine?.terminate(), this.engine = null, this.tikzPool?.dispose(), this.tikzPool = null, this.exportCompiler?.dispose(), this.exportCompiler = null, this.exportSynced.clear(), this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.lastFullDependencyManifest = void 0, this.unavailable = null;
		for (let e of [...this.generatedFiles]) this.dropGeneratedFile(e);
		this.currentAuxiliaryDependencies.clear(), this.fs.markAllModified();
	}
	dropGeneratedFile(e) {
		this.fs.deleteFile(e);
		let t = k(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = new Map(this.currentAuxiliaryDependencies);
		for (let n of e.inputFiles ?? []) {
			let e = k(n);
			if (!e) continue;
			let r = this.generatedDependencyObservations.get(e);
			r && t.set(r.stage, r);
		}
		return [...t.values()];
	}
	attachTexliveDependencies(e, t) {
		let n = /* @__PURE__ */ new Set();
		for (let e of this.fs.listFiles()) n.add(e.slice(e.lastIndexOf("/") + 1));
		let r = this.mainFile.replace(/\.tex$/i, "").slice(this.mainFile.lastIndexOf("/") + 1);
		for (let e of we) n.add(`${r}.${e}`);
		let i = H(this.opts.texliveVersion ?? "2025", this.completionProfile(), t, { excludeNames: n });
		i && (this.sessionDependencies = U(this.sessionDependencies, i), e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.texliveDependencies = this.sessionDependencies);
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: T(e.log) };
		let t = D({
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
		let t = this.engine, n = this.mainFile, r = (await this.operations.observe(Promise.all(this.fs.listFiles().filter((e) => !this.generatedFiles.has(e)).flatMap((e) => {
			let t = this.fs.getFile(e);
			return t ? [t] : [];
		}).map(async (e) => ({
			path: e.path,
			content: e.content,
			digest: (await this.operations.observe(this.completionDigests.digest(e, e.content))).resume()
		}))))).resume(), i = t.getCompletionObservation?.(), a = (await this.operations.observe(ae({
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
		}))).resume();
		n !== this.mainFile || t !== this.engine || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.completionSnapshot = a, this.projectIndex.updateCompletionSnapshot(a));
	}
	async syncAllFilesToEngine() {
		let e = this.engine;
		!e || this.unavailable || (await this.operations.observe(M(this.fs, {
			writeFile: (t, n) => e.writeFile(t, this.engineContent(t, n)),
			setMainFile: (t) => e.setMainFile(t)
		}, (e) => this.ensureEngineDirectories(e), this.mainFile))).resume();
	}
	engineContent(e, t) {
		if (e !== this.mainFile || typeof t != "string") return t;
		let n = this.tikzExternalizationKind(t);
		return n ? he(t, n) : t;
	}
	tikzExternalizationKind(e = this.mainSource()) {
		let t = pe(e, this.opts.tikzExternalization?.mode ?? "document");
		return t === "inject" ? this.tikzAutoDisabled ? null : (this.tikzAutoBlocker = fe(e, this.projectTexFiles().values()), this.tikzAutoBlocker ? null : t) : t;
	}
	async tryIncrementalFastPath(e) {
		if (!this.incremental || e) return null;
		let t = performance.now(), n = (await this.operations.observe(this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles()))).resume();
		return n?.final && n.pdf ? this.toCompileResult(n, performance.now() - t) : null;
	}
	async applyTikzExternalization(e, t, n) {
		return t && (e.success || e.pdf) ? this.externalizeTikzFigures(e, t, n) : (this.opts.tikzExternalization?.mode === "auto" && this.tikzAutoBlocker && (e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = {
			...Q("auto"),
			blocked: this.tikzAutoBlocker
		}), e);
	}
	async externalizeTikzFigures(e, t, n) {
		let r = this.engine;
		if (!r) return e;
		let i = !!r.setPreambleSnapshot && !this.opts.disablePreambleSnapshot, a = (await this.operations.observe(this.runTikzFigureJobs(e, t, i))).resume();
		if (!a) return e;
		let { telemetry: o, errors: s, failureLog: c } = a;
		if (t === "inject" && (a.inline || o.failed.length > 0)) {
			this.tikzAutoDisabled = !0, a.inline || (o.fallback = !0), (await this.operations.observe(r.writeFile(this.mainFile, this.mainSource()))).resume();
			let e = (await this.operations.observe(r.compile())).resume();
			return n.push(e.telemetry?.resolver), X(e, o);
		}
		let l = o.compiled > 0 ? (await this.operations.observe(r.compile())).resume() : e;
		return l !== e && n.push(l.telemetry?.resolver), o.pictureErrors = Se(l, s), c && (l.log += c), X(l, o);
	}
	async runTikzFigureJobs(e, t, n) {
		let r = this.engine;
		if (!r) return null;
		let i = this.mainFile.replace(/\.tex$/i, ""), a = (await this.operations.observe(this.readTikzFigureList(i, n))).resume();
		if (!a) return null;
		let { realJob: o, names: s } = a;
		if (t === "inject" && s.length < 3) {
			let t = {
				...Q("auto"),
				figures: s.length
			};
			return t.blocked = "too-few-pictures", e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = t, {
				telemetry: t,
				errors: [],
				failureLog: "",
				inline: !0
			};
		}
		let c = globalThis.navigator, l = this.opts.tikzExternalization?.workers ?? de(c?.hardwareConcurrency, c?.deviceMemory), u = (await this.operations.observe(this.ensureTikzPool(l))).resume();
		u.retain(s);
		let d = (await this.operations.observe(Promise.all(s.map((e) => r.readFile(`${e}.md5`))))).resume(), f = s.map((e, t) => ({
			name: e,
			md5: _e(d[t])
		})).filter((e) => !u.isCurrent(e.name, e.md5)), p = {
			...Q(t === "inject" ? "auto" : "document"),
			figures: s.length,
			reused: s.length - f.length,
			workers: Math.min(l, Math.max(1, f.length))
		};
		if (e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = p, f.length === 0) return {
			telemetry: p,
			errors: G(u, s),
			failureLog: ""
		};
		let m = this.mainSource(), h = [], g = (await this.operations.observe(r.readFile(`${i}.aux`))).resume();
		g !== null && h.push([`${o}.aux`, g]);
		for (let e of this.projectTexFiles().keys()) {
			if (e === this.mainFile) continue;
			let t = `${e.replace(/\.tex$/i, "")}.aux`, n = (await this.operations.observe(r.readFile(t))).resume();
			n !== null && h.push([t, n]);
		}
		let _ = (await this.operations.observe(u.render(f, (e) => me(m, t, o, e), () => [...this.projectFileEntries(), ...h]))).resume();
		p.compiled = _.rendered.size, p.failed = _.failures.map((e) => e.name), p.figureTimeMs = Math.round(_.elapsedMs);
		let v = G(u, s), y = "";
		for (let e of _.failures) v.push(...K(e.log)), y += `\n[wasmtex] TikZ figure job '${e.name}' failed:\n${e.log.slice(-2e3)}\n`;
		let b = [];
		for (let e of _.rendered.keys()) b.push(`${e}.pdf`);
		return (await this.operations.observe(this.ensureEngineDirectories(b))).resume(), (await this.operations.observe(Promise.all([..._.rendered].flatMap(([e, t]) => [r.writeFile(`${e}.pdf`, t.pdf), ...t.dpth === null ? [] : [r.writeFile(`${e}.dpth`, t.dpth)]])))).resume(), {
			telemetry: p,
			errors: v,
			failureLog: y
		};
	}
	async ensureTikzPool(e) {
		if (!this.tikzPool) {
			let { TikzFigurePool: t } = (await this.operations.observe(import("./engine/tikz-figure-pool.js"))).resume();
			this.tikzPool = new t(() => this.spawnFigureCompiler(), e, this.mainFile);
		}
		return this.tikzPool;
	}
	async readTikzFigureList(e, t) {
		let n = this.engine;
		if (!n) return null;
		let r = t ? [W, e] : [e, W];
		for (let e of r) {
			let t = ge((await this.operations.observe(n.readFile(`${e}.figlist`))).resume());
			if (t.length > 0) return {
				realJob: e,
				names: t
			};
		}
		return null;
	}
	*projectFileEntries() {
		for (let e of this.fs.listFiles()) {
			if (this.generatedFiles.has(e)) continue;
			let t = this.fs.getFile(e);
			t && (yield [e, t.content]);
		}
	}
	async exportAccessiblePdf(e = {}) {
		this.ensureInitialized();
		let t = this.mainSource(), { injectDocumentMetadata: n, documentClassOf: r, CLASS_SUPPORT: i } = await J(), a = n(t, e), o = r(t), s = o && i[o] || "unknown", c = Y(o, s, a.injected);
		return q(await this.compileForExport(a.source), a, o, s, c);
	}
	async compileForExport(e) {
		this.exportCompiler ||= this.spawnExportCompiler();
		let t = this.exportCompiler;
		for (let [e, n] of this.projectFileEntries()) e !== this.mainFile && this.exportSynced.get(e) !== n && (t.setFile(e, n), this.exportSynced.set(e, n));
		return t.setFile(this.mainFile, e), await t.init(), t.compile();
	}
	spawnExportCompiler() {
		let { files: t, ...n } = this.opts;
		return this.exportSynced.clear(), new e({
			...n,
			mainFile: this.mainFile,
			engine: this.engineKind,
			incremental: !1,
			tikzExternalization: { mode: "off" }
		});
	}
	spawnFigureCompiler() {
		let { files: t, backends: n, ...r } = this.opts;
		return new e({
			...r,
			mainFile: this.mainFile,
			engine: this.engineKind,
			incremental: !1,
			tikzExternalization: { mode: "off" }
		});
	}
	async syncModifiedFilesToEngine() {
		let e = this.engine;
		if (!e || this.unavailable) return;
		let t = this.fs.getModifiedFiles();
		(await this.operations.observe(this.ensureEngineDirectories(t.map((e) => e.path)))).resume(), (await this.operations.observe(Promise.all(t.map((t) => e.writeFile(t.path, this.engineContent(t.path, t.content)))))).resume(), this.fs.markSynced(t), e.setMainFile(this.mainFile);
	}
	async ensureEngineDirectories(e) {
		let t = this.engine;
		if (!t) return;
		let n = /* @__PURE__ */ new Set();
		for (let t of e) {
			let e = t.split("/"), r = "";
			for (let t = 0; t < e.length - 1; t++) r = r ? `${r}/${e[t]}` : e[t], n.add(r);
		}
		for (let e of Array.from(n).sort()) (await this.operations.observe(t.mkdir(e))).resume();
	}
	updateIndexForFile(e, t) {
		typeof t == "string" && (e.endsWith(".tex") && this.projectIndex.updateFile(e, t), e.endsWith(".bib") && this.updateBibIndex());
	}
	updateBibIndex() {
		L(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		if (!e.success) {
			this.projectIndex.updateAux(""), this.projectIndex.updateEngineCommands([]), this.projectIndex.updateSemanticTrace(z(""));
			return;
		}
		let t = this.mainFile.replace(/\.tex$/, ""), n = this.engine, r = (await this.operations.observe(F(`${t}.aux`, async (e) => (await this.operations.observe(n.readFile(e))).resume()))).resume();
		if (this.projectIndex.updateAuxData(P(r)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(z(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = k(t);
			if (!e) continue;
			let n = this.fs.getFile(e);
			n && typeof n.content == "string" && this.projectIndex.updateFile(n.path, n.content);
		}
	}
	async runAuxStages(e) {
		let t = (await this.operations.observe(this.maybeRunBibtex(e))).resume() || (await this.operations.observe(this.maybeRunBiblatex(e))).resume(), n = (await this.operations.observe(this.maybeRunMakeindex(e))).resume();
		return t || n;
	}
	async maybeRunBibtex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !this.fs.listFiles().some((e) => e.endsWith(".bib"))) return !1;
		let n = this.mainFile.replace(/\.tex$/, ""), r = (await this.operations.observe(t.readFile(`${n}.aux`))).resume();
		if (!r?.includes("\\citation{") || !r.includes("\\bibdata{") || this.fs.readFile(`${n}.bbl`)) return !1;
		let i = this.collectBibFiles(), a = {
			aux: r,
			bibFiles: i
		}, o = this.resolveProjectBst(r);
		o && (a.bstFiles = { [o.path]: o.content });
		let s = (await this.operations.observe(g(this.opts.backends, a))).resume() ?? (await this.operations.observe(this.runClientBibtex(n, r, i))).resume(), c = {
			stage: "bibliography",
			projectInputs: [...Object.keys(i), ...Object.keys(a.bstFiles ?? {})],
			complete: !!s
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", c), !s) return !1;
		let l = `${n}.bbl`, u = k(l) ?? l;
		return this.fs.writeFile(l, s), this.generatedFiles.add(u), this.generatedDependencyObservations.set(u, c), (await this.operations.observe(t.writeFile(l, s))).resume(), !0;
	}
	async maybeRunBiblatex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.mainSource();
		if (f(n) !== "biblatex") return !1;
		let r = this.mainFile.replace(/\.tex$/, "");
		if (this.fs.readFile(`${r}.bbl`)) return !1;
		let i = (await this.operations.observe(t.readFile(`${r}.bcf`))).resume();
		if (!i?.trim()) return !1;
		let a = this.collectBibFiles(), o = (u(n) === "biber" ? (await this.operations.observe(s(this.opts.backends, {
			bcf: i,
			bibFiles: a
		}))).resume() : null) ?? this.runClientBiblatexLite(n, i, a), c = {
			stage: "bibliography",
			projectInputs: Object.keys(a),
			complete: !!o
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", c), !o) return !1;
		let l = `${r}.bbl`, d = k(l) ?? l;
		return this.fs.writeFile(l, o), this.generatedFiles.add(d), this.generatedDependencyObservations.set(d, c), (await this.operations.observe(t.writeFile(l, o))).resume(), !0;
	}
	runClientBiblatexLite(e, t, n) {
		let r = Object.entries(n).flatMap(([e, t]) => I(t, e)), i = m(t), a = i.includes("*") ? r.map((e) => e.key) : i;
		return p({
			entries: r,
			citedKeys: a,
			sort: d(e)
		});
	}
	async maybeRunMakeindex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !x(this.mainSource())) return !1;
		let n = this.mainFile.replace(/\.tex$/, "");
		if (this.fs.readFile(`${n}.ind`)) return !1;
		let r = (await this.operations.observe(t.readFile(`${n}.idx`))).resume();
		if (!r?.trim()) return !1;
		let i = { idx: r }, a = (await this.operations.observe(S(this.opts.backends, i))).resume() ?? (await this.operations.observe(this.runClientMakeindex(n, r))).resume(), o = {
			stage: "index",
			projectInputs: [],
			complete: !!a
		};
		if (this.currentAuxiliaryDependencies.set("index", o), !a) return !1;
		let s = `${n}.ind`, c = k(s) ?? s;
		return this.fs.writeFile(s, a), this.generatedFiles.add(c), this.generatedDependencyObservations.set(c, o), (await this.operations.observe(t.writeFile(s, a))).resume(), !0;
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
		let r = (await this.operations.observe(this.ensureAuxEngine("bibtexEngine"))).resume();
		(await this.operations.observe(r.writeFile(`${e}.aux`, t))).resume();
		for (let [e, t] of Object.entries(n)) (await this.operations.observe(r.writeFile(e, t))).resume();
		let i = this.resolveProjectBst(t);
		return i && (await this.operations.observe(r.writeFile(i.path, i.content))).resume(), (await this.operations.observe(r.compile(e))).resume(), (await this.operations.observe(r.readFile(`${e}.bbl`))).resume() ?? null;
	}
	auxEngineOpts() {
		let e = {
			assetBaseUrl: this.assetBaseUrl,
			texliveVersion: this.opts.texliveVersion ?? "2025"
		};
		return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
	}
	async runClientMakeindex(e, t) {
		let n = (await this.operations.observe(this.ensureAuxEngine("makeindexEngine"))).resume();
		return (await this.operations.observe(n.writeFile(`${e}.idx`, t))).resume(), (await this.operations.observe(n.compile(e))).resume(), (await this.operations.observe(n.readFile(`${e}.ind`))).resume() ?? null;
	}
	async ensureAuxEngine(e) {
		let t = this[e];
		if (t) return t;
		let n = e === "bibtexEngine" ? new w(this.auxEngineOpts()) : new V(this.auxEngineOpts());
		this[e] = n;
		try {
			return (await this.operations.observe(n.init())).resume(), n;
		} catch (t) {
			throw this[e] === n && (this[e] = null, n.terminate()), t;
		}
	}
	ensureInitialized() {
		if (!this.initialized) throw Error("WasmTexCompiler is not initialized. Call init() first.");
	}
};
//#endregion
export { e as BIBER_STAGE, c as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, re as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, ie as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, v as MemoryCacheStore, $ as WasmTexCompiler, y as backendCacheKey, l as biblatexLiteBackend, ve as compileAccessiblePdf, b as contentKey, o as createBiberBackend, i as createJsonTextBackend, te as createMakeindexBackend, a as createRemoteBackend, ne as createXindyBackend, u as detectBiblatexBackend, d as detectBiblatexSort, f as detectBibliographyMode, x as detectIndexUse, p as generateBiblatexBbl, m as parseBcfCitedKeys, s as runRemoteBiber, g as runRemoteBibliography, S as runRemoteIndex, _ as selectBiblatexBackend, ee as withCache };
