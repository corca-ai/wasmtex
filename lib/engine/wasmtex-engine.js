import { parseEngineCompletionObservation as e } from "./completion-snapshot.js";
import { PersistentCache as t, isIndexedDbSupported as n } from "./persistent-cache.js";
import { BaseWorkerEngine as r, resolveTexliveUrl as i } from "./base-worker-engine.js";
import { fetchBloomFilter as a } from "./bloom-filter.js";
import { normalizeProjectDependencyPath as o } from "./dependency-manifest.js";
import { engineFormatUrl as s, engineWorkerUrl as c, formatAssetBase as l, normalizedFormatUrl as u } from "./engine-assets.js";
import { compileArtifact as d, hasFatalNoOutput as f } from "./compile-output.js";
import { ResolverEvidenceCollector as p } from "./resolver-evidence.js";
import { createEngineWorker as m } from "./worker-host.js";
import { buildDiagnostics as h, parseGlyphGaps as g, parseTexErrors as _ } from "./parse-errors.js";
import { buildDependencyGraph as v } from "./dependency-graph.js";
import { readResponseWithProgress as y } from "./fetch-gz.js";
import { enrichGlyphSuggestions as b } from "./glyph-suggestions.js";
import { persistIfNeeded as x } from "./persist-watermark.js";
import { PreambleSnapshotCache as S, durablePreambleKey as C, preambleSha256 as w } from "./preamble-cache.js";
import { extractPreamble as T } from "./preamble-utils.js";
import { prefetchTexliveResponses as E } from "./transport-prefetch.js";
//#region src/engine/wasmtex-engine.ts
var D = 1;
function O(e) {
	return e ? { resolver: e } : {};
}
function k(e, t) {
	let n = Array.isArray(t.engineCommands) ? t.engineCommands : null, r = n?.filter((e) => typeof e == "string");
	r && (e.engineCommands = r);
	let i = t.engineCommandsDropped;
	if (typeof i != "number" || !Number.isSafeInteger(i) || i < 0) {
		e.engineCommandsComplete = !1;
		return;
	}
	let a = n ? n.length - (r?.length ?? 0) : 0;
	e.engineCommandsDropped = Math.min(2 ** 53 - 1, i + a), e.engineCommandsComplete = n !== null && t.engineCommandsComplete === !0 && a === 0;
}
function A(e, t) {
	if (!Array.isArray(t.inputFiles)) {
		e.inputFilesComplete = !1;
		return;
	}
	let n = t.inputFiles.filter((e) => typeof e == "string");
	e.inputFiles = n, e.inputFilesComplete = t.inputFilesComplete === !0 && n.length === t.inputFiles.length;
}
function j(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.files) n.set(`${t.format}/${t.filename}`, t);
	for (let e of t.files) n.set(`${e.format}/${e.filename}`, e);
	let r = new Set(t.notFound.map((e) => `${e.format}/${e.filename}`)), i = /* @__PURE__ */ new Set(), a = [];
	for (let o of [...e.notFound, ...t.notFound]) {
		let e = `${o.format}/${o.filename}`;
		if (!i.has(e)) {
			if (n.has(e)) if (r.has(e)) n.delete(e);
			else continue;
			i.add(e), a.push(o);
		}
	}
	let o = {
		files: [...n.values()],
		notFound: a
	}, s = t.bloomFilter ?? e.bloomFilter;
	return s && (o.bloomFilter = s), o;
}
function M(e, t) {
	let n = t.heapCheckpointRetention;
	typeof n == "object" && n && "ids" in n && "bytes" in n && Array.isArray(n.ids) && n.ids.every((e) => typeof e == "string" && e.length > 0) && new Set(n.ids).size === n.ids.length && typeof n.bytes == "number" && Number.isSafeInteger(n.bytes) && n.bytes >= 0 && (e.heapCheckpointRetention = {
		ids: [...n.ids],
		bytes: n.bytes
	});
	let r = t.heapCheckpoints;
	Array.isArray(r) && (e.heapCheckpoints = r.map((e) => {
		let t = e, n = Array.isArray(t.inputs) && t.inputs.every((e) => typeof e == "string" && e.length > 0) ? t.inputs : null;
		return {
			...typeof t.path == "string" ? {
				path: t.path,
				prefixSafe: t.prefixSafe === !0
			} : {},
			id: String(t.id),
			line: Number(t.line),
			bytes: Number(t.bytes) || 0,
			ms: Number(t.ms) || 0,
			inputs: n,
			inputsComplete: t.inputsComplete === !0 && n !== null && n.length > 0
		};
	}));
}
var N = class N extends r {
	formatCacheIdentity;
	formatPath;
	skipFormatPreload;
	version;
	warmupCache;
	warmupPositiveSources = /* @__PURE__ */ new Map();
	warmupNegativeSources = /* @__PURE__ */ new Map();
	preambleSnapshotEnabled;
	persistentCacheEnabled;
	assetBaseUrl;
	effectiveTexliveUrl;
	preambleMirrorRevision;
	preambleCache = null;
	engineBuildId = null;
	projectFiles = /* @__PURE__ */ new Map();
	loadedPreambleKey = null;
	attemptedPreambleKey = null;
	activePreambleDependencies = /* @__PURE__ */ new Set();
	preamblePersistInFlight = null;
	durableCache = null;
	persistentAssetOptions;
	bloomFilter;
	mainFileName = "main.tex";
	fileCheckpointsSupported = !1;
	heapCheckpointsSupported = !1;
	lineCheckpointsSupported = !1;
	pagePreviewSupported = !1;
	pagePreviewForkSupported = !1;
	pagePreviewFallbackSupported = !1;
	previewFallbackId;
	get pagePreviewFallbackId() {
		return this.previewFallbackId;
	}
	forkOptions;
	sharedCheckpointsSupported = !1;
	checkpointBudget;
	previewForkInitializing = !1;
	sources = /* @__PURE__ */ new Map();
	transportPrefetchSupported = !1;
	transportPrefetchAttempted = !1;
	transportPrefetchAbort = null;
	completionObservation = null;
	persist = {
		downloadCount: 0,
		lastPersisted: -1,
		inFlight: !1
	};
	resolver;
	onFileDownload;
	constructor(e) {
		let t = e?.assetBaseUrl ?? "/", r = e?.texliveVersion ?? "2025", a = e?.engineBinary ?? "pdftex";
		super(e?.heapCheckpoints ? `${c(t, r, a)}?engine=checkpoint` : c(t, r, a), e?.texliveUrl ?? null), this.forkOptions = { ...e }, this.formatPath = s(l(t, e?.formatAssetBaseUrl), r, a), this.formatCacheIdentity = u(this.formatPath, e?.formatAssetBaseUrl), this.skipFormatPreload = !!e?.skipFormatPreload, this.version = r, this.warmupCache = e?.warmupCache, this.preambleSnapshotEnabled = !e?.disablePreambleSnapshot, this.persistentCacheEnabled = !!e?.persistentCache && n(), this.assetBaseUrl = t, this.effectiveTexliveUrl = i(e?.texliveUrl ?? null, r), this.persistentAssetOptions = {
			version: r,
			texliveUrl: this.effectiveTexliveUrl,
			mirrorRevision: e?.resolverProfile?.mirrorRevision ?? null
		}, this.preambleMirrorRevision = e?.preambleCacheIdentity?.mirrorRevision ?? null, this.resolver = new p("pdftex", e?.resolverProfile ?? {
			id: `texlive-${r}`,
			texliveYear: r,
			mirrorRevision: this.preambleMirrorRevision
		}), e?.persistentPreambleCache && this.preambleMirrorRevision && (n() || e.preambleCacheStore) && (this.preambleCache = new S(e.preambleCacheStore ? { store: e.preambleCacheStore } : {}));
	}
	async init() {
		if (this.worker) throw Error("Engine already initialized");
		this.status = "loading", this.transportPrefetchSupported = !1, this.transportPrefetchAttempted = !1;
		let e = new Promise((e, t) => {
			this.worker = m(this.enginePath), this.worker.onmessage = (n) => {
				this.dispatchWorkerMessage(n.data, e, t);
			}, this.worker.onerror = (e) => {
				t(this.handleWorkerError(e));
			};
		}), t = this.previewForkInitializing ? void 0 : this.prepareInitInputs(), [, n] = await Promise.all([e, t]);
		if (this.worker.postMessage({
			cmd: "settexliveurl",
			url: this.effectiveTexliveUrl
		}), this.preambleSnapshotEnabled || this.worker.postMessage({
			cmd: "setpreamblesnapshot",
			enabled: !1
		}), this.previewForkInitializing) {
			await this.loadEngineBuildId();
			return;
		}
		n && (n.warmup ? await this.injectWarmupCache(n.warmup) : n.bloom && (this.persistentCacheEnabled && (this.bloomFilter = n.bloom.slice(0)), this.worker.postMessage({
			cmd: "loadbloom",
			data: n.bloom
		}, [n.bloom])), await Promise.all([
			this.preloadFormat(n.format),
			this.preloadTexliveFile(11, "pdftex.map", n.map),
			this.preambleCache || this.pagePreviewForkSupported ? this.loadEngineBuildId() : Promise.resolve()
		]));
	}
	async prepareInitInputs() {
		let e = this.skipFormatPreload ? Promise.resolve(null) : this.fetchGzWithProgress(this.formatPath), t = await this.resolveWarmupCache(), [n, r, i] = await Promise.all([
			e,
			this.warmupPositiveSources.has("11/pdftex.map") ? Promise.resolve(null) : this.fetchGzWithProgress(`${this.effectiveTexliveUrl}pdftex/11/pdftex.map`, !1),
			t ? Promise.resolve(null) : a(this.effectiveTexliveUrl).catch(() => null)
		]);
		return {
			warmup: t,
			format: n,
			map: r,
			bloom: i
		};
	}
	async loadEngineBuildId() {
		try {
			let e = await fetch(`${this.assetBaseUrl}wasmtex/${this.version}/BUILD-RECEIPT.pdftex.json`);
			if (!e.ok) return;
			let t = await e.json();
			typeof t.buildId == "string" && /^[a-f0-9]{64}$/.test(t.buildId) && t.family === "pdftex" && t.texliveYear === this.version && (this.engineBuildId = t.buildId);
		} catch {}
	}
	dispatchWorkerMessage(e, t, n) {
		if (!e.cmd && !e.msgId) {
			e.result === "ok" ? (this.status = "ready", this.transportPrefetchSupported = e.transportPrefetch === !0, this.lineCheckpointsSupported = e.lineCheckpoints === !0, this.heapCheckpointsSupported = e.heapCheckpoints === !0, this.pagePreviewSupported = e.pagePreview === !0, this.pagePreviewForkSupported = e.pagePreviewFork === !0, this.pagePreviewFallbackSupported = e.pagePreviewFallback === !0, this.sharedCheckpointsSupported = e.sharedCheckpoints === !0, this.fileCheckpointsSupported = e.fileCheckpoints === !0, t()) : (this.status = "error", n(/* @__PURE__ */ Error("Engine failed to initialize")));
			return;
		}
		if (!(e.msgId && this.deliverResponse(e.msgId, e)) && e.cmd) {
			if (this.handleResolverMessage(e)) return;
			if (e.cmd === "downloading" && e.file) {
				this.persist.downloadCount++, this.onFileDownload?.(e.file);
				return;
			}
			this.deliverResponse(`cmd:${e.cmd}`, e);
		}
	}
	handleResolverMessage(e) {
		return e.cmd === "resolverready" ? (this.resolver.markSupported(), !0) : e.cmd === "resolver" && e.evidence ? (this.resolver.record(e.evidence), !0) : !1;
	}
	async preloadFormat(e) {
		if (e) try {
			await this.postMessageWithResponse({
				cmd: "loadformat",
				data: e
			}, "cmd:loadformat", [e]);
		} catch {}
	}
	async preloadTexliveFile(e, t, n) {
		if (n) try {
			let r = `msg-${D++}`;
			await this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: e,
				filename: t,
				data: n,
				source: "warmup-cache",
				msgId: r
			}, r, [n]);
		} catch {}
	}
	async injectWarmupCache(e) {
		let t = [];
		for (let n of e.files) {
			let e = `msg-${D++}`, r = n.data.slice(0);
			t.push(this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: n.format,
				filename: n.filename,
				data: r,
				source: this.warmupPositiveSources.get(`${n.format}/${n.filename}`) ?? "warmup-cache",
				msgId: e
			}, e, [r]));
		}
		let n = [{
			source: "warmup-negative",
			entries: e.notFound.filter((e) => this.warmupNegativeSources.get(`${e.format}/${e.filename}`) !== "durable-negative")
		}, {
			source: "durable-negative",
			entries: e.notFound.filter((e) => this.warmupNegativeSources.get(`${e.format}/${e.filename}`) === "durable-negative")
		}];
		for (let e of n) {
			if (e.entries.length === 0) continue;
			let n = `msg-${D++}`, r = this.postMessageWithResponse({
				cmd: "preload404",
				entries: e.entries,
				source: e.source,
				msgId: n
			}, n), i = new Promise((e) => setTimeout(() => {
				this.pendingResponses.delete(n), e();
			}, 2e3));
			t.push(Promise.race([r, i]));
		}
		if (e.bloomFilter) {
			let t = e.bloomFilter.slice(0);
			this.worker.postMessage({
				cmd: "loadbloom",
				data: t
			}, [t]);
		}
		await Promise.all(t);
	}
	async fetchGzWithProgress(e, t = !0) {
		try {
			let n = await fetch(e);
			return n.ok ? (await y(n, t ? this.onProgress : void 0)).buffer : null;
		} catch {
			return null;
		}
	}
	async mkdir(e) {
		this.checkInitialized(), await this.postMessageWithResponse({
			cmd: "mkdir",
			url: e
		}, "cmd:mkdir");
	}
	async writeFile(e, t) {
		this.checkInitialized(), this.projectFiles.set(e, t), typeof t == "string" && this.sources.set(e, t), this.activePreambleDependencies.has(e) && (this.loadedPreambleKey = null, this.attemptedPreambleKey = null, this.activePreambleDependencies.clear()), await this.postMessageWithResponse({
			cmd: "writefile",
			url: e,
			src: t
		}, "cmd:writefile");
	}
	setMainFile(e) {
		this.checkInitialized(), e !== this.mainFileName && (this.loadedPreambleKey = null, this.attemptedPreambleKey = null, this.activePreambleDependencies.clear()), this.mainFileName = e, this.worker.postMessage({
			cmd: "setmainfile",
			url: e
		});
	}
	setPreambleSnapshot(e) {
		this.checkInitialized(), this.preambleSnapshotEnabled = e, e || (this.loadedPreambleKey = null, this.attemptedPreambleKey = null, this.activePreambleDependencies.clear()), this.worker.postMessage({
			cmd: "setpreamblesnapshot",
			enabled: e
		});
	}
	isPreambleSnapshotEnabled() {
		return this.preambleSnapshotEnabled;
	}
	async flushCache() {
		this.checkInitialized(), await this.preamblePersistInFlight, this.loadedPreambleKey = null, this.attemptedPreambleKey = null, this.activePreambleDependencies.clear(), this.projectFiles.clear(), this.sources.clear(), this.worker.postMessage({ cmd: "flushcache" });
	}
	async resolveWarmupCache() {
		let e = this.warmupCache;
		if (this.persistentCacheEnabled) {
			this.durableCache = new t(this.persistentAssetOptions);
			try {
				let t = await this.durableCache.load();
				t && (e = e ? j(t, e) : t, this.persist.lastPersisted = 0);
			} catch {}
		}
		return this.recordWarmupSources(e), e?.bloomFilter && (this.bloomFilter = e.bloomFilter), e;
	}
	recordWarmupSources(e) {
		this.warmupPositiveSources.clear(), this.warmupNegativeSources.clear();
		let t = new Set(this.warmupCache?.files.map((e) => `${e.format}/${e.filename}`) ?? []), n = new Set(this.warmupCache?.notFound.map((e) => `${e.format}/${e.filename}`) ?? []);
		for (let n of e?.files ?? []) {
			let e = `${n.format}/${n.filename}`;
			this.warmupPositiveSources.set(e, t.has(e) ? "warmup-cache" : "persistent-cache");
		}
		for (let t of e?.notFound ?? []) {
			let e = `${t.format}/${t.filename}`;
			this.warmupNegativeSources.set(e, n.has(e) ? "warmup-negative" : "durable-negative");
		}
	}
	async dumpTexliveCache() {
		this.checkInitialized();
		let e = `msg-${D++}`, t = await this.postMessageWithResponse({
			cmd: "dumpcache",
			msgId: e
		}, e), n = {
			files: t.files ?? [],
			notFound: t.notFound ?? []
		};
		return this.bloomFilter && (n.bloomFilter = this.bloomFilter), n;
	}
	async persistTexliveCache() {
		this.durableCache && await this.durableCache.saveFrom(() => this.dumpTexliveCache());
	}
	getDownloadCount() {
		return this.persist.downloadCount;
	}
	async clearCache() {
		let e = this.durableCache ?? (n() ? new t(this.persistentAssetOptions) : null);
		await Promise.all([e?.clear(), this.preambleCache?.clear()]);
	}
	maybePersistCache() {
		this.durableCache && x(this.persist, () => this.persistTexliveCache());
	}
	async buildFormat() {
		this.checkReady(), this.status = "compiling";
		let e = await this.postMessageWithResponse({ cmd: "compileformat" }, "cmd:compile");
		if (this.status = "ready", e.result !== "ok" || e.status !== 0 || !e.pdf) throw Error(`Failed to build pdflatex format:\n${e.log || "unknown engine error"}`);
		return new Uint8Array(e.pdf);
	}
	get supportsLineCheckpoints() {
		return this.heapCheckpointsSupported && this.lineCheckpointsSupported;
	}
	get supportsHeapCheckpoints() {
		return this.heapCheckpointsSupported;
	}
	get supportsFileCheckpoints() {
		return this.fileCheckpointsSupported;
	}
	get supportsSharedCheckpoints() {
		return this.sharedCheckpointsSupported;
	}
	setCheckpointBudget(e, t) {
		this.checkpointBudget = {
			maxCount: Math.min(e, 64),
			maxBytes: t
		};
	}
	terminate() {
		this.transportPrefetchAbort?.abort(), super.terminate();
	}
	async prefetchTransport() {
		this.transportPrefetchAttempted = !0;
		let e = this.worker, t = new AbortController();
		this.transportPrefetchAbort = t;
		let n = setTimeout(() => t.abort(), 1500);
		try {
			let n = await E(this.sources.values(), this.effectiveTexliveUrl, t.signal, new Set(this.warmupPositiveSources.keys()));
			if (!e || this.worker !== e) throw new DOMException("Engine disposed", "AbortError");
			if (this.status !== "compiling") throw Error("Engine unavailable during prefetch");
			let r = `msg-${D++}`;
			await this.postMessageWithResponse({
				cmd: "preloadtransport",
				files: n,
				msgId: r
			}, r, n.map((e) => e.data));
		} finally {
			clearTimeout(n), this.transportPrefetchAbort === t && (this.transportPrefetchAbort = null);
		}
	}
	async compile(e) {
		if (this.transportPrefetchSupported && !this.transportPrefetchAttempted) {
			this.checkReady(), this.status = "compiling";
			try {
				await this.prefetchTransport();
			} finally {
				this.status === "compiling" && (this.status = "ready");
			}
		}
		let t = e?.checkpoints?.length ? e.checkpoints : void 0;
		return this.runCompile(t ? {
			cmd: "compilelatex",
			checkpoints: t
		} : { cmd: "compilelatex" });
	}
	async compileFromHeapCheckpoint(e, t) {
		if (!this.heapCheckpointsSupported) throw Error("heap checkpoints are not supported by this engine");
		return this.runCompile({
			cmd: "compileheapcheckpoint",
			id: e,
			...t?.length ? { checkpoints: t } : {}
		});
	}
	async compilePagePreview(e, t) {
		return this.pagePreviewSupported ? this.runCompile({
			cmd: "compilepagepreview",
			pageLimit: e,
			id: t
		}) : null;
	}
	async forkForPagePreview(e, t, n) {
		if (!this.pagePreviewForkSupported || !this.engineBuildId || this.status !== "ready") return null;
		t?.throwIfAborted();
		let r = this.mainFileName, i = new Map(this.sources), a = new Map(this.projectFiles), o = await P(this.postMessageWithResponse({
			cmd: "exportpagepreview",
			id: e,
			fallbackId: this.pagePreviewFallbackSupported ? n : void 0
		}, "cmd:exportpagepreview"), t);
		if (t?.throwIfAborted(), o.result !== "ok" || !o.previewState) return null;
		let s = { ...this.forkOptions };
		delete s.warmupCache;
		let c = new N({
			...s,
			skipFormatPreload: !0,
			persistentCache: !1,
			persistentPreambleCache: !1
		});
		c.previewForkInitializing = !0;
		let l = () => c.terminate();
		t?.addEventListener("abort", l, { once: !0 });
		try {
			if (await P(c.init(), t), c.engineBuildId !== this.engineBuildId || (await c.postMessageWithResponse({
				cmd: "importpagepreview",
				previewState: o.previewState
			}, "cmd:importpagepreview")).result !== "ok") return c.terminate(), null;
			t?.throwIfAborted(), c.previewFallbackId = n && o.checkpointIds?.includes(n) ? n : void 0, c.mainFileName = r;
			for (let [e, t] of i) c.sources.set(e, t);
			for (let [e, t] of a) c.projectFiles.set(e, t);
			return c;
		} catch (e) {
			throw c.terminate(), e;
		} finally {
			t?.removeEventListener("abort", l);
		}
	}
	async dropHeapCheckpoints(e) {
		!this.worker || !this.heapCheckpointsSupported || await this.postMessageWithResponse({
			cmd: "dropheapcheckpoints",
			ids: e
		}, "cmd:dropheapcheckpoints");
	}
	async runCompile(t) {
		this.checkReady();
		let n = this.preambleCache ? await this.restorePersistentPreamble() : null;
		this.status = "compiling";
		let r = performance.now();
		this.resolver.begin();
		let i = await this.postMessageWithResponse({
			...t,
			...this.checkpointBudget ? { checkpointBudget: this.checkpointBudget } : {}
		}, "cmd:compile"), a = this.resolver.finish();
		this.completionObservation = Array.isArray(i.completionObservations) ? e(i.completionObservations) : null, this.status = "ready";
		let o = performance.now() - r, s = i.log || "", c = f(s), l = !c && i.result === "ok" && (i.status === 0 || i.status === 1), u = d(i.pdf, c), p = d(i.synctex, c), m = l && i.format ? new Uint8Array(i.format) : void 0, y = _(s), x = !!i.preambleSnapshot, S = !!i.preambleRebuilt, C = {
			success: l,
			pdf: u,
			log: s,
			errors: y,
			compileTime: o,
			synctex: p,
			format: m,
			preambleSnapshot: x,
			preambleRebuilt: S
		}, w = this.validPhaseTimings(i.phaseTimings);
		w && (C.phaseTimings = w), M(C, i), k(C, i), A(C, i), i.semanticTrace && (C.semanticTrace = i.semanticTrace);
		let T = g(s);
		return T.length > 0 && (b(T), C.glyphCoverage = { gaps: T }), C.telemetry = {
			diagnostics: h(s, T),
			...O(a),
			dependencies: v(s, {
				inputFiles: C.inputFiles,
				source: this.sources.get(this.mainFileName)
			})
		}, l && this.maybePersistCache(), l && S && n && i.preambleFormat && i.preambleHash && i.preambleInputFiles && this.persistPreambleSnapshot(n, i.preambleFormat, i.preambleHash, i.preambleInputFiles), C;
	}
	validPhaseTimings(e) {
		if (!e || typeof e != "object") return null;
		let t = e, n = (e) => {
			let n = t[e];
			return typeof n == "number" && Number.isFinite(n) && n >= 0 ? n : null;
		}, r = n("workerTotalMs"), i = n("heapRestoreMs"), a = n("heapSnapshotMs"), o = n("heapSnapshotBytes"), s = n("heapSizeBytes"), c = n("preambleBuildMs"), l = n("formatInstallMs"), u = n("preambleExportMs"), d = n("postProcessMs"), f = n("texRunMs");
		return r === null || i === null || a === null || o === null || s === null || c === null || l === null || u === null || d === null || f === null ? null : {
			workerTotalMs: r,
			heapRestoreMs: i,
			heapSnapshotMs: a,
			heapSnapshotBytes: o,
			heapSizeBytes: s,
			preambleBuildMs: c,
			formatInstallMs: l,
			preambleExportMs: u,
			postProcessMs: d,
			texRunMs: f,
			...t.checkpointResume === !0 ? { checkpointResume: !0 } : {}
		};
	}
	async currentPreambleKey() {
		if (!this.preambleCache || !this.engineBuildId || !this.preambleMirrorRevision) return null;
		let e = this.sources.get(this.mainFileName);
		if (!e) return null;
		let t = T(e);
		return t ? C({
			engineBuildId: this.engineBuildId,
			mirrorRevision: this.preambleMirrorRevision,
			texliveUrl: this.effectiveTexliveUrl,
			texliveYear: this.version,
			...this.formatCacheIdentity === void 0 ? {} : { formatUrl: this.formatCacheIdentity }
		}, t.preamble) : null;
	}
	async restorePersistentPreamble() {
		if (!this.preambleSnapshotEnabled || !this.preambleCache) return null;
		let e = await this.currentPreambleKey();
		if (!e || e === this.loadedPreambleKey || e === this.attemptedPreambleKey) return e;
		this.attemptedPreambleKey = e;
		let t = await this.preambleCache.load(e).catch(() => null);
		if (!t || !await this.dependenciesMatch(t.projectDependencies)) return e;
		let n = t.format.slice(0);
		return (await this.postMessageWithResponse({
			cmd: "loadpreamblesnapshot",
			format: n,
			hash: t.workerHash,
			inputFiles: t.inputFiles
		}, "cmd:loadpreamblesnapshot", [n])).result === "ok" && (this.loadedPreambleKey = e, this.activePreambleDependencies = new Set(t.projectDependencies.map((e) => e.path))), e;
	}
	async dependenciesMatch(e) {
		return (await Promise.all(e.map(async (e) => {
			let t = this.projectFiles.get(e.path);
			return t === void 0 ? null : w(t);
		}))).every((t, n) => t === e[n].sha256);
	}
	persistPreambleSnapshot(e, t, n, r) {
		let i = this.preambleCache;
		if (!i) return;
		let a = [...new Set(r.map(o).filter((e) => !!e && this.projectFiles.has(e)))].sort();
		this.activePreambleDependencies = new Set(a);
		let s = Promise.all(a.map(async (e) => ({
			path: e,
			sha256: await w(this.projectFiles.get(e))
		}))).then((a) => i.save({
			key: e,
			workerHash: n,
			format: t,
			inputFiles: r,
			projectDependencies: a
		})).then(() => {
			this.loadedPreambleKey = e, this.attemptedPreambleKey = e;
		}).catch(() => {}).finally(() => {
			this.preamblePersistInFlight === s && (this.preamblePersistInFlight = null);
		});
		this.preamblePersistInFlight = s;
	}
	getCompletionObservation() {
		return this.completionObservation ? structuredClone(this.completionObservation) : null;
	}
	async buildCheckpoint(e) {
		this.checkInitialized();
		let t = await this.postMessageWithResponse({
			cmd: "buildcheckpoint",
			headText: e
		}, "cmd:buildcheckpoint");
		if (t.result !== "ok" || !t.fmt) {
			let e = (t.log || "").split("\n").slice(-3).join(" ");
			throw Error(`buildCheckpoint failed (status ${t.status}): ${e}`);
		}
		return {
			fmt: new Uint8Array(t.fmt),
			headPdf: t.headPdf ? new Uint8Array(t.headPdf) : null
		};
	}
	async compileFromCheckpoint(e, t) {
		this.checkInitialized();
		let n = e.slice().buffer, r = await this.postMessageWithResponse({
			cmd: "compilefromcheckpoint",
			fmt: n,
			tailText: t
		}, "cmd:compilefromcheckpoint", [n]);
		return {
			pdf: r.pdf ? new Uint8Array(r.pdf) : null,
			synctex: r.synctex ? new Uint8Array(r.synctex) : null,
			status: r.status ?? -1,
			log: r.log || ""
		};
	}
	async readFile(e) {
		this.checkInitialized();
		let t = await this.postMessageWithResponse({
			cmd: "readfile",
			url: e
		}, "cmd:readfile");
		return t.result === "ok" ? t.data ?? null : null;
	}
	isReady() {
		return this.status === "ready";
	}
	checkReady() {
		if (this.status !== "ready") throw Error(`Engine not ready (status: ${this.status})`);
	}
	checkInitialized() {
		if (!this.worker || this.status === "unloaded" || this.status === "loading") throw Error(`Engine not initialized (status: ${this.status})`);
	}
};
async function P(e, t) {
	if (!t) return e;
	t.throwIfAborted();
	let n, r = new Promise((e, r) => {
		n = () => r(t.reason), t.addEventListener("abort", n, { once: !0 });
	});
	try {
		return await Promise.race([e, r]);
	} finally {
		t.removeEventListener("abort", n);
	}
}
//#endregion
export { N as WasmTexPdftexEngine, j as mergeWarmupCaches };
