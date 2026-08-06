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
//#region src/engine/wasmtex-engine.ts
var h = 1;
function g(e, t) {
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
function _(e, t) {
	if (!Array.isArray(t.inputFiles)) {
		e.inputFilesComplete = !1;
		return;
	}
	let n = t.inputFiles.filter((e) => typeof e == "string");
	e.inputFiles = n, e.inputFilesComplete = t.inputFilesComplete === !0 && n.length === t.inputFiles.length;
}
function v(e, t) {
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
var y = class extends r {
	formatPath;
	skipFormatPreload;
	version;
	warmupCache;
	preambleSnapshotEnabled;
	persistentCacheEnabled;
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
		let t = e?.assetBaseUrl ?? "/", r = e?.texliveVersion ?? "2025", i = e?.engineBinary ?? "pdftex";
		super(o(t, r, i), e?.texliveUrl ?? null), this.formatPath = a(t, r, i), this.skipFormatPreload = !!e?.skipFormatPreload, this.version = r, this.warmupCache = e?.warmupCache, this.preambleSnapshotEnabled = !e?.disablePreambleSnapshot, this.persistentCacheEnabled = !!e?.persistentCache && n();
	}
	async init() {
		if (this.worker) throw Error("Engine already initialized");
		this.status = "loading", await new Promise((e, t) => {
			this.worker = s(this.enginePath), this.worker.onmessage = (n) => {
				this.dispatchWorkerMessage(n.data, e, t);
			}, this.worker.onerror = (e) => {
				t(this.handleWorkerError(e));
			};
		});
		let e = i(this.texliveUrl, this.version);
		this.worker.postMessage({
			cmd: "settexliveurl",
			url: e
		}), this.preambleSnapshotEnabled || this.worker.postMessage({
			cmd: "setpreamblesnapshot",
			enabled: !1
		});
		let t = await this.resolveWarmupCache();
		t ? await this.injectWarmupCache(t) : await this.fetchAndSendBloomFilter();
		let n = [this.preloadTexliveFile(11, "pdftex.map", `${i(this.texliveUrl, this.version)}pdftex/11/pdftex.map`)];
		this.skipFormatPreload || n.push(this.preloadFormat()), await Promise.all(n);
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
			let i = await r.arrayBuffer(), a = `msg-${h++}`;
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
			let e = `msg-${h++}`, r = n.data.slice(0);
			t.push(this.postMessageWithResponse({
				cmd: "preloadtexlive",
				format: n.format,
				filename: n.filename,
				data: r,
				msgId: e
			}, e, [r]));
		}
		if (e.notFound.length > 0) {
			let n = `msg-${h++}`, r = this.postMessageWithResponse({
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
		this.checkInitialized(), typeof t == "string" && this.sources.set(e, t), await this.postMessageWithResponse({
			cmd: "writefile",
			url: e,
			src: t
		}, "cmd:writefile");
	}
	setMainFile(e) {
		this.checkInitialized(), this.mainFileName = e, this.worker.postMessage({
			cmd: "setmainfile",
			url: e
		});
	}
	setPreambleSnapshot(e) {
		this.checkInitialized(), this.preambleSnapshotEnabled = e, this.worker.postMessage({
			cmd: "setpreamblesnapshot",
			enabled: e
		});
	}
	isPreambleSnapshotEnabled() {
		return this.preambleSnapshotEnabled;
	}
	async flushCache() {
		this.checkInitialized(), this.worker.postMessage({ cmd: "flushcache" });
	}
	async resolveWarmupCache() {
		let e = this.warmupCache;
		if (this.persistentCacheEnabled) {
			this.durableCache = new t({ version: this.version });
			try {
				let t = await this.durableCache.load();
				t && (e = e ? v(t, e) : t, this.persist.lastPersisted = 0);
			} catch {}
		}
		return e?.bloomFilter && (this.bloomFilter = e.bloomFilter), e;
	}
	async dumpTexliveCache() {
		this.checkInitialized();
		let e = `msg-${h++}`, t = await this.postMessageWithResponse({
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
		await (this.durableCache ?? (n() ? new t({ version: this.version }) : null))?.clear();
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
		this.checkReady(), this.status = "compiling";
		let t = performance.now(), n = await this.postMessageWithResponse({ cmd: "compilelatex" }, "cmd:compile");
		this.completionObservation = Array.isArray(n.completionObservations) ? e(n.completionObservations) : null, this.status = "ready";
		let r = performance.now() - t, i = n.log || "", a = n.result === "ok" && (n.status === 0 || n.status === 1), o = n.pdf ? new Uint8Array(n.pdf) : null, s = n.synctex ? new Uint8Array(n.synctex) : null, f = a && n.format ? new Uint8Array(n.format) : void 0, m = {
			success: a,
			pdf: o,
			log: i,
			errors: u(i),
			compileTime: r,
			synctex: s,
			format: f,
			preambleSnapshot: !!n.preambleSnapshot,
			preambleRebuilt: !!n.preambleRebuilt
		};
		g(m, n), _(m, n), n.semanticTrace && (m.semanticTrace = n.semanticTrace);
		let h = l(i);
		return h.length > 0 && (p(h), m.glyphCoverage = { gaps: h }), m.telemetry = {
			diagnostics: c(i, h),
			dependencies: d(i, {
				inputFiles: m.inputFiles,
				source: this.sources.get(this.mainFileName)
			})
		}, a && this.maybePersistCache(), m;
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
export { y as WasmTexPdftexEngine, v as mergeWarmupCaches };
