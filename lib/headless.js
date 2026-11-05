import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runBiberBackend as s, runRemoteBiber as c } from "./engine/biber-backend.js";
import { stripTexComments as l } from "./engine/tex-comments.js";
import { BIBLIOGRAPHY_STAGE as u, biblatexLiteBackend as d, detectBiblatexBackend as f, detectBiblatexSort as p, detectBibliographyMode as m, generateBiblatexBbl as h, parseBcfCitedKeys as g, resolveBstFile as _, runRemoteBibliography as v, selectBiblatexBackend as y } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as b, backendCacheKey as ee, contentKey as te, withCache as ne } from "./engine/content-cache.js";
import { createMakeindexBackend as re, detectIndexUse as x, runRemoteIndex as S } from "./engine/index-backend.js";
import { createXindyBackend as ie } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as ae, COMPLETION_SNAPSHOT_SCHEMA_VERSION as oe, CompletionFileDigestCache as se, createCompletionSnapshot as ce } from "./engine/completion-snapshot.js";
import { AssetDownloadError as le, AssetDownloadSession as ue } from "./engine/asset-download.js";
import { parseAuxFiles as de, readAuxFiles as fe } from "./lsp/aux-files.js";
import { buildDependencyManifest as pe, buildIncrementalDependencyManifest as me, normalizeProjectDependencyPath as C } from "./engine/dependency-manifest.js";
import { bibtexControl as w, collectBibliographyInputs as T, flattenAuxInputs as he, sameBibliographyInput as E } from "./engine/bibliography-inputs.js";
import { BibtexEngine as ge } from "./engine/bibtex-engine.js";
import { buildDiagnostics as D, isOverfullBox as _e, parseTexErrors as O } from "./engine/parse-errors.js";
import { extractPreamble as k } from "./engine/preamble-utils.js";
import { WasmTexPdftexEngine as A } from "./engine/wasmtex-engine.js";
import { WasmTexLuatexEngine as j } from "./engine/luatex-engine.js";
import { WasmTexXetexEngine as M } from "./engine/xetex-engine.js";
import { createCompileEngine as N, unavailableEngineResult as P } from "./engine/compile-engine.js";
import { resolveEngine as F } from "./engine/engine-select.js";
import { IncrementalCompiler as I } from "./engine/incremental.js";
import { RerunController as ve, signatureOf as L } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as ye } from "./fs/engine-sync.js";
import { VirtualFS as R } from "./fs/virtual-fs.js";
import { parseBibFile as be, rebuildBibIndex as xe } from "./lsp/bib-parser.js";
import { ProjectIndex as z } from "./lsp/project-index.js";
import { parseTraceFile as B } from "./lsp/trace-parser.js";
import { CompilerOperations as Se } from "./engine/compiler-operation.js";
import { MakeindexEngine as Ce } from "./engine/makeindex-engine.js";
import { previewErrorsCovered as V } from "./engine/preview-diagnostics.js";
import { opensListInPreamble as we, secondaryAuxBases as Te, secondaryIndexJobs as Ee, usesBibunits as De } from "./engine/secondary-stages.js";
import { buildTexliveDependencySet as Oe, mergeTexliveDependencySets as ke } from "./engine/texlive-dependencies.js";
import { PREAMBLE_SNAPSHOT_JOBNAME as H, defaultFigureWorkers as Ae, detectAutoBlocker as je, detectTikzExternalization as Me, figureJobSource as Ne, mainJobSource as Pe, parseFigureList as Fe, parseFigureMd5 as Ie } from "./engine/tikz-externalization.js";
//#region src/headless.ts
function U(e, t) {
	let n = [];
	for (let r of t) {
		let t = e.cache.get(r)?.log;
		t && n.push(...W(t));
	}
	return n;
}
function W(e) {
	return O(e).filter((e) => !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(e.message));
}
async function Le(e, t = {}) {
	let n = e.mainFile ?? "main.tex", r = e.files?.[n], i = typeof r == "string" ? r : "", { injectDocumentMetadata: a, documentClassOf: o, CLASS_SUPPORT: s } = await K(), c = a(i, t), l = o(i), u = l && s[l] || "unknown", d = q(l, u, c.injected), f = new $({
		...e,
		files: {
			...e.files,
			[n]: c.source
		},
		incremental: !1,
		luatexHeapCheckpoints: void 0,
		tikzExternalization: { mode: "off" }
	});
	try {
		return await f.init(), await G(await f.compile(), c, l, u, d);
	} finally {
		f.dispose();
	}
}
async function G(e, t, n, r, i) {
	let { kernelLacksTagging: a, inspectPdfTagging: o } = await K(), s = !a(e.log);
	s || i.push("This engine's LaTeX kernel predates tagging support (TeX Live 2025); use the TeX Live 2026 profile for accessible export.");
	let c = e.pdf ? await o(e.pdf) : null;
	return c && i.push(...Re(c, s)), {
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
function K() {
	return import("./engine/accessible-export.js");
}
function q(e, t, n) {
	let r = [];
	return t === "unsupported" ? r.push(`Document class '${e}' is known not to work with the LaTeX tagging kernel; the export may fail or come out untagged.`) : t === "partial" ? r.push(`Document class '${e}' produces a structure tree but logs tagging errors; check the exported PDF.`) : t === "unknown" && e && r.push(`Document class '${e}' has not been verified with the tagging kernel.`), n || r.push("The document declares its own \\DocumentMetadata; it was exported as written."), r;
}
function Re(e, t) {
	let n = [];
	return !e.tagged && t && n.push("The compile produced no structure tree; the PDF is not tagged."), e.figures > e.figuresWithAlt && n.push(`${e.figures - e.figuresWithAlt} of ${e.figures} figures have no text alternative (alt={…}).`), n;
}
function ze() {
	return typeof globalThis.process?.versions?.node == "string";
}
function J(e, t) {
	return e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.tikzExternalization = t, e;
}
function Y(e, t) {
	for (let n of t.pdfConversionInputs ?? []) e.add(n);
}
function Be(e, t) {
	t.size && (e.pdfConversionInputs = [...t].sort());
}
function Ve(e, t) {
	let n = (e) => `${e.file ?? ""}:${e.line ?? ""}:${e.message}`, r = new Set(e.errors.map(n));
	for (let i of t) r.has(n(i)) || (r.add(n(i)), e.errors.push(i));
	return t.length;
}
function X(e) {
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
function He(e) {
	return e.code === "missing-glyph" || _e(e.message);
}
function Ue(e, t) {
	return t && e.success && !!e.pdf && e.errors.every(He);
}
function Z(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var We = [
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
	"nls",
	"loa",
	"thm",
	"xdy"
], Ge = [
	"toc",
	"lof",
	"lot",
	"loa",
	"thm",
	"nav",
	"snm"
], Ke = 200, qe = /\\(?:appendix|frontmatter|mainmatter|backmatter|pagenumbering|pagestyle|(?:re|provide|new)command|[gex]?def|let|(?:set|addto)length|newtheorem|newcounter|markboth|markright|setcounter\s*\{(?:secnumdepth|tocdepth)\})(?![a-zA-Z])/;
function Q(e) {
	return e instanceof j || e instanceof M;
}
var $ = class e {
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
	bibliographyRequest = null;
	secondaryRequests = /* @__PURE__ */ new Map();
	secondaryBibliographies = /* @__PURE__ */ new Map();
	secondaryLabels = /* @__PURE__ */ new Map();
	incremental = null;
	heap = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	pagePreviewBaseline = null;
	pagePreviewErrors = [];
	pagePreviewRequiresCheckpoint = !1;
	compiled = !1;
	previewEdits = /* @__PURE__ */ new Set();
	operations = new Se();
	initInFlight = null;
	replacingProject = !1;
	disposalRevision = 0;
	inputRevision = 0;
	fs;
	projectIndex = new z();
	completionDigests = new se();
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
		for (let t of [...Object.values(e.heapCheckpointOptions ?? {}), ...Object.values(e.luatexHeapCheckpoints ?? {})]) if (t !== void 0 && (!Number.isSafeInteger(t) || t < 0)) throw RangeError("Invalid heap checkpoint budget");
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = Z(e.assetBaseUrl), this.fs = new R({ empty: !0 });
		for (let [t, n] of Object.entries(e.files ?? {})) this.fs.writeFile(t, n), this.updateIndexForFile(t, n);
	}
	assetCompileAttemptStarted = !1;
	ownsAssetAttempt = !0;
	assetDownloads = new ue((e) => this.opts.onAssetDownload?.(e));
	attachLoadProgress(e) {
		e.setAssetDownloadSession?.(this.assetDownloads), e.onAssetDownload = (e) => this.opts.onAssetDownload?.(e);
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
			heapCheckpoints: !!this.opts.incremental && this.opts.heapCheckpoints !== !1 && !ze(),
			...this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}
		};
		return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
	}
	mainSource() {
		let e = this.fs.readFile(this.mainFile);
		return typeof e == "string" ? e : "";
	}
	get jobBase() {
		return this.mainFile.replace(/\.tex$/i, "").slice(this.mainFile.lastIndexOf("/") + 1);
	}
	projectSources() {
		return this.fs.listFiles().filter((e) => /\.(?:tex|sty|cls)$/.test(e)).map((e) => this.fs.readFile(e)).filter((e) => typeof e == "string");
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
	heapEngine() {
		return this.opts.incremental && this.opts.heapCheckpoints !== !1 && this.engine instanceof A ? {
			engine: this.engine,
			options: this.opts.heapCheckpointOptions
		} : this.opts.luatexHeapCheckpoints && this.engine instanceof j ? {
			engine: this.engine,
			options: this.opts.luatexHeapCheckpoints
		} : null;
	}
	async ensureEngine() {
		if (this.detection = F(this.mainSource(), this.opts.engine), this.engine && this.detection.engine === this.engineKind) return;
		if (this.engine?.terminate(), this.tikzPool?.dispose(), this.tikzPool = null, this.engineKind = this.detection.engine, this.engine = N(this.detection.engine, {
			...this.engineBaseOpts(),
			luatexHeapCheckpoints: this.detection.engine === "lualatex" && !!this.opts.luatexHeapCheckpoints
		}), this.attachLoadProgress(this.engine), this.opts.onEngineSelected) {
			let e = (e) => console.error("Engine selection observer failed", e);
			try {
				Promise.resolve(this.opts.onEngineSelected({ ...this.detection })).catch(e);
			} catch (t) {
				e(t);
			}
		}
		this.operations.assertCurrent(), this.incremental = this.opts.incremental && this.engine instanceof A ? new I(this.engine, { mainFile: this.mainFile }) : null;
		let e = this.heapEngine();
		this.heap = e ? new ((await this.operations.observe(import("./engine/heap-checkpoints.js"))).resume()).HeapCheckpointCompiler(e.engine, {
			mainFile: this.mainFile,
			...e.options
		}) : null;
		try {
			(await this.operations.observe(this.engine.init())).resume(), this.unavailable = null, (await this.operations.observe(this.syncAllFilesToEngine())).resume();
		} catch (e) {
			if (this.operations.assertCurrent(), this.detection.engine === "pdflatex" || e instanceof le) throw e;
			this.unavailable = this.detection;
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
	supportsPagePreviewSessions() {
		return this.engine instanceof A && !!this.heap;
	}
	async createPagePreviewSession(t, n) {
		this.ensureInitialized(), this.assertNoProjectReplacement();
		let r = this.engine;
		if (!(r instanceof A) || !this.heap || this.compileInFlight || this.prebuildInFlight || this.operations.busy || this.pagePreviewBaseline === null || this.fs.getModifiedFiles().length || this.tikzExternalizationKind()) return null;
		let i = t ? this.heap.previewCheckpointForEdit(this.mainSource(), this.projectTexFiles(), t.path, t.offset) : this.heap.previewCheckpoint(this.mainSource(), this.projectTexFiles());
		if (!i) return null;
		let a = t ? this.heap.previewCheckpointForEdit(this.mainSource(), this.projectTexFiles(), t.path, 0) : void 0, o = this.heap.cloneForEngine(r, [i, a]), s = this.pagePreviewBaseline, c = this.pagePreviewErrors.map((e) => ({ ...e })), l = this.mainFile, u = this.disposalRevision, d = this.fs, f = { ...this.detection }, p = { ...this.opts };
		delete p.onAssetDownload, delete p.onLoadProgress, delete p.onEngineSelected;
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
		return g.engine = h, g.engineKind = "pdflatex", g.detection = f, g.initialized = !0, g.compiled = !0, g.fs.markSynced(), g.heap = o.cloneForEngine(h, [i, h.pagePreviewFallbackId]), g.pagePreviewBaseline = s, g.pagePreviewErrors = c, {
			setFile: (e, t) => g.setFile(e, t),
			previewPages: (e, t) => g.previewPages(e, t),
			dispose: () => g.dispose()
		};
	}
	async previewPages(e, t = {}) {
		if (!Number.isSafeInteger(e) || e < 1 || e > 1e4) throw RangeError("Invalid preview page limit");
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		if (this.pagePreviewBaseline === null || k(this.pagePreviewBaseline)?.preamble !== k(this.mainSource())?.preamble || this.tikzExternalizationKind()) return null;
		this.compileInFlight = !0;
		let n = this.inputRevision;
		try {
			this.prebuildInFlight && await this.prebuildInFlight, this.assertRevision(n);
			let r = await this.operations.run(() => this.previewPagesIdle(e, t.placement === !0));
			return this.assertRevision(n), r && t.placement ? {
				firstPage: 1,
				...r
			} : r;
		} finally {
			this.compileInFlight = !1;
		}
	}
	async previewColdPages(e) {
		if (!Number.isSafeInteger(e) || e < 1 || e > 1e4) throw RangeError("Invalid preview page limit");
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		if (this.compiled || this.tikzExternalizationKind()) return null;
		this.compileInFlight = !0;
		let t = this.inputRevision;
		try {
			this.prebuildInFlight && await this.prebuildInFlight, this.assertRevision(t);
			let n = await this.operations.run(() => this.previewColdPagesIdle(e));
			return this.assertRevision(t), n;
		} finally {
			this.compileInFlight = !1;
		}
	}
	async previewColdPagesIdle(e) {
		(await this.operations.observe(this.ensureEngine())).resume();
		let t = this.engine;
		if (!Q(t) && !(t instanceof A)) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), t instanceof A && t.setPreambleSnapshot(!1);
		let n = (await this.operations.observe(Q(t) ? t.compilePagePreview(e, { cold: !0 }) : t.compilePagePreview(e))).resume();
		return !n?.success || !n.pdf || !V([], n.errors) ? null : {
			pdf: n.pdf,
			synctex: n.synctex,
			compileTime: n.compileTime,
			pageLimit: e
		};
	}
	async previewPagesIdle(e, t) {
		(await this.operations.observe(this.ensureEngine())).resume();
		let n = this.engine;
		if (Q(n)) return this.previewFormatPages(n, e, t);
		if (!(n instanceof A)) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume();
		let r = this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles());
		if (this.pagePreviewRequiresCheckpoint && !r) return null;
		let i = (await this.operations.observe(n.compilePagePreview(e, r))).resume();
		return !i?.success || !i.pdf || !V(this.pagePreviewErrors, i.errors) ? null : {
			pdf: i.pdf,
			synctex: i.synctex,
			compileTime: i.compileTime,
			pageLimit: e
		};
	}
	async previewFormatPages(e, t, n) {
		if (this.pagePreviewRequiresCheckpoint) return null;
		if ((await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), e instanceof j) {
			let n = (await this.operations.observe(this.previewFromHeap(e, t))).resume();
			if (n) return n;
		}
		let r = n ? this.previewChapter() : null;
		if (r) {
			let n = (await this.operations.observe(e.compilePagePreview(t, { chapter: r }))).resume(), i = this.acceptedPreview(n, t);
			if (i) return {
				...i,
				firstPage: n?.firstPage ?? 1
			};
			n && e.refuseChapter(r);
		}
		return this.acceptedPreview((await this.operations.observe(e.compilePagePreview(t))).resume(), t);
	}
	async previewFromHeap(e, t) {
		let n = this.heap?.enabled ? this.heap.previewCheckpoint(this.mainSource(), this.projectTexFiles()) : void 0;
		if (!n) return null;
		let r = (await this.operations.observe(e.compileHeapPreview(t, n))).resume(), i = this.acceptedPreview(r, t);
		return !i && r && !r.success && !r.pdf && this.heap?.forget(n), i;
	}
	acceptedPreview(e, t) {
		return !e?.success || !e.pdf || !V(this.pagePreviewErrors, e.errors) ? null : {
			pdf: e.pdf,
			synctex: null,
			compileTime: e.compileTime,
			pageLimit: t
		};
	}
	previewChapter() {
		let e = this.mainSource();
		if (this.previewEdits.size !== 1 || e === void 0 || e !== this.pagePreviewBaseline) return null;
		let [t] = this.previewEdits, n = l(e);
		if (n.includes("\\includeonly")) return null;
		for (let e of n.matchAll(/\\include\{([^}]+)\}/g)) {
			let n = e[1].trim();
			if (C(n) !== n || !/^[\w./-]+$/.test(n)) return null;
			if (`${n}.tex` === t) return n;
			let r = this.fs.readFile(`${n}.tex`);
			if (typeof r != "string" || qe.test(l(r))) return null;
		}
		return null;
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
			let r = await this.operations.run(() => (this.ownsAssetAttempt && this.assetCompileAttemptStarted && this.assetDownloads.beginAttempt(), this.assetCompileAttemptStarted = !0, this.compileIdle(e, t)));
			return this.assertRevision(n), this.compiled = !0, this.pagePreviewBaseline = r.success && r.pdf ? this.mainSource() : null, this.previewEdits.clear(), this.pagePreviewErrors = this.pagePreviewBaseline === null ? [] : r.errors.map((e) => ({ ...e })), this.pagePreviewRequiresCheckpoint = !1, r;
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
			let e = P(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let r = this.engine;
		if ((await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), r.setPreambleSnapshot) {
			let e = this.projectSources(), t = !this.opts.disablePreambleSnapshot && !x(e.join("\n")) && !we(e);
			r.setPreambleSnapshot(t);
		}
		let i = this.tikzExternalizationKind(), a = (await this.operations.observe(this.tryIncrementalFastPath(i, e))).resume();
		if (a) return a;
		let o = (await this.operations.observe(this.trackLists(r))).resume(), s = (await this.operations.observe(this.tryHeapResume(i, t?.incrementalPreparation))).resume() ?? (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), c = new Set(s.pdfConversionInputs ?? []), l = [s.telemetry?.resolver];
		s = (await this.operations.observe(this.applyTikzExternalization(s, i, l))).resume(), Y(c, s);
		let u = s.telemetry?.tikzExternalization;
		this.emitProgressPdf(s, t, n), this.operations.assertCurrent();
		let d = await this.afterPass(s, o), f = new ve(), p = !1;
		for (; s.success || s.pdf;) {
			let e = (await this.operations.observe(this.rerunSignature(s))).resume(), n = f.decide(s.log, e, d);
			if (!n.rerun) {
				p = !n.stopped;
				break;
			}
			this.incremental?.reset(), this.heap?.reset(), (await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), s = (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), l.push(s.telemetry?.resolver), Y(c, s), d = await this.afterPass(s, o);
		}
		return this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), s), u && (s.telemetry ??= { diagnostics: D(s.log) }, s.telemetry.tikzExternalization = u), Be(s, c), this.attachTexliveDependencies(s, l), s.telemetry ??= { diagnostics: D(s.log) }, s.telemetry.referencesSettled = Ue(s, p), (await this.operations.observe(this.updateMetadata(s))).resume(), this.attachDependencyManifest(s), (await this.operations.observe(this.attachCompletionSnapshot(s))).resume(), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), s.synctex), s;
	}
	async afterPass(e, t) {
		let n = (await this.operations.observe(this.runAuxStages(e))).resume(), r = await t();
		return n || r;
	}
	async trackLists(e) {
		let t = await this.readLists(e);
		return async () => {
			let n = (await this.operations.observe(this.readLists(e))).resume(), r = n !== t;
			return t = n, r && this.hasGeneratedLists();
		};
	}
	hasGeneratedLists() {
		return !!this.bibliographyRequest || !!this.indexInput || this.secondaryRequests.size > 0 || this.secondaryBibliographies.size > 0;
	}
	async readLists(e) {
		let t = this.jobBase, n = await Promise.all(Ge.map((n) => e.readFile(`${t}.${n}`)));
		return JSON.stringify(n);
	}
	async rerunSignature(e) {
		let t = e.semanticTrace ?? e.log;
		if (!e.log.includes("Rerun to get outlines right")) return L(t);
		let n = (await this.operations.observe(this.engine?.readFile(`${this.jobBase}.out`))).resume();
		return L(`${t}\n${n ?? ""}`);
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
		return !n || !n.final || !n.result.pdf ? null : this.heap.resumeRecordsInputs ? n.result : {
			...n.result,
			inputFilesComplete: !1
		};
	}
	acceptTikzCheckpointInputs(e) {
		let t = this.projectTexFiles();
		return e.length > 0 && e.every((e) => {
			if (e.startsWith("/tex/")) return !0;
			let n = e.replace(/^(?:\/work\/|\.\/)/, "");
			return n === this.mainFile ? !0 : n === "_preamble.tex" ? !this.fs.getFile(n) : n.startsWith("__") ? n === "__strace.tex" && !this.fs.getFile(n) : n.startsWith(".") || n.startsWith("/") ? !1 : t.has(n) || !this.fs.getFile(n) && (n === "texmf.cnf" || n === "pdflatex.fmt" || n === "wasmtex-luatex.fmt" || n === "luaotfload.conf" || n.endsWith(".aux"));
		});
	}
	toCompileResult(e, t) {
		let n = {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: O(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: D(e.log) }
		};
		return n.telemetry.dependencyManifest = me(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.assertNoProjectReplacement();
		let n = this.pagePreviewBaseline;
		e !== this.mainFile && (this.pagePreviewBaseline = null), this.invalidateOperation(), this.projectIndex.invalidateCompletionSnapshot();
		let r = !!this.fs.getFile(e);
		this.fs.writeFile(e, t);
		let i = C(e) ?? e;
		this.generatedFiles.delete(i), this.generatedDependencyObservations.delete(i), this.indexInput?.path === e && (this.indexInput = null), this.bibliographyRequest?.path === e && (this.bibliographyRequest = null), this.forgetSecondaryOutput(e), this.currentAuxiliaryDependencies.clear(), e !== this.mainFile && e.endsWith(".tex") && this.noteSecondarySource(e, t, r, n), e.endsWith(".tex") || (this.incremental?.reset(), this.heap?.reset()), this.updateIndexForFile(e, t);
	}
	noteSecondarySource(e, t, n, r) {
		n ? this.heap?.invalidateFile(e, t) : this.heap?.reset(), !(!n || r === null) && (Q(this.engine) ? this.engine.readsInPreamble(e) || (this.pagePreviewBaseline = r, this.previewEdits.add(e)) : this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles()) && (this.pagePreviewBaseline = r, this.pagePreviewRequiresCheckpoint = !0));
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
		this.pagePreviewBaseline = null, this.previewEdits.clear(), this.compiled = !1, this.fs = new R({ empty: !0 }), this.projectIndex = new z(), this.generatedFiles.clear(), this.indexInput = null, this.bibliographyRequest = null, this.forgetSecondaryOutputs(), this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset(), this.heap?.reset();
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
		t && (this.pagePreviewBaseline = null, this.previewEdits.clear(), this.compiled = !1, this.projectIndex.invalidateCompletionSnapshot(), t && this.invalidateOperation(), this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, t && (this.indexInput = null, this.bibliographyRequest = null, this.forgetSecondaryOutputs(), this.incremental?.setMainFile(e), this.heap?.reset()), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e));
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
		this.indexInput?.path === e && (this.indexInput = null), this.bibliographyRequest?.path === e && (this.bibliographyRequest = null), this.forgetSecondaryOutput(e), this.fs.deleteFile(e);
		let t = C(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = [...this.currentAuxiliaryDependencies.values()];
		for (let n of e.inputFiles ?? []) {
			let e = C(n);
			if (!e) continue;
			let r = this.generatedDependencyObservations.get(e);
			r && t.push(r);
		}
		let n = /* @__PURE__ */ new Map();
		for (let e of t) {
			let t = n.get(e.stage);
			n.set(e.stage, {
				stage: e.stage,
				projectInputs: [.../* @__PURE__ */ new Set([...t?.projectInputs ?? [], ...e.projectInputs])],
				complete: (t?.complete ?? !0) && e.complete
			});
		}
		return [...n.values()];
	}
	attachTexliveDependencies(e, t) {
		let n = /* @__PURE__ */ new Set();
		for (let e of this.fs.listFiles()) n.add(e.slice(e.lastIndexOf("/") + 1));
		let r = this.jobBase;
		for (let e of We) n.add(`${r}.${e}`);
		let i = Oe(this.opts.texliveVersion ?? "2025", this.completionProfile(), t, { excludeNames: n });
		i && (this.sessionDependencies = ke(this.sessionDependencies, i), e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.texliveDependencies = this.sessionDependencies);
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: D(e.log) };
		let t = pe({
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
		}))))).resume(), i = t.getCompletionObservation?.(), a = (await this.operations.observe(ce({
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
		n !== this.mainFile || t !== this.engine || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.completionSnapshot = a, this.projectIndex.updateCompletionSnapshot(a));
	}
	async syncAllFilesToEngine() {
		let e = this.engine;
		!e || this.unavailable || (await this.operations.observe(ye(this.fs, {
			writeFile: (t, n) => e.writeFile(t, this.engineContent(t, n)),
			setMainFile: (t) => e.setMainFile(t)
		}, (e) => this.ensureEngineDirectories(e), this.mainFile))).resume();
	}
	engineContent(e, t) {
		if (e !== this.mainFile || typeof t != "string") return t;
		let n = this.tikzExternalizationKind(t);
		return n ? Pe(t, n) : t;
	}
	tikzExternalizationKind(e = this.mainSource()) {
		let t = Me(e, this.opts.tikzExternalization?.mode ?? "document");
		return t === "inject" ? this.tikzAutoDisabled ? null : (this.tikzAutoBlocker = je(e, this.projectTexFiles().values()), this.tikzAutoBlocker ? null : t) : t;
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
			return n.push(e.telemetry?.resolver), J(e, {
				...X("auto"),
				fallback: !0
			});
		}
		return this.opts.tikzExternalization?.mode === "auto" && this.tikzAutoBlocker && (e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.tikzExternalization = {
			...X("auto"),
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
			return n.push(e.telemetry?.resolver), J(e, o);
		}
		let l = o.compiled > 0 || e.phaseTimings?.checkpointResume ? (await this.operations.observe(r.compile())).resume() : e;
		return l !== e && n.push(l.telemetry?.resolver), o.pictureErrors = Ve(l, s), c && (l.log += c), J(l, o);
	}
	async runTikzFigureJobs(e, t, n) {
		let r = this.engine;
		if (!r) return null;
		let i = this.jobBase, a = (await this.operations.observe(this.readTikzFigureList(i, n))).resume();
		if (!a) return null;
		let { realJob: o, names: s } = a;
		if (t === "inject" && s.length < 3) {
			let t = {
				...X("auto"),
				figures: s.length
			};
			return t.blocked = "too-few-pictures", e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.tikzExternalization = t, {
				telemetry: t,
				errors: [],
				failureLog: "",
				inline: !0
			};
		}
		let c = globalThis.navigator, l = this.opts.tikzExternalization?.workers ?? Ae(c?.hardwareConcurrency, c?.deviceMemory), u = (await this.operations.observe(this.ensureTikzPool(l))).resume();
		u.retain(s);
		let d = (await this.operations.observe(Promise.all(s.map((e) => r.readFile(`${e}.md5`))))).resume(), f = s.map((e, t) => ({
			name: e,
			md5: Ie(d[t])
		})).filter((e) => !u.isCurrent(e.name, e.md5)), p = {
			...X(t === "inject" ? "auto" : "document"),
			figures: s.length,
			reused: s.length - f.length,
			workers: Math.min(l, Math.max(1, f.length))
		};
		if (p.discoveryCheckpointResume = e.phaseTimings?.checkpointResume === !0, e.telemetry ??= { diagnostics: D(e.log) }, e.telemetry.tikzExternalization = p, f.length === 0) return {
			telemetry: p,
			errors: U(u, s),
			failureLog: ""
		};
		let m = this.mainSource(), h = [], g = (await this.operations.observe(r.readFile(`${i}.aux`))).resume();
		g !== null && h.push([`${o}.aux`, g]);
		for (let e of this.projectTexFiles().keys()) {
			if (e === this.mainFile) continue;
			let t = `${e.replace(/\.tex$/i, "")}.aux`, n = (await this.operations.observe(r.readFile(t))).resume();
			n !== null && h.push([t, n]);
		}
		let _ = (await this.operations.observe(u.render(f, (e) => Ne(m, t, o, e), () => [...this.projectFileEntries(), ...h]))).resume();
		p.compiled = _.rendered.size, p.failed = _.failures.map((e) => e.name), p.figureTimeMs = Math.round(_.elapsedMs);
		let v = U(u, s), y = "";
		for (let e of _.failures) v.push(...W(e.log)), y += `\n[wasmtex] TikZ figure job '${e.name}' failed:\n${e.log.slice(-2e3)}\n`;
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
		let r = t ? [H, e] : [e, H];
		for (let e of r) {
			let t = Fe((await this.operations.observe(n.readFile(`${e}.figlist`))).resume());
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
		let t = this.mainSource(), { injectDocumentMetadata: n, documentClassOf: r, CLASS_SUPPORT: i } = await K(), a = n(t, e), o = r(t), s = o && i[o] || "unknown", c = q(o, s, a.injected);
		return G(await this.compileForExport(a.source), a, o, s, c);
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
			luatexHeapCheckpoints: void 0,
			tikzExternalization: { mode: "off" }
		});
	}
	spawnFigureCompiler() {
		let { files: t, backends: n, ...r } = this.opts, i = new e({
			...r,
			mainFile: this.mainFile,
			engine: this.engineKind,
			incremental: !1,
			luatexHeapCheckpoints: void 0,
			tikzExternalization: { mode: "off" }
		});
		return i.assetDownloads = this.assetDownloads, i.ownsAssetAttempt = !1, i;
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
		xe(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		if (!e.success) {
			this.projectIndex.updateAux(""), this.projectIndex.updateEngineCommands([]), this.projectIndex.updateSemanticTrace(B(""));
			return;
		}
		let t = this.jobBase, n = this.engine, r = (await this.operations.observe(fe(`${t}.aux`, async (e) => (await this.operations.observe(n.readFile(e))).resume()))).resume();
		if (this.projectIndex.updateAuxData(de(r)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(B(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = C(t);
			if (!e) continue;
			let n = this.fs.getFile(e);
			n && typeof n.content == "string" && this.projectIndex.updateFile(n.path, n.content);
		}
	}
	async runAuxStages(e) {
		let t = (await this.operations.observe(this.maybeRunBibtex(e))).resume() || (await this.operations.observe(this.maybeRunBiblatex(e))).resume(), n = (await this.operations.observe(this.maybeRunMakeindex(e))).resume(), r = (await this.operations.observe(this.runSecondaryStages(e))).resume();
		return t || n || r;
	}
	async runSecondaryStages(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.jobBase, r = this.projectSources(), i = async (e) => (await this.operations.observe(t.readFile(e))).resume(), a = await i(`${n}.aux`) ?? "", o = !1;
		for (let e of Ee(n, r, a)) await this.runSecondaryIndex(t, e, i) && (o = !0);
		let s = Te(r, a);
		if (De(r)) for (let e = 1; e <= Ke && await i(`bu${e}.aux`) !== null; e++) s.push(`bu${e}`);
		for (let e of s) await this.runSecondaryBibliography(t, e, i) && (o = !0);
		return o;
	}
	forgetSecondaryOutput(e) {
		this.secondaryRequests.delete(e), this.secondaryBibliographies.delete(e);
	}
	forgetSecondaryOutputs() {
		this.secondaryRequests.clear(), this.secondaryBibliographies.clear(), this.secondaryLabels.clear();
	}
	noteSecondaryStage(e, t) {
		this.currentAuxiliaryDependencies.set(`${t.stage}:${e}`, t);
	}
	keepSecondaryOutput(e) {
		let t = this.generatedDependencyObservations.get(C(e) ?? e);
		return t && this.noteSecondaryStage(e, t), !1;
	}
	async runSecondaryIndex(e, t, n) {
		if (this.authoredOutput(t.output)) return !1;
		let r = await n(t.input);
		if (r === null || !r.trim() && this.fs.readFile(t.output) === null) return !1;
		let i = t.style ? await n(t.style) : null, a = JSON.stringify([
			t,
			r,
			i
		]);
		if (this.secondaryRequests.get(t.output) === a) return this.keepSecondaryOutput(t.output);
		let o = r.trim() ? await this.runClientIndexJob(t, r, i) : "", s = {
			stage: "index",
			projectInputs: t.style && this.fs.readFile(t.style) !== null ? [t.style] : [],
			complete: o !== null
		};
		return this.noteSecondaryStage(t.output, s), o !== null && (this.secondaryRequests.set(t.output, a), this.injectGeneratedOutput(e, t.output, o, s));
	}
	async runClientIndexJob(e, t, n) {
		let r = (await this.operations.observe(this.ensureAuxEngine("makeindexEngine"))).resume();
		(await this.operations.observe(r.writeFile(e.input, t))).resume(), e.style && n !== null && (await this.operations.observe(r.writeFile(e.style, n))).resume();
		let i = e.input.replace(/\.[^.]*$/, ""), { success: a } = (await this.operations.observe(r.compile(i, e))).resume();
		return a ? (await this.operations.observe(r.readFile(e.output))).resume() ?? null : null;
	}
	async runSecondaryBibliography(e, t, n) {
		let r = `${t}.bbl`;
		if (this.authoredOutput(r)) return !1;
		let i = await n(`${t}.aux`);
		if (!i?.includes("\\bibdata{")) return !1;
		let a = (i.match(/^\\bibcite\{[^\n]*/gm) ?? []).join("\n"), o = (this.secondaryLabels.get(t) ?? "") !== a;
		this.secondaryLabels.set(t, a);
		let s = i.includes("\\citation{");
		if (!s && this.fs.readFile(r) === null) return o;
		let c = this.collectBibFiles(), { bibFiles: l } = (await this.operations.observe(T(i, c, n))).resume(), u = this.resolveProjectBst(i), d = {
			control: w(i),
			files: {
				...l,
				...u ? { [u.path]: u.content } : {}
			}
		}, f = this.secondaryBibliographies.get(r);
		if (f && E(f, d)) return this.keepSecondaryOutput(r), o;
		let p = s ? (await this.operations.observe(this.runClientBibtex(t, i, l))).resume() : "", m = {
			stage: "bibliography",
			projectInputs: [...Object.keys(c), ...u ? [u.path] : []],
			complete: p !== null
		};
		return this.noteSecondaryStage(r, m), p === null ? o : (this.secondaryBibliographies.set(r, d), await this.injectGeneratedOutput(e, r, p, m) || o);
	}
	async maybeRunBibtex(e) {
		let n = this.engine;
		if (!n || !e.success && !e.pdf) return !1;
		let r = this.jobBase, i = `${r}.bbl`, a = (await this.operations.observe(this.bibtexAux(n, r, i))).resume();
		if (a === null) return !1;
		let o = a.includes("\\citation{"), s = this.collectBibFiles(), { bibFiles: c, hasGenerated: l } = (await this.operations.observe(T(a, s, (e) => n.readFile(e)))).resume(), u = {
			aux: a,
			bibFiles: c
		}, d = this.resolveProjectBst(a);
		d && (u.bstFiles = { [d.path]: d.content });
		let f = this.opts.backends?.resolve(t), p = f?.location === "server" ? f : null, m = {
			control: w(a),
			files: {
				...c,
				...u.bstFiles
			}
		};
		if (this.matchesBibliographyRequest(i, m, p)) return this.reuseGeneratedOutput(i);
		let h = o ? (await this.operations.observe(v(this.opts.backends, u))).resume() ?? (await this.operations.observe(this.runClientBibtex(r, a, c))).resume() : "", g = {
			stage: "bibliography",
			projectInputs: [
				...Object.keys(s),
				...Object.keys(u.bstFiles ?? {}),
				...l ? this.projectTexFiles().keys() : []
			],
			complete: h !== null
		};
		return this.injectBibliography(n, i, h, g, m, p);
	}
	async bibtexAux(e, t, n) {
		if (!this.fs.listFiles().some((e) => e.endsWith(".bib"))) return null;
		let r = this.mainSource();
		if (m(r) === "biblatex" && f(r) === "biber" || this.authoredOutput(n)) return null;
		let i = (await this.operations.observe(he(`${t}.aux`, (t) => e.readFile(t)))).resume();
		return !i?.includes("\\bibdata{") || !i.includes("\\citation{") && this.fs.readFile(n) === null ? null : i;
	}
	async maybeRunBiblatex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.mainSource();
		if (m(n) !== "biblatex" || f(n) !== "biber") return !1;
		let r = this.jobBase, i = `${r}.bbl`;
		if (this.authoredOutput(i)) return !1;
		let a = (await this.operations.observe(t.readFile(`${r}.bcf`))).resume();
		if (!a?.trim()) return !1;
		let o = this.collectBibFiles(), c = this.opts.backends?.resolve("bibliography:biber") ?? null, l = {
			control: `${p(n)}\n${a}`,
			files: o
		};
		if (this.matchesBibliographyRequest(i, l, c)) return this.reuseGeneratedOutput(i);
		let u = (await this.operations.observe(s(this.opts.backends, {
			bcf: a,
			bibFiles: o
		}, { signal: this.operations.signal }))).resume() ?? this.runClientBiblatexLite(n, a, o), d = {
			stage: "bibliography",
			projectInputs: Object.keys(o),
			complete: !!u
		};
		return this.injectBibliography(t, i, u, d, l, c);
	}
	authoredOutput(e) {
		let t = C(e) ?? e;
		return this.fs.readFile(e) !== null && !this.generatedFiles.has(t);
	}
	matchesBibliographyRequest(e, t, n) {
		let r = this.bibliographyRequest;
		return this.fs.readFile(e) !== null && !!r && r.path === e && r.backend === n && r.version === n?.version && E(r.input, t);
	}
	async injectBibliography(e, t, n, r, i, a) {
		return this.currentAuxiliaryDependencies.set("bibliography", r), n === null ? (this.bibliographyRequest = null, !1) : (this.bibliographyRequest = {
			path: t,
			input: i,
			backend: a,
			version: a?.version
		}, this.injectGeneratedOutput(e, t, n, r));
	}
	async injectGeneratedOutput(e, t, n, r) {
		let i = C(t) ?? t, a = this.fs.readFile(t);
		return this.generatedFiles.add(i), this.generatedDependencyObservations.set(i, r), a !== n && (this.incremental?.reset(), this.heap?.reset(), this.fs.writeFile(t, n), (await this.operations.observe(e.writeFile(t, n))).resume(), !0);
	}
	reuseGeneratedOutput(e) {
		let t = C(e) ?? e, n = this.generatedDependencyObservations.get(t);
		return n && this.currentAuxiliaryDependencies.set(n.stage, n), !1;
	}
	runClientBiblatexLite(e, t, n) {
		let r = Object.entries(n).flatMap(([e, t]) => be(t, e)), i = g(t), a = i.includes("*") ? r.map((e) => e.key) : i;
		return h({
			entries: r,
			citedKeys: a,
			sort: p(e)
		});
	}
	async maybeRunMakeindex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !x(this.projectSources().join("\n"))) return !1;
		let n = this.jobBase, i = `${n}.ind`;
		if (this.authoredOutput(i)) return !1;
		let a = (await this.operations.observe(t.readFile(`${n}.idx`))).resume();
		if (a === null) return !1;
		let o = this.opts.backends?.resolve(r), s = o?.location === "server" ? o : null;
		if (this.matchesIndexInput(i, a, s)) return this.reuseGeneratedOutput(i);
		if (!a.trim() && this.fs.readFile(i) === null) return !1;
		let c = a.trim() ? await this.buildIndex(n, a) : "", l = {
			stage: "index",
			projectInputs: [],
			complete: c !== null
		};
		return this.currentAuxiliaryDependencies.set("index", l), c !== null && (this.indexInput = {
			path: i,
			idx: a,
			backend: s,
			version: s?.version
		}, this.injectGeneratedOutput(t, i, c, l));
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
		return _(e, (e) => {
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
		let n = e === "bibtexEngine" ? new ge(this.auxEngineOpts()) : new Ce(this.auxEngineOpts());
		n.setAssetDownloadSession(this.assetDownloads), this[e] = n;
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
export { e as BIBER_STAGE, u as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, ae as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, oe as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, b as MemoryCacheStore, $ as WasmTexCompiler, ee as backendCacheKey, d as biblatexLiteBackend, Le as compileAccessiblePdf, te as contentKey, o as createBiberBackend, i as createJsonTextBackend, re as createMakeindexBackend, a as createRemoteBackend, ie as createXindyBackend, f as detectBiblatexBackend, p as detectBiblatexSort, m as detectBibliographyMode, x as detectIndexUse, h as generateBiblatexBbl, g as parseBcfCitedKeys, s as runBiberBackend, c as runRemoteBiber, v as runRemoteBibliography, S as runRemoteIndex, y as selectBiblatexBackend, ne as withCache };
