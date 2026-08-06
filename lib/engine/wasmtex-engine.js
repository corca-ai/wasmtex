import { parseEngineCompletionObservation as e } from "./completion-snapshot.js";
import { PersistentCache as t, isIndexedDbSupported as n } from "./persistent-cache.js";
import { BaseWorkerEngine as r, resolveTexliveUrl as i } from "./base-worker-engine.js";
import { engineFormatUrl as a, engineWorkerUrl as o } from "./engine-assets.js";
import { createEngineWorker as s } from "./worker-host.js";
import { buildDiagnostics as c, parseGlyphGaps as l, parseTexErrors as u } from "./parse-errors.js";
import { buildDependencyGraph as d } from "./dependency-graph.js";
import { readResponseWithProgress as f } from "./fetch-gz.js";
import { enrichGlyphSuggestions as p } from "./glyph-suggestions.js";
import { persistIfNeeded as m } from "./persist-watermark.js";
import { normalizeProjectDependencyPath as h } from "./dependency-manifest.js";
import { PreambleSnapshotCache as g, durablePreambleKey as _, preambleSha256 as v } from "./preamble-cache.js";
import { extractPreamble as y } from "./preamble-utils.js";
//#region src/engine/wasmtex-engine.ts
var b = 1;
function x(e, t) {
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
function S(e, t) {
	if (!Array.isArray(t.inputFiles)) {
		e.inputFilesComplete = !1;
		return;
	}
	let n = t.inputFiles.filter((e) => typeof e == "string");
	e.inputFiles = n, e.inputFilesComplete = t.inputFilesComplete === !0 && n.length === t.inputFiles.length;
}
function C(e, t) {
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
var w = class extends r {
	formatPath;
	skipFormatPreload;
	version;
	warmupCache;
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
	onFileDownload;
	constructor(e) {
		let t = e?.assetBaseUrl ?? "/", r = e?.texliveVersion ?? "2025", s = e?.engineBinary ?? "pdftex";
		super(o(t, r, s), e?.texliveUrl ?? null), this.formatPath = a(t, r, s), this.skipFormatPreload = !!e?.skipFormatPreload, this.version = r, this.warmupCache = e?.warmupCache, this.preambleSnapshotEnabled = !e?.disablePreambleSnapshot, this.persistentCacheEnabled = !!e?.persistentCache && n(), this.assetBaseUrl = t, this.effectiveTexliveUrl = i(e?.texliveUrl ?? null, r), this.preambleMirrorRevision = e?.preambleCacheIdentity?.mirrorRevision ?? null, e?.persistentPreambleCache && this.preambleMirrorRevision && (n() || e.preambleCacheStore) && (this.preambleCache = new g(e.preambleCacheStore ? { store: e.preambleCacheStore } : {}));
	}
	async init() {
		if (this.worker) throw Error("Engine already initialized");
		this.status = "loading", await new Promise((e, t) => {
			this.worker = s(this.enginePath), this.worker.onmessage = (n) => {
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
		let t = [this.preloadTexliveFile(11, "pdftex.map", `${i(this.texliveUrl, this.version)}pdftex/11/pdftex.map`)];
		this.skipFormatPreload || t.push(this.preloadFormat());
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
			if (e.cmd === "downloading" && e.file) {
				this.persist.downloadCount++, this.onFileDownload?.(e.file);
				return;
			}
			this.deliverResponse(`cmd:${e.cmd}`, e);
		}
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
			let i = await r.arrayBuffer(), a = `msg-${b++}`;
			await this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: e,
				filename: t,
				data: i,
				msgId: a
			}, a, [i]);
		} catch {}
	}
	async injectWarmupCache(e) {
		let t = [];
		for (let n of e.files) {
			let e = `msg-${b++}`, r = n.data.slice(0);
			t.push(this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: n.format,
				filename: n.filename,
				data: r,
				msgId: e
			}, e, [r]));
		}
		if (e.notFound.length > 0) {
			let n = `msg-${b++}`, r = this.postMessageWithResponse({
				cmd: "preload404",
				entries: e.notFound,
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
			return t.ok ? (await f(t, this.onProgress)).buffer : null;
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
				t && (e = e ? C(t, e) : t, this.persist.lastPersisted = 0);
			} catch {}
		}
		return e?.bloomFilter && (this.bloomFilter = e.bloomFilter), e;
	}
	async dumpTexliveCache() {
		this.checkInitialized();
		let e = `msg-${b++}`, t = await this.postMessageWithResponse({
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
		this.durableCache && m(this.persist, () => this.persistTexliveCache());
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
		let n = performance.now(), r = await this.postMessageWithResponse({ cmd: "compilelatex" }, "cmd:compile");
		this.completionObservation = Array.isArray(r.completionObservations) ? e(r.completionObservations) : null, this.status = "ready";
		let i = performance.now() - n, a = r.log || "", o = r.result === "ok" && (r.status === 0 || r.status === 1), s = r.pdf ? new Uint8Array(r.pdf) : null, f = r.synctex ? new Uint8Array(r.synctex) : null, m = o && r.format ? new Uint8Array(r.format) : void 0, h = u(a), g = !!r.preambleSnapshot, _ = !!r.preambleRebuilt, v = {
			success: o,
			pdf: s,
			log: a,
			errors: h,
			compileTime: i,
			synctex: f,
			format: m,
			preambleSnapshot: g,
			preambleRebuilt: _
		}, y = this.validPhaseTimings(r.phaseTimings);
		y && (v.phaseTimings = y), x(v, r), S(v, r), r.semanticTrace && (v.semanticTrace = r.semanticTrace);
		let b = l(a);
		return b.length > 0 && (p(b), v.glyphCoverage = { gaps: b }), v.telemetry = {
			diagnostics: c(a, b),
			dependencies: d(a, {
				inputFiles: v.inputFiles,
				source: this.sources.get(this.mainFileName)
			})
		}, o && this.maybePersistCache(), o && _ && t && r.preambleFormat && r.preambleHash && r.preambleInputFiles && this.persistPreambleSnapshot(t, r.preambleFormat, r.preambleHash, r.preambleInputFiles), v;
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
		let t = y(e);
		return t ? _({
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
			return t === void 0 ? null : v(t);
		}))).every((t, n) => t === e[n].sha256);
	}
	persistPreambleSnapshot(e, t, n, r) {
		let i = this.preambleCache;
		if (!i) return;
		let a = [...new Set(r.map(h).filter((e) => !!e && this.projectFiles.has(e)))].sort();
		this.activePreambleDependencies = new Set(a);
		let o = Promise.all(a.map(async (e) => ({
			path: e,
			sha256: await v(this.projectFiles.get(e))
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
export { w as WasmTexPdftexEngine, C as mergeWarmupCaches };
