import { BIBER_STAGE as e, BIBTEX_STAGE as t, BackendRegistry as n, INDEX_STAGE as r, createJsonTextBackend as i, createRemoteBackend as a } from "./engine/backend-registry.js";
import { createBiberBackend as o, runRemoteBiber as s } from "./engine/biber-backend.js";
import { BIBLIOGRAPHY_STAGE as c, biblatexLiteBackend as l, detectBiblatexBackend as u, detectBiblatexSort as d, detectBibliographyMode as f, generateBiblatexBbl as p, parseBcfCitedKeys as m, resolveBstFile as h, runRemoteBibliography as g, selectBiblatexBackend as _ } from "./engine/bibliography-backend.js";
import { MemoryCacheStore as v, backendCacheKey as y, contentKey as b, withCache as ee } from "./engine/content-cache.js";
import { createMakeindexBackend as te, detectIndexUse as x, runRemoteIndex as S } from "./engine/index-backend.js";
import { createXindyBackend as ne } from "./engine/xindy-backend.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as re, COMPLETION_SNAPSHOT_SCHEMA_VERSION as C, CompletionFileDigestCache as w, createCompletionSnapshot as T } from "./engine/completion-snapshot.js";
import { BibtexEngine as ie } from "./engine/bibtex-engine.js";
import { buildDiagnostics as E, parseTexErrors as D } from "./engine/parse-errors.js";
import { buildDependencyManifest as ae, buildIncrementalDependencyManifest as oe, normalizeProjectDependencyPath as O } from "./engine/dependency-manifest.js";
import { WasmTexPdftexEngine as k } from "./engine/wasmtex-engine.js";
import { createCompileEngine as se, unavailableEngineResult as ce } from "./engine/compile-engine.js";
import { resolveEngine as le } from "./engine/engine-select.js";
import { IncrementalCompiler as A } from "./engine/incremental.js";
import { RerunController as j, signatureOf as M } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as N } from "./fs/engine-sync.js";
import { VirtualFS as P } from "./fs/virtual-fs.js";
import { parseAuxFile as F } from "./lsp/aux-parser.js";
import { parseBibFile as I, rebuildBibIndex as L } from "./lsp/bib-parser.js";
import { ProjectIndex as R } from "./lsp/project-index.js";
import { parseTraceFile as z } from "./lsp/trace-parser.js";
import { MakeindexEngine as B } from "./engine/makeindex-engine.js";
import { buildTexliveDependencySet as V, mergeTexliveDependencySets as H } from "./engine/texlive-dependencies.js";
import { PREAMBLE_SNAPSHOT_JOBNAME as U, defaultFigureWorkers as W, detectAutoBlocker as ue, detectTikzExternalization as de, figureJobSource as fe, mainJobSource as pe, parseFigureList as me, parseFigureMd5 as he } from "./engine/tikz-externalization.js";
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
	return D(e).filter((e) => !/Reference .* undefined|Citation .* undefined|There were undefined (?:references|citations)|Label\(s\) may have changed|Rerun to get/i.test(e.message));
}
async function ge(e, t = {}) {
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
	return c && i.push(...X(c, s)), {
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
function X(e, t) {
	let n = [];
	return !e.tagged && t && n.push("The compile produced no structure tree; the PDF is not tagged."), e.figures > e.figuresWithAlt && n.push(`${e.figures - e.figuresWithAlt} of ${e.figures} figures have no text alternative (alt={…}).`), n;
}
function _e() {
	return typeof globalThis.process?.versions?.node == "string";
}
function Z(e, t) {
	return e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.tikzExternalization = t, e;
}
function ve(e, t) {
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
function ye(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/";
}
var be = [
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
	fs;
	projectIndex = new R();
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
		this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = ye(e.assetBaseUrl), this.fs = new P({ empty: !0 });
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
			heapCheckpoints: !!this.opts.incremental && !_e(),
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
		if (this.detection = le(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
			this.engine?.terminate(), this.engineKind = this.detection.engine, this.engine = se(this.detection.engine, this.engineBaseOpts()), this.incremental = this.opts.incremental && this.engine instanceof k ? new A(this.engine, { mainFile: this.mainFile }) : null, this.heap = this.opts.incremental && this.engine instanceof k ? new (await (import("./engine/heap-checkpoints.js"))).HeapCheckpointCompiler(this.engine, { mainFile: this.mainFile }) : null;
			try {
				await this.engine.init(), this.unavailable = null, await this.syncAllFilesToEngine();
			} catch (e) {
				if (this.detection.engine === "pdflatex") throw e;
				this.unavailable = this.detection;
			}
		}
	}
	async init() {
		this.sessionDependencies = void 0, !this.initialized && (await this.ensureEngine(), this.initialized = !0);
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
			let e = ce(this.unavailable ?? this.detection);
			return this.attachDependencyManifest(e), e;
		}
		let e = this.engine;
		if (await this.syncModifiedFilesToEngine(), e.setPreambleSnapshot) {
			let t = !this.opts.disablePreambleSnapshot && !x(this.mainSource());
			e.setPreambleSnapshot(t);
		}
		let t = this.tikzExternalizationKind(), n = await this.tryIncrementalFastPath(t);
		if (n) return n;
		let r = await this.tryHeapResume(t) ?? await e.compile(this.heapArms()), i = [r.telemetry?.resolver];
		r = await this.applyTikzExternalization(r, t, i);
		let a = r.telemetry?.tikzExternalization, o = await this.runAuxStages(r), s = new j();
		for (; (r.success || r.pdf) && !(!s.decide(r.log, M(r.semanticTrace ?? r.log)).rerun && !o);) await this.syncModifiedFilesToEngine(), r = await e.compile(this.heapArms()), i.push(r.telemetry?.resolver), o = await this.runAuxStages(r);
		return this.heap?.noteFull(this.mainSource(), this.projectTexFiles(), r), a && (r.telemetry ??= { diagnostics: E(r.log) }, r.telemetry.tikzExternalization = a), this.attachTexliveDependencies(r, i), await this.updateMetadata(r), this.attachDependencyManifest(r), await this.attachCompletionSnapshot(r), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), r.synctex), r;
	}
	async prepareIncrementalCompile(e = this.mainFile, t) {
		this.ensureInitialized();
		let n = this.incremental;
		if (!n || this.unavailable || !this.engine || this.compileInFlight || this.fs.getModifiedFiles().length > 0) return !1;
		if (this.prebuildInFlight) return this.prebuildInFlight;
		let r = this.fs.readFile(e);
		if (typeof r != "string" || !e.toLowerCase().endsWith(".tex")) return !1;
		let i = this.mainSource(), a = this.projectTexFiles(), o = this.heap?.enabled ? this.prepareHeapCheckpoint(i, a, e, t ?? r.length) : n.prebuildForEdit(i, a, e, t ?? r.length);
		this.prebuildInFlight = o;
		try {
			return await o;
		} finally {
			this.prebuildInFlight === o && (this.prebuildInFlight = null);
		}
	}
	async prepareHeapCheckpoint(e, t, n, r) {
		let i = this.heap, a = this.engine;
		if (!i || !a || !(a instanceof k)) return !1;
		let o = r;
		if (n !== this.mainFile) {
			let t = e.indexOf(`{${n.replace(/\.tex$/, "")}}`);
			if (t < 0) return !1;
			o = t;
		}
		let s = i.armsForFullCompile(e, t, o);
		if (s.length === 0) return !1;
		let c = await a.compile({ checkpoints: s });
		return i.noteFull(e, t, c), (c.heapCheckpoints?.length ?? 0) > 0;
	}
	heapArms() {
		if (!this.heap?.enabled) return;
		let e = this.heap.armsForFullCompile(this.mainSource(), this.projectTexFiles());
		return e.length ? { checkpoints: e } : void 0;
	}
	async tryHeapResume(e) {
		if (!this.heap?.enabled || e) return null;
		let t = await this.heap.tryResume(this.mainSource(), this.projectTexFiles());
		return !t || !t.final || !t.result.pdf ? null : t.result;
	}
	toCompileResult(e, t) {
		let n = {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: D(e.log),
			compileTime: Math.round(t),
			synctex: null,
			synctexData: e.synctexData ?? null,
			telemetry: { diagnostics: E(e.log) }
		};
		return n.telemetry.dependencyManifest = oe(this.mainFile, this.lastFullDependencyManifest), n;
	}
	setFile(e, t) {
		this.projectIndex.invalidateCompletionSnapshot(), this.fs.writeFile(e, t);
		let n = O(e) ?? e;
		if (this.generatedFiles.delete(n), this.generatedDependencyObservations.delete(n), this.currentAuxiliaryDependencies.clear(), (e.endsWith(".tex") || e.endsWith(".bib") || e.endsWith(".bst")) && !e.endsWith(".bbl")) {
			let e = this.mainFile.replace(/\.tex$/, "");
			this.dropGeneratedFile(`${e}.bbl`), this.dropGeneratedFile(`${e}.ind`);
		}
		e.endsWith(".tex") || (this.incremental?.reset(), this.heap?.reset()), this.updateIndexForFile(e, t);
	}
	async loadProject(e) {
		this.fs = new P({ empty: !0 }), this.projectIndex = new R(), this.generatedFiles.clear(), this.generatedDependencyObservations.clear(), this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, this.incremental?.reset();
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
		this.projectIndex.invalidateCompletionSnapshot();
		let t = e !== this.mainFile;
		this.mainFile = e, this.currentAuxiliaryDependencies.clear(), this.lastFullDependencyManifest = void 0, t && (this.incremental?.setMainFile(e), this.heap?.reset()), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e);
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
		this.engine?.terminate(), this.engine = null, this.tikzPool?.dispose(), this.tikzPool = null, this.exportCompiler?.dispose(), this.exportCompiler = null, this.exportSynced.clear(), this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.lastFullDependencyManifest = void 0, this.initialized = !1;
	}
	dropGeneratedFile(e) {
		this.fs.deleteFile(e);
		let t = O(e) ?? e;
		this.generatedFiles.delete(t), this.generatedDependencyObservations.delete(t);
	}
	auxiliaryDependencyObservations(e) {
		let t = new Map(this.currentAuxiliaryDependencies);
		for (let n of e.inputFiles ?? []) {
			let e = O(n);
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
		for (let e of be) n.add(`${r}.${e}`);
		let i = V(this.opts.texliveVersion ?? "2025", this.completionProfile(), t, { excludeNames: n });
		i && (this.sessionDependencies = H(this.sessionDependencies, i), e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.texliveDependencies = this.sessionDependencies);
	}
	attachDependencyManifest(e) {
		e.telemetry ??= { diagnostics: E(e.log) };
		let t = ae({
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
		}))), i = t.getCompletionObservation?.(), a = await T({
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
		n !== this.mainFile || t !== this.engine || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.completionSnapshot = a, this.projectIndex.updateCompletionSnapshot(a));
	}
	async syncAllFilesToEngine() {
		let e = this.engine;
		!e || this.unavailable || await N(this.fs, {
			writeFile: (t, n) => e.writeFile(t, this.engineContent(t, n)),
			setMainFile: (t) => e.setMainFile(t)
		}, (e) => this.ensureEngineDirectories(e), this.mainFile);
	}
	engineContent(e, t) {
		if (e !== this.mainFile || typeof t != "string") return t;
		let n = this.tikzExternalizationKind(t);
		return n ? pe(t, n) : t;
	}
	tikzExternalizationKind(e = this.mainSource()) {
		let t = de(e, this.opts.tikzExternalization?.mode ?? "document");
		return t === "inject" ? this.tikzAutoDisabled ? null : (this.tikzAutoBlocker = ue(e, this.projectTexFiles().values()), this.tikzAutoBlocker ? null : t) : t;
	}
	async tryIncrementalFastPath(e) {
		if (!this.incremental || e) return null;
		let t = performance.now(), n = await this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles());
		return n?.final && n.pdf ? this.toCompileResult(n, performance.now() - t) : null;
	}
	async applyTikzExternalization(e, t, n) {
		return t && (e.success || e.pdf) ? this.externalizeTikzFigures(e, t, n) : (this.opts.tikzExternalization?.mode === "auto" && this.tikzAutoBlocker && (e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.tikzExternalization = {
			...Q("auto"),
			blocked: this.tikzAutoBlocker
		}), e);
	}
	async externalizeTikzFigures(e, t, n) {
		let r = this.engine;
		if (!r) return e;
		let i = !!r.setPreambleSnapshot && !this.opts.disablePreambleSnapshot, a = await this.runTikzFigureJobs(e, t, i);
		if (!a) return e;
		let { telemetry: o, errors: s, failureLog: c } = a;
		if (t === "inject" && (a.inline || o.failed.length > 0)) {
			this.tikzAutoDisabled = !0, a.inline || (o.fallback = !0), await r.writeFile(this.mainFile, this.mainSource());
			let e = await r.compile();
			return n.push(e.telemetry?.resolver), Z(e, o);
		}
		let l = o.compiled > 0 ? await r.compile() : e;
		return l !== e && n.push(l.telemetry?.resolver), o.pictureErrors = ve(l, s), c && (l.log += c), Z(l, o);
	}
	async runTikzFigureJobs(e, t, n) {
		let r = this.engine;
		if (!r) return null;
		let i = this.mainFile.replace(/\.tex$/i, ""), a = await this.readTikzFigureList(i, n);
		if (!a) return null;
		let { realJob: o, names: s } = a;
		if (t === "inject" && s.length < 3) {
			let t = {
				...Q("auto"),
				figures: s.length
			};
			return t.blocked = "too-few-pictures", e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.tikzExternalization = t, {
				telemetry: t,
				errors: [],
				failureLog: "",
				inline: !0
			};
		}
		let c = globalThis.navigator, l = this.opts.tikzExternalization?.workers ?? W(c?.hardwareConcurrency, c?.deviceMemory), u = await this.ensureTikzPool(l);
		u.retain(s);
		let d = await Promise.all(s.map((e) => r.readFile(`${e}.md5`))), f = s.map((e, t) => ({
			name: e,
			md5: he(d[t])
		})).filter((e) => !u.isCurrent(e.name, e.md5)), p = {
			...Q(t === "inject" ? "auto" : "document"),
			figures: s.length,
			reused: s.length - f.length,
			workers: Math.min(l, Math.max(1, f.length))
		};
		if (e.telemetry ??= { diagnostics: E(e.log) }, e.telemetry.tikzExternalization = p, f.length === 0) return {
			telemetry: p,
			errors: G(u, s),
			failureLog: ""
		};
		let m = this.mainSource(), h = [], g = await r.readFile(`${i}.aux`);
		g !== null && h.push([`${o}.aux`, g]);
		for (let e of this.projectTexFiles().keys()) {
			if (e === this.mainFile) continue;
			let t = `${e.replace(/\.tex$/i, "")}.aux`, n = await r.readFile(t);
			n !== null && h.push([t, n]);
		}
		let _ = await u.render(f, (e) => fe(m, t, o, e), () => [...this.projectFileEntries(), ...h]);
		p.compiled = _.rendered.size, p.failed = _.failures.map((e) => e.name), p.figureTimeMs = Math.round(_.elapsedMs);
		let v = G(u, s), y = "";
		for (let e of _.failures) v.push(...K(e.log)), y += `\n[wasmtex] TikZ figure job '${e.name}' failed:\n${e.log.slice(-2e3)}\n`;
		let b = [];
		for (let e of _.rendered.keys()) b.push(`${e}.pdf`);
		return await this.ensureEngineDirectories(b), await Promise.all([..._.rendered].flatMap(([e, t]) => [r.writeFile(`${e}.pdf`, t.pdf), ...t.dpth === null ? [] : [r.writeFile(`${e}.dpth`, t.dpth)]])), {
			telemetry: p,
			errors: v,
			failureLog: y
		};
	}
	async ensureTikzPool(e) {
		if (!this.tikzPool) {
			let { TikzFigurePool: t } = await import("./engine/tikz-figure-pool.js");
			this.tikzPool = new t(() => this.spawnFigureCompiler(), e, this.mainFile);
		}
		return this.tikzPool;
	}
	async readTikzFigureList(e, t) {
		let n = this.engine;
		if (!n) return null;
		let r = t ? [U, e] : [e, U];
		for (let e of r) {
			let t = me(await n.readFile(`${e}.figlist`));
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
		await this.ensureEngineDirectories(t.map((e) => e.path)), await Promise.all(t.map((t) => e.writeFile(t.path, this.engineContent(t.path, t.content)))), this.fs.markSynced(t), e.setMainFile(this.mainFile);
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
		L(this.fs, this.projectIndex);
	}
	async updateMetadata(e) {
		if (!this.engine) return;
		let t = this.mainFile.replace(/\.tex$/, ""), n = await this.engine.readFile(`${t}.aux`);
		if (n && this.projectIndex.updateAuxData(F(n)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(z(e.semanticTrace)), e.inputFiles?.length) for (let t of e.inputFiles) {
			let e = O(t);
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
		let l = `${n}.bbl`, u = O(l) ?? l;
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
		let l = `${r}.bbl`, d = O(l) ?? l;
		return this.fs.writeFile(l, o), this.generatedFiles.add(d), this.generatedDependencyObservations.set(d, c), await t.writeFile(l, o), !0;
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
		let r = await t.readFile(`${n}.idx`);
		if (!r?.trim()) return !1;
		let i = { idx: r }, a = await S(this.opts.backends, i) ?? await this.runClientMakeindex(n, r), o = {
			stage: "index",
			projectInputs: [],
			complete: !!a
		};
		if (this.currentAuxiliaryDependencies.set("index", o), !a) return !1;
		let s = `${n}.ind`, c = O(s) ?? s;
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
		let e = new ie(this.auxEngineOpts());
		return await e.init(), this.bibtexEngine = e, e;
	}
	async runClientMakeindex(e, t) {
		let n = await this.ensureMakeindexEngine();
		return await n.writeFile(`${e}.idx`, t), await n.compile(e), await n.readFile(`${e}.ind`) ?? null;
	}
	async ensureMakeindexEngine() {
		if (this.makeindexEngine) return this.makeindexEngine;
		let e = new B(this.auxEngineOpts());
		return await e.init(), this.makeindexEngine = e, e;
	}
	ensureInitialized() {
		if (!this.initialized) throw Error("WasmTexCompiler is not initialized. Call init() first.");
	}
};
//#endregion
export { e as BIBER_STAGE, c as BIBLIOGRAPHY_STAGE, t as BIBTEX_STAGE, n as BackendRegistry, re as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, C as COMPLETION_SNAPSHOT_SCHEMA_VERSION, r as INDEX_STAGE, v as MemoryCacheStore, $ as WasmTexCompiler, y as backendCacheKey, l as biblatexLiteBackend, ge as compileAccessiblePdf, b as contentKey, o as createBiberBackend, i as createJsonTextBackend, te as createMakeindexBackend, a as createRemoteBackend, ne as createXindyBackend, u as detectBiblatexBackend, d as detectBiblatexSort, f as detectBibliographyMode, x as detectIndexUse, p as generateBiblatexBbl, m as parseBcfCitedKeys, s as runRemoteBiber, g as runRemoteBibliography, S as runRemoteIndex, _ as selectBiblatexBackend, ee as withCache };
