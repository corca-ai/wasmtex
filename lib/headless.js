import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runBiberBackend as s, runRemoteBiber as c } from "./engine/biber-backend.js";
import { stripTexComments as l } from "./engine/tex-comments.js";
import { BIBLIOGRAPHY_STAGE as u, biblatexLiteBackend as d, detectBiblatexBackend as f, detectBiblatexSort as p, detectBibliographyMode as m, generateBiblatexBbl as h, parseBcfCitedKeys as g, resolveBstFile as _, runRemoteBibliography as v, selectBiblatexBackend as y } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as b, backendCacheKey as ee, contentKey as te, withCache as ne } from "./engine/content-cache.js";
import { createMakeindexBackend as re, detectIndexUse as x, runRemoteIndex as S } from "./engine/index-backend.js";
import { createXindyBackend as ie } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as ae, COMPLETION_SNAPSHOT_SCHEMA_VERSION as oe, CompletionFileDigestCache as se, createCompletionSnapshot as C } from "./engine/completion-snapshot.js";
import { parseAuxFiles as ce, readAuxFiles as le } from "./lsp/aux-files.js";
import { buildDependencyManifest as ue, buildIncrementalDependencyManifest as de, normalizeProjectDependencyPath as w } from "./engine/dependency-manifest.js";
import { bibtexControl as fe, collectBibliographyInputs as pe, flattenAuxInputs as me, sameBibliographyInput as he } from "./engine/bibliography-inputs.js";
import { BibtexEngine as ge } from "./engine/bibtex-engine.js";
import { buildDiagnostics as T, parseTexErrors as E } from "./engine/parse-errors.js";
import { extractPreamble as D } from "./engine/preamble-utils.js";
import { WasmTexPdftexEngine as O } from "./engine/wasmtex-engine.js";
import { WasmTexLuatexEngine as k } from "./engine/luatex-engine.js";
import { WasmTexXetexEngine as A } from "./engine/xetex-engine.js";
import { createCompileEngine as j, unavailableEngineResult as M } from "./engine/compile-engine.js";
import { resolveEngine as N } from "./engine/engine-select.js";
import { IncrementalCompiler as P } from "./engine/incremental.js";
import { RerunController as F, signatureOf as I } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as L } from "./fs/engine-sync.js";
import { VirtualFS as R } from "./fs/virtual-fs.js";
import { parseBibFile as _e, rebuildBibIndex as ve } from "./lsp/bib-parser.js";
import { ProjectIndex as z } from "./lsp/project-index.js";
import { parseTraceFile as B } from "./lsp/trace-parser.js";
import { CompilerOperations as ye } from "./engine/compiler-operation.js";
import { MakeindexEngine as V } from "./engine/makeindex-engine.js";
import { previewErrorsCovered as H } from "./engine/preview-diagnostics.js";
import { buildTexliveDependencySet as be, mergeTexliveDependencySets as xe } from "./engine/texlive-dependencies.js";
import { PREAMBLE_SNAPSHOT_JOBNAME as U, defaultFigureWorkers as Se, detectAutoBlocker as Ce, detectTikzExternalization as we, figureJobSource as Te, mainJobSource as Ee, parseFigureList as De, parseFigureMd5 as Oe } from "./engine/tikz-externalization.js";
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
	return E(e).filter((e) => !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(e.message));
}
async function ke(e, t = {}) {
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
	return c && i.push(...Ae(c, s)), {
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
function Ae(e, t) {
	let n = [];
	return !e.tagged && t && n.push("The compile produced no structure tree; the PDF is not tagged."), e.figures > e.figuresWithAlt && n.push(`${e.figures - e.figuresWithAlt} of ${e.figures} figures have no text alternative (alt={…}).`), n;
}
function je() {
	return typeof globalThis.process?.versions?.node == "string";
}
function Y(e, t) {
	return e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = t, e;
}
function X(e, t) {
	for (let n of t.pdfConversionInputs ?? []) e.add(n);
}
function Me(e, t) {
	t.size && (e.pdfConversionInputs = [...t].sort());
}
function Ne(e, t) {
	let n = (e) => `${e.file ?? ""}:${e.line ?? ""}:${e.message}`, r = new Set(e.errors.map(n));
	for (let i of t) r.has(n(i)) || (r.add(n(i)), e.errors.push(i));
	return t.length;
}
function Z(e) {
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
function Pe(e, t) {
	return t && e.success && !!e.pdf && e.errors.length === 0;
}
function Fe(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var Ie = [
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
], Le = [
	"toc",
	"lof",
	"lot",
	"loa",
	"thm",
	"nav",
	"snm"
], Re = /\\(?:appendix|frontmatter|mainmatter|backmatter|pagenumbering|pagestyle|(?:re|provide|new)command|[gex]?def|let|(?:set|addto)length|newtheorem|newcounter|markboth|markright|setcounter\s*\{(?:secnumdepth|tocdepth)\})(?![a-zA-Z])/;
function Q(e) {
	return e instanceof k || e instanceof A;
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
	incremental = null;
	heap = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	pagePreviewBaseline = null;
	pagePreviewErrors = [];
	pagePreviewRequiresCheckpoint = !1;
	compiled = !1;
	previewEdits = /* @__PURE__ */ new Set();
	operations = new ye();
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
		for (let t of Object.values(e.heapCheckpointOptions ?? {})) if (t !== void 0 && (!Number.isSafeInteger(t) || t < 0)) throw RangeError("Invalid heap checkpoint budget");
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = Fe(e.assetBaseUrl), this.fs = new R({ empty: !0 });
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
			heapCheckpoints: !!this.opts.incremental && this.opts.heapCheckpoints !== !1 && !je(),
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
		if (this.detection = N(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
			if (this.engine?.terminate(), this.tikzPool?.dispose(), this.tikzPool = null, this.engineKind = this.detection.engine, this.engine = j(this.detection.engine, this.engineBaseOpts()), this.attachLoadProgress(this.engine), this.opts.onEngineSelected) {
				let e = (e) => console.error("Engine selection observer failed", e);
				try {
					Promise.resolve(this.opts.onEngineSelected({ ...this.detection })).catch(e);
				} catch (t) {
					e(t);
				}
			}
			this.operations.assertCurrent(), this.incremental = this.opts.incremental && this.engine instanceof O ? new P(this.engine, { mainFile: this.mainFile }) : null, this.heap = this.opts.incremental && this.opts.heapCheckpoints !== !1 && this.engine instanceof O ? new ((await this.operations.observe(import("./engine/heap-checkpoints.js"))).resume()).HeapCheckpointCompiler(this.engine, {
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
	supportsPagePreviewSessions() {
		return this.engine instanceof O && !!this.heap;
	}
	async createPagePreviewSession(t, n) {
		this.ensureInitialized(), this.assertNoProjectReplacement();
		let r = this.engine;
		if (!(r instanceof O) || !this.heap || this.compileInFlight || this.prebuildInFlight || this.operations.busy || this.pagePreviewBaseline === null || this.fs.getModifiedFiles().length || this.tikzExternalizationKind()) return null;
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
		return g.engine = h, g.engineKind = "pdflatex", g.detection = f, g.initialized = !0, g.compiled = !0, g.fs.markSynced(), g.heap = o.cloneForEngine(h, [i, h.pagePreviewFallbackId]), g.pagePreviewBaseline = s, g.pagePreviewErrors = c, {
			setFile: (e, t) => g.setFile(e, t),
			previewPages: (e, t) => g.previewPages(e, t),
			dispose: () => g.dispose()
		};
	}
	async previewPages(e, t = {}) {
		if (!Number.isSafeInteger(e) || e < 1 || e > 1e4) throw RangeError("Invalid preview page limit");
		if (this.ensureInitialized(), this.assertNoProjectReplacement(), this.compileInFlight) throw Error("Compile already in progress");
		if (this.pagePreviewBaseline === null || D(this.pagePreviewBaseline)?.preamble !== D(this.mainSource())?.preamble || this.tikzExternalizationKind()) return null;
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
		if (!Q(t) && !(t instanceof O)) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), t instanceof O && t.setPreambleSnapshot(!1);
		let n = (await this.operations.observe(Q(t) ? t.compilePagePreview(e, { cold: !0 }) : t.compilePagePreview(e))).resume();
		return !n?.success || !n.pdf || !H([], n.errors) ? null : {
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
		if (!(n instanceof O)) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume();
		let r = this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles());
		if (this.pagePreviewRequiresCheckpoint && !r) return null;
		let i = (await this.operations.observe(n.compilePagePreview(e, r))).resume();
		return !i?.success || !i.pdf || !H(this.pagePreviewErrors, i.errors) ? null : {
			pdf: i.pdf,
			synctex: i.synctex,
			compileTime: i.compileTime,
			pageLimit: e
		};
	}
	async previewFormatPages(e, t, n) {
		if (this.pagePreviewRequiresCheckpoint) return null;
		(await this.operations.observe(this.syncModifiedFilesToEngine())).resume();
		let r = n ? this.previewChapter() : null;
		if (r) {
			let n = (await this.operations.observe(e.compilePagePreview(t, { chapter: r }))).resume(), i = this.acceptedPreview(n, t);
			if (i) return {
				...i,
				firstPage: n?.firstPage ?? 1
			};
			e.refuseChapter(r);
		}
		return this.acceptedPreview((await this.operations.observe(e.compilePagePreview(t))).resume(), t);
	}
	acceptedPreview(e, t) {
		return !e?.success || !e.pdf || !H(this.pagePreviewErrors, e.errors) ? null : {
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
			if (w(n) !== n || !/^[\w./-]+$/.test(n)) return null;
			if (`${n}.tex` === t) return n;
			let r = this.fs.readFile(`${n}.tex`);
			if (typeof r != "string" || Re.test(l(r))) return null;
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
			let r = await this.operations.run(() => this.compileIdle(e, t));
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
			let e = M(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let r = this.engine;
		if ((await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), r.setPreambleSnapshot) {
			let e = !this.opts.disablePreambleSnapshot && !x(this.mainSource());
			r.setPreambleSnapshot(e);
		}
		let i = this.tikzExternalizationKind(), a = (await this.operations.observe(this.tryIncrementalFastPath(i, e))).resume();
		if (a) return a;
		let o = (await this.operations.observe(this.trackLists(r))).resume(), s = (await this.operations.observe(this.tryHeapResume(i, t?.incrementalPreparation))).resume() ?? (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), c = new Set(s.pdfConversionInputs ?? []), l = [s.telemetry?.resolver];
		s = (await this.operations.observe(this.applyTikzExternalization(s, i, l))).resume(), X(c, s);
		let u = s.telemetry?.tikzExternalization;
		this.emitProgressPdf(s, t, n), this.operations.assertCurrent();
		let d = (await this.operations.observe(this.runAuxStages(s))).resume() || await o(), f = new F(), p = !1;
		for (; s.success || s.pdf;) {
			let e = (await this.operations.observe(this.rerunSignature(s))).resume(), n = f.decide(s.log, e, d);
			if (!n.rerun) {
				p = !n.stopped;
				break;
			}
			this.incremental?.reset(), this.heap?.reset(), (await this.operations.observe(this.syncModifiedFilesToEngine())).resume(), s = (await this.operations.observe(r.compile(this.heapArms(t?.incrementalPreparation)))).resume(), l.push(s.telemetry?.resolver), X(c, s), d = (await this.operations.observe(this.runAuxStages(s))).resume() || await o();
		}
		return this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), s), u && (s.telemetry ??= { diagnostics: T(s.log) }, s.telemetry.tikzExternalization = u), Me(s, c), this.attachTexliveDependencies(s, l), s.telemetry ??= { diagnostics: T(s.log) }, s.telemetry.referencesSettled = Pe(s, p), (await this.operations.observe(this.updateMetadata(s))).resume(), this.attachDependencyManifest(s), (await this.operations.observe(this.attachCompletionSnapshot(s))).resume(), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), s.synctex), s;
	}
	async trackLists(e) {
		if (!this.bibliographyRequest) return async () => !1;
		let t = await this.readLists(e);
		return async () => {
			let n = (await this.operations.observe(this.readLists(e))).resume(), r = n !== t;
			return t = n, r;
		};
	}
	async readLists(e) {
		let t = this.mainFile.replace(/\.tex$/, ""), n = await Promise.all(Le.map((n) => e.readFile(`${t}.${n}`)));
		return JSON.stringify(n);
	}
	async rerunSignature(e) {
		let t = e.semanticTrace ?? e.log;
		if (!e.log.includes("Rerun to get outlines right")) return I(t);
		let n = (await this.operations.observe(this.engine?.readFile(this.mainFile.replace(/\.tex$/, ".out")))).resume();
		return I(`${t}\n${n ?? ""}`);
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
		if (!i || !a || !(a instanceof O)) return !1;
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
			errors: E(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: T(e.log) }
		};
		return n.telemetry.dependencyManifest = de(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.assertNoProjectReplacement();
		let n = this.pagePreviewBaseline;
		e !== this.mainFile && (this.pagePreviewBaseline = null), this.invalidateOperation(), this.projectIndex.invalidateCompletionSnapshot();
		let r = !!this.fs.getFile(e);
		this.fs.writeFile(e, t);
		let i = w(e) ?? e;
		this.generatedFiles.delete(i), this.generatedDependencyObservations.delete(i), this.indexInput?.path === e && (this.indexInput = null), this.bibliographyRequest?.path === e && (this.bibliographyRequest = null), this.currentAuxiliaryDependencies.clear(), e !== this.mainFile && e.endsWith(".tex") && this.noteSecondarySource(e, t, r, n), e.endsWith(".tex") || (this.incremental?.reset(), this.heap?.reset()), this.updateIndexForFile(e, t);
	}
	noteSecondarySource(e, t, n, r) {
		n ? this.heap?.invalidateFile(e, t) : this.heap?.reset(), !(!n || r === null) && (this.heap?.previewCheckpoint(this.mainSource(), this.projectTexFiles()) ? (this.pagePreviewBaseline = r, this.pagePreviewRequiresCheckpoint = !0) : Q(this.engine) && !this.engine.readsInPreamble(e) && (this.pagePreviewBaseline = r, this.previewEdits.add(e)));
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
		this.pagePreviewBaseline = null, this.previewEdits.clear(), this.compiled = !1, this.fs = new R({ empty: !0 }), this.projectIndex = new z(), this.generatedFiles.clear(), this.indexInput = null, this.bibliographyRequest = null, this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset(), this.heap?.reset();
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
		t && (this.pagePreviewBaseline = null, this.previewEdits.clear(), this.compiled = !1, this.projectIndex.invalidateCompletionSnapshot(), t && this.invalidateOperation(), this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, t && (this.indexInput = null, this.bibliographyRequest = null, this.incremental?.setMainFile(e), this.heap?.reset()), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e));
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
		this.indexInput?.path === e && (this.indexInput = null), this.bibliographyRequest?.path === e && (this.bibliographyRequest = null), this.fs.deleteFile(e);
		let t = w(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = new Map(this.currentAuxiliaryDependencies);
		for (let n of e.inputFiles ?? []) {
			let e = w(n);
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
		for (let e of Ie) n.add(`${r}.${e}`);
		let i = be(this.opts.texliveVersion ?? "2025", this.completionProfile(), t, { excludeNames: n });
		i && (this.sessionDependencies = xe(this.sessionDependencies, i), e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.texliveDependencies = this.sessionDependencies);
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: T(e.log) };
		let t = ue({
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
		}))))).resume(), i = t.getCompletionObservation?.(), a = (await this.operations.observe(C({
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
		!e || this.unavailable || (await this.operations.observe(L(this.fs, {
			writeFile: (t, n) => e.writeFile(t, this.engineContent(t, n)),
			setMainFile: (t) => e.setMainFile(t)
		}, (e) => this.ensureEngineDirectories(e), this.mainFile))).resume();
	}
	engineContent(e, t) {
		if (e !== this.mainFile || typeof t != "string") return t;
		let n = this.tikzExternalizationKind(t);
		return n ? Ee(t, n) : t;
	}
	tikzExternalizationKind(e = this.mainSource()) {
		let t = we(e, this.opts.tikzExternalization?.mode ?? "document");
		return t === "inject" ? this.tikzAutoDisabled ? null : (this.tikzAutoBlocker = Ce(e, this.projectTexFiles().values()), this.tikzAutoBlocker ? null : t) : t;
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
				...Z("auto"),
				fallback: !0
			});
		}
		return this.opts.tikzExternalization?.mode === "auto" && this.tikzAutoBlocker && (e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = {
			...Z("auto"),
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
		return l !== e && n.push(l.telemetry?.resolver), o.pictureErrors = Ne(l, s), c && (l.log += c), Y(l, o);
	}
	async runTikzFigureJobs(e, t, n) {
		let r = this.engine;
		if (!r) return null;
		let i = this.mainFile.replace(/\.tex$/i, ""), a = (await this.operations.observe(this.readTikzFigureList(i, n))).resume();
		if (!a) return null;
		let { realJob: o, names: s } = a;
		if (t === "inject" && s.length < 3) {
			let t = {
				...Z("auto"),
				figures: s.length
			};
			return t.blocked = "too-few-pictures", e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = t, {
				telemetry: t,
				errors: [],
				failureLog: "",
				inline: !0
			};
		}
		let c = globalThis.navigator, l = this.opts.tikzExternalization?.workers ?? Se(c?.hardwareConcurrency, c?.deviceMemory), u = (await this.operations.observe(this.ensureTikzPool(l))).resume();
		u.retain(s);
		let d = (await this.operations.observe(Promise.all(s.map((e) => r.readFile(`${e}.md5`))))).resume(), f = s.map((e, t) => ({
			name: e,
			md5: Oe(d[t])
		})).filter((e) => !u.isCurrent(e.name, e.md5)), p = {
			...Z(t === "inject" ? "auto" : "document"),
			figures: s.length,
			reused: s.length - f.length,
			workers: Math.min(l, Math.max(1, f.length))
		};
		if (p.discoveryCheckpointResume = e.phaseTimings?.checkpointResume === !0, e.telemetry ??= { diagnostics: T(e.log) }, e.telemetry.tikzExternalization = p, f.length === 0) return {
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
		let _ = (await this.operations.observe(u.render(f, (e) => Te(m, t, o, e), () => [...this.projectFileEntries(), ...h]))).resume();
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
			let t = De((await this.operations.observe(n.readFile(`${e}.figlist`))).resume());
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
		ve(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		if (!e.success) {
			this.projectIndex.updateAux(""), this.projectIndex.updateEngineCommands([]), this.projectIndex.updateSemanticTrace(B(""));
			return;
		}
		let t = this.mainFile.replace(/\.tex$/, ""), n = this.engine, r = (await this.operations.observe(le(`${t}.aux`, async (e) => (await this.operations.observe(n.readFile(e))).resume()))).resume();
		if (this.projectIndex.updateAuxData(ce(r)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(B(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = w(t);
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
		let n = this.engine;
		if (!n || !e.success && !e.pdf) return !1;
		let r = this.mainFile.replace(/\.tex$/, ""), i = `${r}.bbl`, a = (await this.operations.observe(this.bibtexAux(n, r, i))).resume();
		if (a === null) return !1;
		let o = a.includes("\\citation{"), s = this.collectBibFiles(), { bibFiles: c, hasGenerated: l } = (await this.operations.observe(pe(a, s, (e) => n.readFile(e)))).resume(), u = {
			aux: a,
			bibFiles: c
		}, d = this.resolveProjectBst(a);
		d && (u.bstFiles = { [d.path]: d.content });
		let f = this.opts.backends?.resolve(t), p = f?.location === "server" ? f : null, m = {
			control: fe(a),
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
		let i = (await this.operations.observe(me(`${t}.aux`, (t) => e.readFile(t)))).resume();
		return !i?.includes("\\bibdata{") || !i.includes("\\citation{") && this.fs.readFile(n) === null ? null : i;
	}
	async maybeRunBiblatex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf) return !1;
		let n = this.mainSource();
		if (m(n) !== "biblatex" || f(n) !== "biber") return !1;
		let r = this.mainFile.replace(/\.tex$/, ""), i = `${r}.bbl`;
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
		let t = w(e) ?? e;
		return this.fs.readFile(e) !== null && !this.generatedFiles.has(t);
	}
	matchesBibliographyRequest(e, t, n) {
		let r = this.bibliographyRequest;
		return this.fs.readFile(e) !== null && !!r && r.path === e && r.backend === n && r.version === n?.version && he(r.input, t);
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
		let i = w(t) ?? t, a = this.fs.readFile(t);
		return this.generatedFiles.add(i), this.generatedDependencyObservations.set(i, r), a !== n && (this.incremental?.reset(), this.heap?.reset(), this.fs.writeFile(t, n), (await this.operations.observe(e.writeFile(t, n))).resume(), !0);
	}
	reuseGeneratedOutput(e) {
		let t = w(e) ?? e, n = this.generatedDependencyObservations.get(t);
		return n && this.currentAuxiliaryDependencies.set(n.stage, n), !1;
	}
	runClientBiblatexLite(e, t, n) {
		let r = Object.entries(n).flatMap(([e, t]) => _e(t, e)), i = g(t), a = i.includes("*") ? r.map((e) => e.key) : i;
		return h({
			entries: r,
			citedKeys: a,
			sort: p(e)
		});
	}
	async maybeRunMakeindex(e) {
		let t = this.engine;
		if (!t || !e.success && !e.pdf || !x(this.mainSource())) return !1;
		let n = this.mainFile.replace(/\.tex$/, ""), i = `${n}.ind`;
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
		let n = e === "bibtexEngine" ? new ge(this.auxEngineOpts()) : new V(this.auxEngineOpts());
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
export { e as BIBER_STAGE, u as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, ae as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, oe as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, b as MemoryCacheStore, $ as WasmTexCompiler, ee as backendCacheKey, d as biblatexLiteBackend, ke as compileAccessiblePdf, te as contentKey, o as createBiberBackend, i as createJsonTextBackend, re as createMakeindexBackend, a as createRemoteBackend, ie as createXindyBackend, f as detectBiblatexBackend, p as detectBiblatexSort, m as detectBibliographyMode, x as detectIndexUse, h as generateBiblatexBbl, g as parseBcfCitedKeys, s as runBiberBackend, c as runRemoteBiber, v as runRemoteBibliography, S as runRemoteIndex, y as selectBiblatexBackend, ne as withCache };
