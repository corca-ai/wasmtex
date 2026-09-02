import { parseEngineCompletionObservation as e } from "./completion-snapshot.js";
import { PersistentCache as t, isIndexedDbSupported as n } from "./persistent-cache.js";
import { BaseWorkerEngine as r, resolveTexliveUrl as i } from "./base-worker-engine.js";
import { engineFormatUrl as a, engineWorkerUrl as o } from "./engine-assets.js";
import { ResolverEvidenceCollector as s } from "./resolver-evidence.js";
import { createEngineWorker as c } from "./worker-host.js";
import { buildDiagnostics as l, parseGlyphGaps as u, parseTexErrors as d } from "./parse-errors.js";
import { buildDependencyGraph as f } from "./dependency-graph.js";
import { readResponseWithProgress as p } from "./fetch-gz.js";
import { enrichGlyphSuggestions as m } from "./glyph-suggestions.js";
import { persistIfNeeded as h } from "./persist-watermark.js";
import { normalizeProjectDependencyPath as g } from "./dependency-manifest.js";
import { PreambleSnapshotCache as _, durablePreambleKey as v, preambleSha256 as y } from "./preamble-cache.js";
import { extractPreamble as b } from "./preamble-utils.js";
//#region src/engine/wasmtex-engine.ts
var x = 1;
function S(e) {
	return e ? { resolver: e } : {};
}
function C(e, t) {
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
function w(e, t) {
	if (!Array.isArray(t.inputFiles)) {
		e.inputFilesComplete = !1;
		return;
	}
	let n = t.inputFiles.filter((e) => typeof e == "string");
	e.inputFiles = n, e.inputFilesComplete = t.inputFilesComplete === !0 && n.length === t.inputFiles.length;
}
function T(e, t) {
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
var E = class extends r {
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
	bloomFilter;
	mainFileName = "main.tex";
	sources = /* @__PURE__ */ new Map();
	completionObservation = null;
	persist = {
		downloadCount: 0,
		lastPersisted: -1,
		inFlight: !1
	};
	resolver;
	onFileDownload;
	constructor(e) {
		let t = e?.assetBaseUrl ?? "/", r = e?.texliveVersion ?? "2025", c = e?.engineBinary ?? "pdftex";
		super(o(t, r, c), e?.texliveUrl ?? null), this.formatPath = a(t, r, c), this.skipFormatPreload = !!e?.skipFormatPreload, this.version = r, this.warmupCache = e?.warmupCache, this.preambleSnapshotEnabled = !e?.disablePreambleSnapshot, this.persistentCacheEnabled = !!e?.persistentCache && n(), this.assetBaseUrl = t, this.effectiveTexliveUrl = i(e?.texliveUrl ?? null, r), this.preambleMirrorRevision = e?.preambleCacheIdentity?.mirrorRevision ?? null, this.resolver = new s("pdftex", e?.resolverProfile ?? {
			id: `texlive-${r}`,
			texliveYear: r,
			mirrorRevision: this.preambleMirrorRevision
		}), e?.persistentPreambleCache && this.preambleMirrorRevision && (n() || e.preambleCacheStore) && (this.preambleCache = new _(e.preambleCacheStore ? { store: e.preambleCacheStore } : {}));
	}
	async init() {
		if (this.worker) throw Error("Engine already initialized");
		this.status = "loading", await new Promise((e, t) => {
			this.worker = c(this.enginePath), this.worker.onmessage = (n) => {
				this.dispatchWorkerMessage(n.data, e, t);
			}, this.worker.onerror = (e) => {
				t(this.handleWorkerError(e));
			};
		}), this.worker.postMessage({
			cmd: "settexliveurl",
			url: this.effectiveTexliveUrl
		}), this.preambleSnapshotEnabled || this.worker.postMessage({
			cmd: "setpreamblesnapshot",
			enabled: !1
		});
		let e = await this.resolveWarmupCache();
		e ? await this.injectWarmupCache(e) : await this.fetchAndSendBloomFilter();
		let t = [];
		this.warmupPositiveSources.has("11/pdftex.map") || t.push(this.preloadTexliveFile(11, "pdftex.map", `${i(this.texliveUrl, this.version)}pdftex/11/pdftex.map`)), this.skipFormatPreload || t.push(this.preloadFormat());
		let n = this.preambleCache ? this.loadEngineBuildId() : Promise.resolve();
		await Promise.all([...t, n]);
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
			e.result === "ok" ? (this.status = "ready", t()) : (this.status = "error", n(/* @__PURE__ */ Error("Engine failed to initialize")));
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
	async preloadFormat() {
		try {
			let e = await this.fetchGzWithProgress(this.formatPath);
			if (!e) return;
			await this.postMessageWithResponse({
				cmd: "loadformat",
				data: e
			}, "cmd:loadformat", [e]);
		} catch {}
	}
	async preloadTexliveFile(e, t, n) {
		try {
			let r = await fetch(n);
			if (!r.ok) return;
			let i = await r.arrayBuffer(), a = `msg-${x++}`;
			await this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: e,
				filename: t,
				data: i,
				source: "warmup-cache",
				msgId: a
			}, a, [i]);
		} catch {}
	}
	async injectWarmupCache(e) {
		let t = [];
		for (let n of e.files) {
			let e = `msg-${x++}`, r = n.data.slice(0);
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
			let n = `msg-${x++}`, r = this.postMessageWithResponse({
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
	async fetchAndSendBloomFilter() {
		try {
			let e = `${i(this.texliveUrl, this.version)}bloom-filter.bin`, t = await fetch(e);
			if (!t.ok) return;
			let n = await t.arrayBuffer();
			this.persistentCacheEnabled && (this.bloomFilter = n.slice(0)), this.worker.postMessage({
				cmd: "loadbloom",
				data: n
			}, [n]);
		} catch {}
	}
	async fetchGzWithProgress(e) {
		try {
			let t = await fetch(e);
			return t.ok ? (await p(t, this.onProgress)).buffer : null;
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
			this.durableCache = new t({ version: this.version });
			try {
				let t = await this.durableCache.load();
				t && (e = e ? T(t, e) : t, this.persist.lastPersisted = 0);
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
		let e = `msg-${x++}`, t = await this.postMessageWithResponse({
			cmd: "dumpcache",
			msgId: e
		}, e), n = {
			files: t.files ?? [],
			notFound: t.notFound ?? []
		};
		return this.bloomFilter && (n.bloomFilter = this.bloomFilter), n;
	}
	async persistTexliveCache() {
		if (!this.durableCache) return;
		let e = await this.dumpTexliveCache();
		await this.durableCache.save(e);
	}
	getDownloadCount() {
		return this.persist.downloadCount;
	}
	async clearCache() {
		let e = this.durableCache ?? (n() ? new t({ version: this.version }) : null);
		await Promise.all([e?.clear(), this.preambleCache?.clear()]);
	}
	maybePersistCache() {
		this.durableCache && h(this.persist, () => this.persistTexliveCache());
	}
	async buildFormat() {
		this.checkReady(), this.status = "compiling";
		let e = await this.postMessageWithResponse({ cmd: "compileformat" }, "cmd:compile");
		if (this.status = "ready", e.result !== "ok" || e.status !== 0 || !e.pdf) throw Error(`Failed to build pdflatex format:\n${e.log || "unknown engine error"}`);
		return new Uint8Array(e.pdf);
	}
	async compile() {
		this.checkReady();
		let t = this.preambleCache ? await this.restorePersistentPreamble() : null;
		this.status = "compiling";
		let n = performance.now();
		this.resolver.begin();
		let r = await this.postMessageWithResponse({ cmd: "compilelatex" }, "cmd:compile"), i = this.resolver.finish();
		this.completionObservation = Array.isArray(r.completionObservations) ? e(r.completionObservations) : null, this.status = "ready";
		let a = performance.now() - n, o = r.log || "", s = r.result === "ok" && (r.status === 0 || r.status === 1), c = r.pdf ? new Uint8Array(r.pdf) : null, p = r.synctex ? new Uint8Array(r.synctex) : null, h = s && r.format ? new Uint8Array(r.format) : void 0, g = d(o), _ = !!r.preambleSnapshot, v = !!r.preambleRebuilt, y = {
			success: s,
			pdf: c,
			log: o,
			errors: g,
			compileTime: a,
			synctex: p,
			format: h,
			preambleSnapshot: _,
			preambleRebuilt: v
		}, b = this.validPhaseTimings(r.phaseTimings);
		b && (y.phaseTimings = b), C(y, r), w(y, r), r.semanticTrace && (y.semanticTrace = r.semanticTrace);
		let x = u(o);
		return x.length > 0 && (m(x), y.glyphCoverage = { gaps: x }), y.telemetry = {
			diagnostics: l(o, x),
			...S(i),
			dependencies: f(o, {
				inputFiles: y.inputFiles,
				source: this.sources.get(this.mainFileName)
			})
		}, s && this.maybePersistCache(), s && v && t && r.preambleFormat && r.preambleHash && r.preambleInputFiles && this.persistPreambleSnapshot(t, r.preambleFormat, r.preambleHash, r.preambleInputFiles), y;
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
			texRunMs: f
		};
	}
	async currentPreambleKey() {
		if (!this.preambleCache || !this.engineBuildId || !this.preambleMirrorRevision) return null;
		let e = this.sources.get(this.mainFileName);
		if (!e) return null;
		let t = b(e);
		return t ? v({
			engineBuildId: this.engineBuildId,
			mirrorRevision: this.preambleMirrorRevision,
			texliveUrl: this.effectiveTexliveUrl,
			texliveYear: this.version
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
			return t === void 0 ? null : y(t);
		}))).every((t, n) => t === e[n].sha256);
	}
	persistPreambleSnapshot(e, t, n, r) {
		let i = this.preambleCache;
		if (!i) return;
		let a = [...new Set(r.map(g).filter((e) => !!e && this.projectFiles.has(e)))].sort();
		this.activePreambleDependencies = new Set(a);
		let o = Promise.all(a.map(async (e) => ({
			path: e,
			sha256: await y(this.projectFiles.get(e))
		}))).then((a) => i.save({
			key: e,
			workerHash: n,
			format: t,
			inputFiles: r,
			projectDependencies: a
		})).then(() => {
			this.loadedPreambleKey = e, this.attemptedPreambleKey = e;
		}).catch(() => {}).finally(() => {
			this.preamblePersistInFlight === o && (this.preamblePersistInFlight = null);
		});
		this.preamblePersistInFlight = o;
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
//#endregion
export { E as WasmTexPdftexEngine, T as mergeWarmupCaches };
