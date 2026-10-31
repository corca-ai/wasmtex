import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runBiberBackend as s, runRemoteBiber as c } from "./engine/biber-backend.js";
import { BIBLIOGRAPHY_STAGE as l, biblatexLiteBackend as u, detectBiblatexBackend as d, detectBiblatexSort as f, detectBibliographyMode as p, generateBiblatexBbl as m, parseBcfCitedKeys as h, resolveBstFile as g, runRemoteBibliography as _, selectBiblatexBackend as v } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as y, backendCacheKey as b, contentKey as ee, withCache as te } from "./engine/content-cache.js";
import { createMakeindexBackend as ne, detectIndexUse as x, runRemoteIndex as S } from "./engine/index-backend.js";
import { createXindyBackend as re } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as ie, COMPLETION_SNAPSHOT_SCHEMA_VERSION as C, CompletionFileDigestCache as w, createCompletionSnapshot as T } from "./engine/completion-snapshot.js";
import { buildDependencyManifest as E, buildIncrementalDependencyManifest as ae, normalizeProjectDependencyPath as D } from "./engine/dependency-manifest.js";
import { collectBibliographyInputs as oe } from "./engine/bibliography-inputs.js";
import { BibtexEngine as se } from "./engine/bibtex-engine.js";
import { buildDiagnostics as O, parseTexErrors as k } from "./engine/parse-errors.js";
import { extractPreamble as A } from "./engine/preamble-utils.js";
import { WasmTexPdftexEngine as j } from "./engine/wasmtex-engine.js";
import { createCompileEngine as ce, unavailableEngineResult as le } from "./engine/compile-engine.js";
import { resolveEngine as ue } from "./engine/engine-select.js";
import { IncrementalCompiler as de } from "./engine/incremental.js";
import { RerunController as M, signatureOf as N } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as P } from "./fs/engine-sync.js";
import { VirtualFS as F } from "./fs/virtual-fs.js";
import { parseAuxFiles as I, readAuxFiles as L } from "./lsp/aux-files.js";
import { parseBibFile as R, rebuildBibIndex as z } from "./lsp/bib-parser.js";
import { ProjectIndex as B } from "./lsp/project-index.js";
import { parseTraceFile as V } from "./lsp/trace-parser.js";
import { CompilerOperations as H } from "./engine/compiler-operation.js";
import { MakeindexEngine as fe } from "./engine/makeindex-engine.js";
import { previewErrorsCovered as pe } from "./engine/preview-diagnostics.js";
import { buildTexliveDependencySet as me, mergeTexliveDependencySets as he } from "./engine/texlive-dependencies.js";
import { PREAMBLE_SNAPSHOT_JOBNAME as U, defaultFigureWorkers as ge, detectAutoBlocker as _e, detectTikzExternalization as ve, figureJobSource as ye, mainJobSource as be, parseFigureList as xe, parseFigureMd5 as Se } from "./engine/tikz-externalization.js";
//#region src/headless.ts
function W(e, t) {
	let n = [];
	for (let r of t) {
		let t = e.cache.get(r)?.log;
		t && n.push(...G(t));
	}
	return n;
}
function G(e) {
	return k(e).filter((e) => !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(e.message));
}
async function Ce(e, t = {}) {
	let n = e.mainFile ?? "main.tex", r = e.files?.[n], i = typeof r == "string" ? r : "", { injectDocumentMetadata: a, documentClassOf: o, CLASS_SUPPORT: s } = await q(), c = a(i, t), l = o(i), u = l && s[l] || "unknown", d = J(l, u, c.injected), f = new $({
		...e,
		files: {
			...e.files,
			[n]: c.source
		},
		incremental: !1,
		tikzExternalization: { mode: "off" }
	});
	try {
		return await f.init(), await K(await f.compile(), c, l, u, d);
	} finally {
		f.dispose();
	}
}
async function K(e, t, n, r, i) {
	let { kernelLacksTagging: a, inspectPdfTagging: o } = await q(), s = !a(e.log);
	s || i.push("This engine's LaTeX kernel predates tagging support (TeX Live 2025); use the TeX Live 2026 profile for accessible export.");
	let c = e.pdf ? await o(e.pdf) : null;
	return c && i.push(...we(c, s)), {
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
function q() {
	return import("./engine/accessible-export.js");
}
function J(e, t, n) {
	let r = [];
	return t === "unsupported" ? r.push(`Document class '${e}' is known not to work with the LaTeX tagging kernel; the export may fail or come out untagged.`) : t === "partial" ? r.push(`Document class '${e}' produces a structure tree but logs tagging errors; check the exported PDF.`) : t === "unknown" && e && r.push(`Document class '${e}' has not been verified with the tagging kernel.`), n || r.push("The document declares its own \\DocumentMetadata; it was exported as written."), r;
}
function we(e, t) {
	let n = [];
	return !e.tagged && t && n.push("The compile produced no structure tree; the PDF is not tagged."), e.figures > e.figuresWithAlt && n.push(`${e.figures - e.figuresWithAlt} of ${e.figures} figures have no text alternative (alt={…}).`), n;
}
function Te() {
	return typeof globalThis.process?.versions?.node == "string";
}
function Y(e, t) {
	return e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.tikzExternalization = t, e;
}
function X(e, t) {
	for (let n of t.pdfConversionInputs ?? []) e.add(n);
}
function Z(e, t) {
	t.size && (e.pdfConversionInputs = [...t].sort());
}
function Ee(e, t) {
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
function De(e, t) {
	return t && e.success && !!e.pdf && e.errors.length === 0;
}
function Oe(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var ke = [
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
	indexInput = null;
	incremental = null;
	heap = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	pagePreviewBaseline = null;
	pagePreviewErrors = [];
	pagePreviewRequiresCheckpoint = !1;
	operations = new H();
	initInFlight = null;
	replacingProject = !1;
	disposalRevision = 0;
	inputRevision = 0;
	fs;
	projectIndex = new B();
	completionDigests = new w();
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
		for (let t of Object.values(e.heapCheckpointOptions ?? {})) if (t !== void 0 && (!Number.isSafeInteger(t) || t < 0)) throw RangeError("Invalid heap checkpoint budget");
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = Oe(e.assetBaseUrl), this.fs = new F({ empty: !0 });
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
			...this.opts.formatAssetBaseUrl === void 0 ? {} : { formatAssetBaseUrl: this.opts.formatAssetBaseUrl },
			skipFormatPreload: !!this.opts.skipFormatPreload,
			disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
			persistentCache: !!this.opts.persistentCache,
			persistentPreambleCache: !!this.opts.persistentPreambleCache,
			preambleCacheIdentity: { mirrorRevision: this.opts.completionProfile?.mirrorRevision ?? null },
			resolverProfile: this.completionProfile(),
			texliveVersion: this.opts.texliveVersion ?? "2025",
			heapCheckpoints: !!this.opts.incremental && this.opts.heapCheckpoints !== !1 && !Te(),
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
		if (this.detection = ue(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
			if (this.engine?.terminate(), this.tikzPool?.dispose(), this.tikzPool = null, this.engineKind = this.detection.engine, this.engine = ce(this.detection.engine, this.engineBaseOpts()), this.attachLoadProgress(this.engine), this.opts.onEngineSelected) {
				let e = (e) => console.error("Engine selection observer failed", e);
				try {
					Promise.resolve(this.opts.onEngineSelected({ ...this.detection })).catch(e);
				} catch (t) {
					e(t);
				}
			}
			this.operations.assertCurrent(), this.incremental = this.opts.incremental && this.engine instanceof j ? new de(this.engine, { mainFile: this.mainFile }) : null, this.heap = this.opts.incremental && this.opts.heapCheckpoints !== !1 && this.engine instanceof j ? new ((await this.operations.observe(import("./engine/heap-checkpoints.js"))).resume()).HeapCheckpointCompiler(this.engine, {
				mainFile: this.mainFile,
				...this.opts.heapCheckpointOptions
			}) : null;
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
	async compile(e) {
		return this.compileOperation(!1, e);
	}
	async compilePreview(e) {
		return this.compileOperation(!0, e);
	}
	async createPagePreviewSession(t, n) {
		this.ensureInitialized(), this.assertNoProjectReplacement();
		let r = this.engine;
		if (!(r instanceof j) || !this.heap || this.compileInFlight || this.prebuildInFlight || this.operations.busy || this.pagePreviewBaseline === null || this.fs.getModifiedFiles().length || this.tikzExternalizationKind()) return null;
		let i = t ? this.heap.previewCheckpointForEdit(this.mainSource(), this.projectTexFiles(), t.path, t.offset) : this.heap.previewCheckpoint(this.mainSource(), this.projectTexFiles());
		if (!i) return null;
		let a = t ? this.heap.previewCheckpointForEdit(this.mainSource(), this.projectTexFiles(), t.path, 0) : void 0, o = this.heap.cloneForEngine(r, [i, a]), s = this.pagePreviewBaseline, c = this.pagePreviewErrors.map((e) => ({ ...e })), l = this.mainFile, u = this.disposalRevision, d = this.fs, f = { ...this.detection }, p = { ...this.opts };
		delete p.onLoadProgress, delete p.onEngineSelected;
		let m = {};
		for (let e of this.fs.listFiles()) {
			let t = this.fs.readFile(e);
			t !== null && (m[e] = typeof t == "string" ? t : t.slice());
		}
		let h = await r.forkForPagePreview(i, n, a);
		if (!h) return null;
		if (this.disposalRevision !== u || this.fs !== d || this.engine !== r || n?.aborted) return h.terminate(), n?.throwIfAborted(), null;
		let g = new e({
			...p,
			files: m,
			mainFile: l,
			tikzExternalization: { mode: "off" }
		});
		return g.engine = h, g.engineKind = "pdflatex", g.detection = f, g.initialized = !0, g.fs.markSynced(), g.heap = o.cloneForEngine(h, [i, h.pagePreviewFallbackId]), g.pagePreviewBaseline = s, g.pagePreviewErrors = c, {
			setFile: (e, t) => g.setFile(e, t),
			previewPages: (e) => g.previewPages(e),
			dispose: () => g.dispose()
		};
	}
	async previewPages(e) {
		if (!Number.isSafeInteger(e) || e < 1 || e > 1e4) throw RangeError("Invalid preview page limit");
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		if (this.pagePreviewBaseline === null || A(this.pagePreviewBaseline)?.preamble !== A(this.mainSource())?.preamble || this.tikzExternalizationKind()) return null;
		this.compileInFlight = !0;
		let t = this.inputRevision;
		try {
			this.prebuildInFlight && await this.prebuildInFlight, this.assertRevision(t);
			let n = await this.operations.run(() => this.previewPagesIdle(e));
			return this.assertRevision(t), n;
		} finally {
			this.compileInFlight = !1;
		}
	}
	async previewPagesIdle(e) {
		(await this.operations.observe(this.ensureEngine())).resume();
		let t = this.engine;
		if (!(t instanceof j)) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume();
		let n = this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles());
		if (this.pagePreviewRequiresCheckpoint && !n) return null;
		let r = (await this.operations.observe(t.compilePagePreview(e, n))).resume();
		return !r?.success || !r.pdf || !pe(this.pagePreviewErrors, r.errors) ? null : {
			pdf: r.pdf,
			synctex: r.synctex,
			compileTime: r.compileTime,
			pageLimit: e
		};
	}
	getRetentionStats() {
		return this.incremental?.getRetentionStats() ?? {
			checkpointCount: 0,
			checkpointFormatBytes: 0,
			checkpointPdfBytes: 0,
			synctexBytes: 0
		};
	}
	async compileOperation(e, t) {
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		this.compileInFlight = !0;
		let n = this.inputRevision;
		try {
			this.prebuildInFlight && await this.prebuildInFlight, this.assertRevision(n);
			let r = await this.operations.run(() => this.compileIdle(e, t));
			return this.assertRevision(n), this.pagePreviewBaseline = r.success && r.pdf ? this.mainSource() : null, this.pagePreviewErrors = this.pagePreviewBaseline === null ? [] : r.errors.map((e) => ({ ...e })), this.pagePreviewRequiresCheckpoint = !1, r;
		} finally {
			this.compileInFlight = !1;
		}
	}
	emitProgressPdf(e, t, n) {
		if (!(!t?.onProgressPdf || !e.success || !e.pdf)) try {
			t.onProgressPdf({
				pdf: e.pdf.slice(),
				compileTime: performance.now() - n
			});
		} catch {}
	}
	async compileIdle(e, t) {
		let n = performance.now();
		if (this.currentAuxiliaryDependencies.clear(), (await this.operations.observe(this.ensureEngine())).resume(), this.unavailable || !this.engine) {
			let e = le(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let r = this.engine;
		if ((await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), r.setPreambleSnapshot) {
			let e = !this.opts.disablePreambleSnapshot && !x(this.mainSource());
			r.setPreambleSnapshot(e);
		}
		let i = this.tikzExternalizationKind(), a = (await this.operations.observe(this.tryIncrementalFastPath(i, e))).resume();
		if (a) return a;
		let o = (await this.operations.observe(this.tryHeapResume(i, t?.incrementalPreparation))).resume() ?? (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), s = new Set(o.pdfConversionInputs ?? []), c = [o.telemetry?.resolver];
		o = (await this.operations.observe(this.applyTikzExternalization(o, i, c))).resume(), X(s, o);
		let l = o.telemetry?.tikzExternalization;
		this.emitProgressPdf(o, t, n), this.operations.assertCurrent();
		let u = (await this.operations.observe(this.runAuxStages(o))).resume(), d = new M(), f = !1;
		for (; o.success || o.pdf;) {
			let e = (await this.operations.observe(this.rerunSignature(o))).resume(), n = d.decide(o.log, e, u);
			if (!n.rerun) {
				f = !n.stopped;
				break;
			}
			this.incremental?.reset(), this.heap?.reset(), (await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), o = (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), c.push(o.telemetry?.resolver), X(s, o), u = (await this.operations.observe(this.runAuxStages(o))).resume();
		}
		return this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), o), l && (o.telemetry ??= { diagnostics: O(o.log) }, o.telemetry.tikzExternalization = l), Z(o, s), this.attachTexliveDependencies(o, c), o.telemetry ??= { diagnostics: O(o.log) }, o.telemetry.referencesSettled = De(o, f), (await this.operations.observe(this.updateMetadata(o))).resume(), this.attachDependencyManifest(o), (await this.operations.observe(this.attachCompletionSnapshot(o))).resume(), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), o.synctex), o;
	}
	async rerunSignature(e) {
		let t = e.semanticTrace ?? e.log;
		if (!e.log.includes("Rerun to get outlines right")) return N(t);
		let n = (await this.operations.observe(this.engine?.readFile(this.mainFile.replace(/\.tex$/, ".out")))).resume();
		return N(`${t}\n${n ?? ""}`);
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
		if (!i || !a || !(a instanceof j)) return !1;
		let o = this.heapPreparationOffset(n, r);
		if (o === void 0) return !1;
		let s = i.armsForFullCompile(e, t, o);
		if (s.length === 0) return !1;
		let c = (await this.operations.observe(a.compile({ checkpoints: s }))).resume();
		return i.noteFull(e, t, c), (c.heapCheckpoints?.length ?? 0) > 0;
	}
	heapPreparationOffset(e, t) {
		let n = this.fs.readFile(e);
		if (typeof n != "string" || !e.toLowerCase().endsWith(".tex") || !Number.isSafeInteger(t) || t < 0 || t > n.length) return;
		if (e === this.mainFile) return t;
		let r = this.mainSource().indexOf(`{${e.replace(/\.tex$/, "")}}`);
		return r < 0 ? void 0 : r;
	}
	heapArms(e) {
		if (!this.heap?.enabled) return;
		let t = this.heap.armsForFullCompile(this.mainSource(), this.projectTexFiles(), e ? this.heapPreparationOffset(e.path, e.offset) : void 0, e);
		return t.length ? { checkpoints: t } : void 0;
	}
	async tryHeapResume(e, t) {
		if (!this.heap?.enabled) return null;
		let n = (await this.operations.observe(this.heap.tryResume(this.mainSource(), this.projectTexFiles(), e ? (e) => this.acceptTikzCheckpointInputs(e) : void 0, t ? this.heapPreparationOffset(t.path, t.offset) : void 0, t))).resume();
		return !n || !n.final || !n.result.pdf ? null : n.result;
	}
	acceptTikzCheckpointInputs(e) {
		let t = this.projectTexFiles();
		return e.length > 0 && e.every((e) => {
			if (e.startsWith("/tex/")) return !0;
			let n = e.replace(/^(?:\/work\/|\.\/)/, "");
			return n === this.mainFile ? !0 : n === "_preamble.tex" ? !this.fs.getFile(n) : n.startsWith("__") ? n === "__strace.tex" && !this.fs.getFile(n) : n.startsWith(".") || n.startsWith("/") ? !1 : t.has(n) || !this.fs.getFile(n) && (n === "texmf.cnf" || n === "pdflatex.fmt" || n.endsWith(".aux"));
		});
	}
	toCompileResult(e, t) {
		let n = {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: k(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: O(e.log) }
		};
		return n.telemetry.dependencyManifest = ae(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.assertNoProjectReplacement();
		let n = this.pagePreviewBaseline;
		e !== this.mainFile && (this.pagePreviewBaseline = null), this.invalidateOperation(), this.projectIndex.invalidateCompletionSnapshot();
		let r = !!this.fs.getFile(e);
		this.fs.writeFile(e, t);
		let i = D(e) ?? e;
		if (this.generatedFiles.delete(i), this.generatedDependencyObservations.delete(i), this.indexInput?.path === e && (this.indexInput = null), this.currentAuxiliaryDependencies.clear(), (e.endsWith(".tex") || e.endsWith(".bib") || e.endsWith(".bst")) && !e.endsWith(".bbl")) {
			let e = this.mainFile.replace(/\.tex$/, "");
			this.dropGeneratedFile(`${e}.bbl`);
		}
		e !== this.mainFile && e.endsWith(".tex") && (r ? this.heap?.invalidateFile(e, t) : this.heap?.reset(), r && n !== null && this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles()) && (this.pagePreviewBaseline = n, this.pagePreviewRequiresCheckpoint = !0)), e.endsWith(".tex") || (this.incremental?.reset(), this.heap?.reset()), this.updateIndexForFile(e, t);
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
		this.pagePreviewBaseline = null, this.fs = new F({ empty: !0 }), this.projectIndex = new B(), this.generatedFiles.clear(), this.indexInput = null, this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset(), this.heap?.reset();
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
		t && (this.pagePreviewBaseline = null, this.projectIndex.invalidateCompletionSnapshot(), t && this.invalidateOperation(), this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, t && (this.indexInput = null, this.incremental?.setMainFile(e), this.heap?.reset()), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e));
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
		this.indexInput?.path === e && (this.indexInput = null), this.fs.deleteFile(e);
		let t = D(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = new Map(this.currentAuxiliaryDependencies);
		for (let n of e.inputFiles ?? []) {
			let e = D(n);
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
		for (let e of ke) n.add(`${r}.${e}`);
		let i = me(this.opts.texliveVersion ?? "2025", this.completionProfile(), t, { excludeNames: n });
		i && (this.sessionDependencies = he(this.sessionDependencies, i), e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.texliveDependencies = this.sessionDependencies);
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: O(e.log) };
		let t = E({
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
		}))))).resume(), i = t.getCompletionObservation?.(), a = (await this.operations.observe(T({
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
		n !== this.mainFile || t !== this.engine || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.completionSnapshot = a, this.projectIndex.updateCompletionSnapshot(a));
	}
	async syncAllFilesToEngine() {
		let e = this.engine;
		!e || this.unavailable || (await this.operations.observe(P(this.fs, {
			writeFile: (t, n) => e.writeFile(t, this.engineContent(t, n)),
			setMainFile: (t) => e.setMainFile(t)
		}, (e) => this.ensureEngineDirectories(e), this.mainFile))).resume();
	}
	engineContent(e, t) {
		if (e !== this.mainFile || typeof t != "string") return t;
		let n = this.tikzExternalizationKind(t);
		return n ? be(t, n) : t;
	}
	tikzExternalizationKind(e = this.mainSource()) {
		let t = ve(e, this.opts.tikzExternalization?.mode ?? "document");
		return t === "inject" ? this.tikzAutoDisabled ? null : (this.tikzAutoBlocker = _e(e, this.projectTexFiles().values()), this.tikzAutoBlocker ? null : t) : t;
	}
	async tryIncrementalFastPath(e, t) {
		if (!this.incremental || e) return null;
		let n = performance.now(), r = this.mainSource(), i = this.projectTexFiles();
		if (!this.incremental.canFastServe(r, i)) return null;
		let a = (await this.operations.observe(t ? this.incremental.tryIncremental(r, i, !0) : this.incremental.tryIncremental(r, i))).resume();
		return a?.final && a.pdf ? this.toCompileResult(a, performance.now() - n) : null;
	}
	async applyTikzExternalization(e, t, n) {
		if (t && (e.success || e.pdf)) return this.externalizeTikzFigures(e, t, n);
		if (t === "inject" && this.engine) {
			this.tikzAutoDisabled = !0, (await this.operations.observe(this.engine.writeFile(this.mainFile, this.mainSource()))).resume();
			let e = (await this.operations.observe(this.engine.compile())).resume();
			return n.push(e.telemetry?.resolver), Y(e, {
				...Q("auto"),
				fallback: !0
			});
		}
		return this.opts.tikzExternalization?.mode === "auto" && this.tikzAutoBlocker && (e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.tikzExternalization = {
			...Q("auto"),
			blocked: this.tikzAutoBlocker
		}), e;
	}
	async externalizeTikzFigures(e, t, n) {
		let r = this.engine;
		if (!r) return e;
		let i = !!r.setPreambleSnapshot && !this.opts.disablePreambleSnapshot, a = (await this.operations.observe(this.runTikzFigureJobs(e, t, i))).resume();
		if (!a) {
			if (!e.phaseTimings?.checkpointResume) return e;
			let t = (await this.operations.observe(r.compile())).resume();
			return n.push(t.telemetry?.resolver), t;
		}
		let { telemetry: o, errors: s, failureLog: c } = a;
		if (t === "inject" && (a.inline || o.failed.length > 0)) {
			this.tikzAutoDisabled = !0, a.inline || (o.fallback = !0), (await this.operations.observe(r.writeFile(this.mainFile, this.mainSource()))).resume();
			let e = (await this.operations.observe(r.compile())).resume();
			return n.push(e.telemetry?.resolver), Y(e, o);
		}
		let l = o.compiled > 0 || e.phaseTimings?.checkpointResume ? (await this.operations.observe(r.compile())).resume() : e;
		return l !== e && n.push(l.telemetry?.resolver), o.pictureErrors = Ee(l, s), c && (l.log += c), Y(l, o);
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
			return t.blocked = "too-few-pictures", e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.tikzExternalization = t, {
				telemetry: t,
				errors: [],
				failureLog: "",
				inline: !0
			};
		}
		let c = globalThis.navigator, l = this.opts.tikzExternalization?.workers ?? ge(c?.hardwareConcurrency, c?.deviceMemory), u = (await this.operations.observe(this.ensureTikzPool(l))).resume();
		u.retain(s);
		let d = (await this.operations.observe(Promise.all(s.map((e) => r.readFile(`${e}.md5`))))).resume(), f = s.map((e, t) => ({
			name: e,
			md5: Se(d[t])
		})).filter((e) => !u.isCurrent(e.name, e.md5)), p = {
			...Q(t === "inject" ? "auto" : "document"),
			figures: s.length,
			reused: s.length - f.length,
			workers: Math.min(l, Math.max(1, f.length))
		};
		if (p.discoveryCheckpointResume = e.phaseTimings?.checkpointResume === !0, e.telemetry ??= { diagnostics: O(e.log) }, e.telemetry.tikzExternalization = p, f.length === 0) return {
			telemetry: p,
			errors: W(u, s),
			failureLog: ""
		};
		let m = this.mainSource(), h = [], g = (await this.operations.observe(r.readFile(`${i}.aux`))).resume();
		g !== null && h.push([`${o}.aux`, g]);
		for (let e of this.projectTexFiles().keys()) {
			if (e === this.mainFile) continue;
			let t = `${e.replace(/\.tex$/i, "")}.aux`, n = (await this.operations.observe(r.readFile(t))).resume();
			n !== null && h.push([t, n]);
		}
		let _ = (await this.operations.observe(u.render(f, (e) => ye(m, t, o, e), () => [...this.projectFileEntries(), ...h]))).resume();
		p.compiled = _.rendered.size, p.failed = _.failures.map((e) => e.name), p.figureTimeMs = Math.round(_.elapsedMs);
		let v = W(u, s), y = "";
		for (let e of _.failures) v.push(...G(e.log)), y += `\n[wasmtex] TikZ figure job '${e.name}' failed:\n${e.log.slice(-2e3)}\n`;
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
			this.tikzPool = new t(() => this.spawnFigureCompiler(), e, this.mainFile, this.opts.tikzExternalization?.idleMs);
		}
		return this.tikzPool;
	}
	async readTikzFigureList(e, t) {
		let n = this.engine;
		if (!n) return null;
		let r = t ? [U, e] : [e, U];
		for (let e of r) {
			let t = xe((await this.operations.observe(n.readFile(`${e}.figlist`))).resume());
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
		let t = this.mainSource(), { injectDocumentMetadata: n, documentClassOf: r, CLASS_SUPPORT: i } = await q(), a = n(t, e), o = r(t), s = o && i[o] || "unknown", c = J(o, s, a.injected);
		return K(await this.compileForExport(a.source), a, o, s, c);
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
		z(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		if (!e.success) {
			this.projectIndex.updateAux(""), this.projectIndex.updateEngineCommands([]), this.projectIndex.updateSemanticTrace(V(""));
			return;
		}
		let t = this.mainFile.replace(/\.tex$/, ""), n = this.engine, r = (await this.operations.observe(L(`${t}.aux`, async (e) => (await this.operations.observe(n.readFile(e))).resume()))).resume();
		if (this.projectIndex.updateAuxData(I(r)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(V(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = D(t);
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
		let i = this.collectBibFiles(), { bibFiles: a, hasGenerated: o } = (await this.operations.observe(oe(r, i, (e) => t.readFile(e)))).resume(), s = {
			aux: r,
			bibFiles: a
		}, c = this.resolveProjectBst(r);
		c && (s.bstFiles = { [c.path]: c.content });
		let l = (await this.operations.observe(_(this.opts.backends, s))).resume() ?? (await this.operations.observe(this.runClientBibtex(n, r, a))).resume(), u = {
			stage: "bibliography",
			projectInputs: [
				...Object.keys(i),
				...Object.keys(s.bstFiles ?? {}),
				...o ? this.projectTexFiles().keys() : []
			],
			complete: !!l
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", u), !l) return !1;
		let d = `${n}.bbl`, f = D(d) ?? d;
		return this.fs.writeFile(d, l), this.generatedFiles.add(f), this.generatedDependencyObservations.set(f, u), (await this.operations.observe(t.writeFile(d, l))).resume(), !0;
	}
	async maybeRunBiblatex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.mainSource();
		if (p(n) !== "biblatex") return !1;
		let r = this.mainFile.replace(/\.tex$/, "");
		if (this.fs.readFile(`${r}.bbl`)) return !1;
		let i = (await this.operations.observe(t.readFile(`${r}.bcf`))).resume();
		if (!i?.trim()) return !1;
		let a = this.collectBibFiles(), o = (d(n) === "biber" ? (await this.operations.observe(s(this.opts.backends, {
			bcf: i,
			bibFiles: a
		}, { signal: this.operations.signal }))).resume() : null) ?? this.runClientBiblatexLite(n, i, a), c = {
			stage: "bibliography",
			projectInputs: Object.keys(a),
			complete: !!o
		};
		if (this.currentAuxiliaryDependencies.set("bibliography", c), !o) return !1;
		let l = `${r}.bbl`, u = D(l) ?? l;
		return this.fs.writeFile(l, o), this.generatedFiles.add(u), this.generatedDependencyObservations.set(u, c), (await this.operations.observe(t.writeFile(l, o))).resume(), !0;
	}
	runClientBiblatexLite(e, t, n) {
		let r = Object.entries(n).flatMap(([e, t]) => R(t, e)), i = h(t), a = i.includes("*") ? r.map((e) => e.key) : i;
		return m({
			entries: r,
			citedKeys: a,
			sort: f(e)
		});
	}
	async maybeRunMakeindex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !x(this.mainSource())) return !1;
		let n = this.mainFile.replace(/\.tex$/, ""), i = `${n}.ind`, a = D(i) ?? i, o = this.fs.readFile(i);
		if (o !== null && !this.generatedFiles.has(a)) return !1;
		let s = (await this.operations.observe(t.readFile(`${n}.idx`))).resume();
		if (s === null) return !1;
		let c = this.opts.backends?.resolve(r), l = c?.location === "server" ? c : null;
		if (this.matchesIndexInput(i, s, l) || !s.trim() && o === null) return !1;
		let u = s.trim() ? await this.buildIndex(n, s) : "", d = {
			stage: "index",
			projectInputs: [],
			complete: u !== null
		};
		return this.currentAuxiliaryDependencies.set("index", d), u === null || (this.indexInput = {
			path: i,
			idx: s,
			backend: l,
			version: l?.version
		}, this.generatedFiles.add(a), this.generatedDependencyObservations.set(a, d), o === u) ? !1 : (this.incremental?.reset(), this.heap?.reset(), this.fs.writeFile(i, u), (await this.operations.observe(t.writeFile(i, u))).resume(), !0);
	}
	matchesIndexInput(e, t, n) {
		let r = this.indexInput;
		return this.fs.readFile(e) !== null && !!r && r.path === e && r.idx === t && r.backend === n && r.version === n?.version;
	}
	async buildIndex(e, t) {
		let n = { idx: t };
		return (await this.operations.observe(S(this.opts.backends, n))).resume() ?? (await this.operations.observe(this.runClientMakeindex(e, t))).resume();
	}
	resolveProjectBst(e) {
		return g(e, (e) => {
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
		let n = e === "bibtexEngine" ? new se(this.auxEngineOpts()) : new fe(this.auxEngineOpts());
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
export { e as BIBER_STAGE, l as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, ie as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, C as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, y as MemoryCacheStore, $ as WasmTexCompiler, b as backendCacheKey, u as biblatexLiteBackend, Ce as compileAccessiblePdf, ee as contentKey, o as createBiberBackend, i as createJsonTextBackend, ne as createMakeindexBackend, a as createRemoteBackend, re as createXindyBackend, d as detectBiblatexBackend, f as detectBiblatexSort, p as detectBibliographyMode, x as detectIndexUse, m as generateBiblatexBbl, h as parseBcfCitedKeys, s as runBiberBackend, c as runRemoteBiber, _ as runRemoteBibliography, S as runRemoteIndex, v as selectBiblatexBackend, te as withCache };
