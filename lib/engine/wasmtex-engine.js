import { BaseWorkerEngine as b, resolveTexliveUrl as p } from "./base-worker-engine.js";
import { buildDependencyGraph as y } from "./dependency-graph.js";
import { engineWorkerUrl as k, engineFormatUrl as F } from "./engine-assets.js";
import { readResponseWithProgress as C } from "./fetch-gz.js";
import { enrichGlyphSuggestions as x } from "./glyph-suggestions.js";
import { parseTexErrors as v, parseGlyphGaps as P, buildDiagnostics as W } from "./parse-errors.js";
import { persistIfNeeded as E } from "./persist-watermark.js";
import { isIndexedDbSupported as u, PersistentCache as f } from "./persistent-cache.js";
import { createEngineWorker as M } from "./worker-host.js";
let m = 1;
function R(c, e) {
  const t = /* @__PURE__ */ new Map();
  for (const r of c.files) t.set(`${r.format}/${r.filename}`, r);
  for (const r of e.files) t.set(`${r.format}/${r.filename}`, r);
  const s = new Set(e.notFound.map((r) => `${r.format}/${r.filename}`)), i = /* @__PURE__ */ new Set(), a = [];
  for (const r of [...c.notFound, ...e.notFound]) {
    const l = `${r.format}/${r.filename}`;
    if (!i.has(l)) {
      if (t.has(l))
        if (s.has(l)) t.delete(l);
        else continue;
      i.add(l), a.push(r);
    }
  }
  const o = { files: [...t.values()], notFound: a }, h = e.bloomFilter ?? c.bloomFilter;
  return h && (o.bloomFilter = h), o;
}
class D extends b {
  formatPath;
  skipFormatPreload;
  version;
  warmupCache;
  preambleSnapshotEnabled;
  persistentCacheEnabled;
  durableCache = null;
  bloomFilter;
  /** Main file name, tracked for source-based dependency extraction. */
  mainFileName = "main.tex";
  /** Last-written text sources, so dependency extraction can read the main source
   *  synchronously (no worker round-trip). */
  sources = /* @__PURE__ */ new Map();
  /** Download/persist watermark (drives auto-persist; single-flight guarded). */
  persist = { downloadCount: 0, lastPersisted: -1, inFlight: !1 };
  onFileDownload;
  constructor(e) {
    const t = e?.assetBaseUrl ?? "/", s = e?.texliveVersion ?? "2025", i = e?.engineBinary ?? "pdftex";
    super(k(t, s, i), e?.texliveUrl ?? null), this.formatPath = F(t, s, i), this.skipFormatPreload = !!e?.skipFormatPreload, this.version = s, this.warmupCache = e?.warmupCache, this.preambleSnapshotEnabled = !e?.disablePreambleSnapshot, this.persistentCacheEnabled = !!e?.persistentCache && u();
  }
  async init() {
    if (this.worker)
      throw new Error("Engine already initialized");
    this.status = "loading", await new Promise((i, a) => {
      this.worker = M(this.enginePath), this.worker.onmessage = (o) => {
        this.dispatchWorkerMessage(o.data, i, a);
      }, this.worker.onerror = (o) => {
        a(this.handleWorkerError(o));
      };
    });
    const e = p(this.texliveUrl, this.version);
    this.worker.postMessage({ cmd: "settexliveurl", url: e }), this.preambleSnapshotEnabled || this.worker.postMessage({ cmd: "setpreamblesnapshot", enabled: !1 });
    const t = await this.resolveWarmupCache();
    t ? await this.injectWarmupCache(t) : await this.fetchAndSendBloomFilter();
    const s = [
      this.preloadTexliveFile(
        11,
        "pdftex.map",
        `${p(this.texliveUrl, this.version)}pdftex/11/pdftex.map`
      )
    ];
    this.skipFormatPreload || s.push(this.preloadFormat()), await Promise.all(s);
  }
  /**
   * Dispatch a worker message to the appropriate handler.
   * Separated from init() to reduce cognitive complexity.
   */
  dispatchWorkerMessage(e, t, s) {
    if (!e.cmd && !e.msgId) {
      e.result === "ok" ? (this.status = "ready", t()) : (this.status = "error", s(new Error("Engine failed to initialize")));
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
      const e = await this.fetchGzWithProgress(this.formatPath);
      if (!e) return;
      await this.postMessageWithResponse({ cmd: "loadformat", data: e }, "cmd:loadformat", [e]);
    } catch {
    }
  }
  /** Pre-load a texlive file into the worker's MEMFS cache. */
  async preloadTexliveFile(e, t, s) {
    try {
      const i = await fetch(s);
      if (!i.ok) return;
      const a = await i.arrayBuffer(), o = `msg-${m++}`;
      await this.postMessageWithResponse(
        { cmd: "preloadtexlive", format: e, filename: t, data: a, msgId: o },
        o,
        [a]
      );
    } catch {
    }
  }
  /** Inject pre-fetched warmup cache into the worker. */
  async injectWarmupCache(e) {
    const t = [];
    for (const s of e.files) {
      const i = `msg-${m++}`, a = s.data.slice(0);
      t.push(
        this.postMessageWithResponse(
          { cmd: "preloadtexlive", format: s.format, filename: s.filename, data: a, msgId: i },
          i,
          [a]
        )
      );
    }
    if (e.notFound.length > 0) {
      const s = `msg-${m++}`, i = this.postMessageWithResponse(
        { cmd: "preload404", entries: e.notFound, msgId: s },
        s
      ), a = new Promise(
        (o) => setTimeout(() => {
          this.pendingResponses.delete(s), o();
        }, 2e3)
      );
      t.push(Promise.race([i, a]));
    }
    if (e.bloomFilter) {
      const s = e.bloomFilter.slice(0);
      this.worker.postMessage({ cmd: "loadbloom", data: s }, [s]);
    }
    await Promise.all(t);
  }
  /** Fetch bloom filter from CDN and send it to the worker. */
  async fetchAndSendBloomFilter() {
    try {
      const e = `${p(this.texliveUrl, this.version)}bloom-filter.bin`, t = await fetch(e);
      if (!t.ok) return;
      const s = await t.arrayBuffer();
      this.persistentCacheEnabled && (this.bloomFilter = s.slice(0)), this.worker.postMessage({ cmd: "loadbloom", data: s }, [s]);
    } catch {
    }
  }
  /**
   * Fetch a URL with optional download-progress tracking for the .fmt preload.
   */
  async fetchGzWithProgress(e) {
    try {
      const t = await fetch(e);
      return t.ok ? (await C(t, this.onProgress)).buffer : null;
    } catch {
      return null;
    }
  }
  async mkdir(e) {
    this.checkInitialized(), await this.postMessageWithResponse({ cmd: "mkdir", url: e }, "cmd:mkdir");
  }
  async writeFile(e, t) {
    this.checkInitialized(), typeof t == "string" && this.sources.set(e, t), await this.postMessageWithResponse(
      { cmd: "writefile", url: e, src: t },
      "cmd:writefile"
    );
  }
  setMainFile(e) {
    this.checkInitialized(), this.mainFileName = e, this.worker.postMessage({ cmd: "setmainfile", url: e });
  }
  /**
   * Enable or disable precompiled preamble snapshots at runtime.
   * When disabled, every compile re-runs the full preamble (no `.fmt` reuse).
   */
  setPreambleSnapshot(e) {
    this.checkInitialized(), this.preambleSnapshotEnabled = e, this.worker.postMessage({ cmd: "setpreamblesnapshot", enabled: e });
  }
  /** Whether preamble snapshots are currently enabled. */
  isPreambleSnapshotEnabled() {
    return this.preambleSnapshotEnabled;
  }
  async flushCache() {
    this.checkInitialized(), this.worker.postMessage({ cmd: "flushcache" });
  }
  /**
   * Resolve the warmup set used to seed the worker: the durable cache (if
   * enabled) rehydrated from a previous session, merged with any caller-provided
   * `warmupCache`.
   */
  async resolveWarmupCache() {
    let e = this.warmupCache;
    if (this.persistentCacheEnabled) {
      this.durableCache = new f({ version: this.version });
      try {
        const t = await this.durableCache.load();
        t && (e = e ? R(t, e) : t, this.persist.lastPersisted = 0);
      } catch {
      }
    }
    return e?.bloomFilter && (this.bloomFilter = e.bloomFilter), e;
  }
  /**
   * Export the worker's in-memory TeX Live cache: every file fetched or
   * preloaded this session (by `format/name`) plus the accumulated 404 set.
   */
  async dumpTexliveCache() {
    this.checkInitialized();
    const e = `msg-${m++}`, t = await this.postMessageWithResponse({ cmd: "dumpcache", msgId: e }, e), s = { files: t.files ?? [], notFound: t.notFound ?? [] };
    return this.bloomFilter && (s.bloomFilter = this.bloomFilter), s;
  }
  /** Persist the worker's current TeX Live cache to the durable store (if enabled). */
  async persistTexliveCache() {
    if (!this.durableCache) return;
    const e = await this.dumpTexliveCache();
    await this.durableCache.save(e);
  }
  /** Number of files the worker has reported downloading on demand this session. */
  getDownloadCount() {
    return this.persist.downloadCount;
  }
  /** Clear the durable TeX Live cache for this version. */
  async clearCache() {
    await (this.durableCache ?? (u() ? new f({ version: this.version }) : null))?.clear();
  }
  maybePersistCache() {
    this.durableCache && E(this.persist, () => this.persistTexliveCache());
  }
  /** Build and return the base pdflatex format with this exact engine binary.
   *  Release tooling uses this instead of depending on an application-side event
   *  or reaching into the worker protocol directly. */
  async buildFormat() {
    this.checkReady(), this.status = "compiling";
    const e = await this.postMessageWithResponse({ cmd: "compileformat" }, "cmd:compile");
    if (this.status = "ready", e.result !== "ok" || e.status !== 0 || !e.pdf)
      throw new Error(`Failed to build pdflatex format:
${e.log || "unknown engine error"}`);
    return new Uint8Array(e.pdf);
  }
  async compile() {
    this.checkReady(), this.status = "compiling";
    const e = performance.now(), t = await this.postMessageWithResponse({ cmd: "compilelatex" }, "cmd:compile");
    this.status = "ready";
    const s = performance.now() - e, i = t.log || "", a = t.result === "ok" && (t.status === 0 || t.status === 1), o = t.pdf ? new Uint8Array(t.pdf) : null, h = t.synctex ? new Uint8Array(t.synctex) : null, r = a && t.format ? new Uint8Array(t.format) : void 0, l = v(i), w = !!t.preambleSnapshot, g = !!t.preambleRebuilt, n = {
      success: a,
      pdf: o,
      log: i,
      errors: l,
      compileTime: s,
      synctex: h,
      format: r,
      preambleSnapshot: w,
      preambleRebuilt: g
    };
    t.engineCommands && (n.engineCommands = t.engineCommands), t.inputFiles && (n.inputFiles = t.inputFiles), n.inputFilesComplete = t.inputFilesComplete === !0, t.semanticTrace && (n.semanticTrace = t.semanticTrace);
    const d = P(i);
    return d.length > 0 && (x(d), n.glyphCoverage = { gaps: d }), n.telemetry = {
      diagnostics: W(i, d),
      dependencies: y(i, {
        inputFiles: n.inputFiles,
        source: this.sources.get(this.mainFileName)
      })
    }, a && this.maybePersistCache(), n;
  }
  /**
   * Build a mid-document checkpoint (#55): run `headText + \dump` in INITEX to capture
   * the engine state at a page boundary as a bootable format, plus the head PDF (pages
   * up to the boundary). `headText` MUST end at an existing page break (\clearpage etc.)
   * and a full compile must have run first (seeds the labels via main.aux).
   */
  async buildCheckpoint(e) {
    this.checkInitialized();
    const t = await this.postMessageWithResponse(
      { cmd: "buildcheckpoint", headText: e },
      "cmd:buildcheckpoint"
    );
    if (t.result !== "ok" || !t.fmt) {
      const s = (t.log || "").split(`
`).slice(-3).join(" ");
      throw new Error(`buildCheckpoint failed (status ${t.status}): ${s}`);
    }
    return {
      fmt: new Uint8Array(t.fmt),
      headPdf: t.headPdf ? new Uint8Array(t.headPdf) : null
    };
  }
  /**
   * Boot a checkpoint format and typeset only the tail (#55). Returns the tail PDF
   * (the host splices it after the checkpoint's head PDF). The `fmt` buffer is copied
   * before transfer so the caller can reuse it across many edits.
   */
  async compileFromCheckpoint(e, t) {
    this.checkInitialized();
    const s = e.slice().buffer, i = await this.postMessageWithResponse(
      { cmd: "compilefromcheckpoint", fmt: s, tailText: t },
      "cmd:compilefromcheckpoint",
      [s]
    );
    return {
      pdf: i.pdf ? new Uint8Array(i.pdf) : null,
      synctex: i.synctex ? new Uint8Array(i.synctex) : null,
      status: i.status ?? -1,
      log: i.log || ""
    };
  }
  async readFile(e) {
    this.checkInitialized();
    const t = await this.postMessageWithResponse({ cmd: "readfile", url: e }, "cmd:readfile");
    return t.result === "ok" ? t.data ?? null : null;
  }
  isReady() {
    return this.status === "ready";
  }
  /** Guard for compile() — must be 'ready' (not already compiling) */
  checkReady() {
    if (this.status !== "ready")
      throw new Error(`Engine not ready (status: ${this.status})`);
  }
  /** Guard for writeFile/mkdir/setMainFile — worker must exist (ready or compiling) */
  checkInitialized() {
    if (!this.worker || this.status === "unloaded" || this.status === "loading")
      throw new Error(`Engine not initialized (status: ${this.status})`);
  }
}
export {
  D as WasmTexPdftexEngine,
  R as mergeWarmupCaches
};
