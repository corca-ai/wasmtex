import { buildDependencyGraph as d } from "./dependency-graph.js";
import { engineWorkerUrl as p, engineFormatUrl as y } from "./engine-assets.js";
import { readResponseWithProgress as h } from "./fetch-gz.js";
import { enrichGlyphSuggestions as w } from "./glyph-suggestions.js";
import { parseGlyphGaps as b, buildDiagnostics as F, parseTexErrors as g } from "./parse-errors.js";
import { persistIfNeeded as x } from "./persist-watermark.js";
import { isIndexedDbSupported as B, PersistentCache as C } from "./persistent-cache.js";
import { mergeWarmupCaches as P } from "./wasmtex-engine.js";
import { CompileWorkerDriver as k } from "./wasmtex-worker.js";
function I(n, t) {
  const e = t.assetBaseUrl ?? "/", r = t.texliveVersion ?? "2025", i = t.texliveUrl ?? null;
  return new k(p(e, r, n), i, r);
}
function $(n, t) {
  const e = t.assetBaseUrl ?? "/", r = t.texliveVersion ?? "2025";
  return y(e, r, n);
}
class z {
  tex;
  /** Filename under which the built format is re-injected for `compilelatex`
   *  (e.g. `wasmtex-xetex.fmt`, `wasmtex-luatex.fmt`). */
  fmtFile;
  mainBase = "main";
  /** Last-written text sources, kept so dependency extraction can read the main
   *  source synchronously (no worker round-trip). */
  sources = /* @__PURE__ */ new Map();
  /** Built LaTeX format dump, cached after the first `compileformat` (or
   *  preloaded from a shipped `.fmt` asset, skipping `compileformat` entirely). */
  fmtBytes = null;
  /** Whether {@link fmtBytes} is currently written into the worker's work dir.
   *  Reset by {@link clearInjectedFormat} when flushCache wipes the dir. */
  fmtInjected = !1;
  /** URL of a prebuilt format to preload at init, if any. */
  formatUrl;
  /** Built-in warmup plan (bloom filter + parallel prefetch), if any. */
  warmup;
  /** The warmup/durable set resolved at init, retained so an auxiliary worker (e.g. xetex's
   *  dvipdfmx) can be rehydrated from it after *its* own init completes. */
  lastWarmSet = null;
  /** Durable IndexedDB cache of fetched assets (when persistentCache is on). */
  durableCache = null;
  /** Bloom-filter bytes retained so the durable cache can store them too. */
  bloomBytes = null;
  /** Files the worker has reported fetching this session; drives auto-persist (shape matches
   *  PersistState; inferred so this engine and WasmTexPdftexEngine don't share an import block). */
  persist = { downloadCount: 0, lastPersisted: -1, inFlight: !1 };
  onProgress;
  onFileDownload;
  constructor(t, e, r, i, s) {
    this.tex = t, this.fmtFile = e, this.formatUrl = r, this.warmup = i, s && B() && (this.durableCache = new C({ version: s.version }));
  }
  /** Wire callbacks, boot the worker, and — overlapping that boot — fetch the
   *  prebuilt format and warmup assets; then inject the warmup set once the
   *  worker is ready. A populated durable cache (a prior session) is preferred
   *  over a CDN prefetch, so return visits do ~zero network. */
  async initTex() {
    this.tex.onFileDownload = (s) => {
      this.persist.downloadCount++, this.onFileDownload?.(s);
    };
    const t = this.preloadFormat(), e = this.tex.init(), r = await this.loadDurable(), i = r && r.files.length > 0 ? this.durableToAssets(r) : await this.fetchWarmupAssets();
    await e, await t, this.lastWarmSet = i, this.injectWarmupAssets(this.tex, i);
  }
  /** Count a file fetched by an auxiliary worker (e.g. xetex's dvipdfmx) toward the
   *  auto-persist watermark, so a compile whose only new fetches came from that worker still
   *  persists instead of being skipped by maybePersist's "nothing new" guard. */
  bumpDownloadCount() {
    this.persist.downloadCount++;
  }
  /** Auxiliary workers whose TeX Live caches must be persisted/rehydrated alongside the
   *  primary {@link tex} worker. Base: none. XeLaTeX overrides this with its dvipdfmx worker,
   *  which fetches and embeds fonts the primary XeTeX worker never caches. */
  extraCacheDrivers() {
    return [];
  }
  /** Rehydrate an auxiliary worker from the durable/warmup set resolved at init. Call only
   *  AFTER that worker's own init() so its preload queue is live — preloads are fire-and-forget
   *  and a not-yet-ready worker silently drops them. */
  rehydrateExtraDriver(t) {
    this.lastWarmSet && this.injectWarmupAssets(t, this.lastWarmSet);
  }
  /** Load the durable cache (if enabled) from a prior session. The durable set is
   *  already on disk, so don't re-persist until new files are fetched. */
  async loadDurable() {
    if (!this.durableCache) return null;
    try {
      const t = await this.durableCache.load();
      return t && (this.persist.lastPersisted = 0), t;
    } catch {
      return null;
    }
  }
  durableToAssets(t) {
    return t.bloomFilter && (this.bloomBytes = t.bloomFilter), {
      bloom: t.bloomFilter ?? null,
      files: t.files.map((e) => ({ format: e.format, filename: e.filename, data: e.data })),
      notFound: t.notFound
    };
  }
  /** Fetch a prebuilt format asset into {@link fmtBytes} so the first compile
   *  skips the expensive per-session `compileformat`. Prefers a gzipped
   *  `<fmt>.gz` (format files are large and compress ~5×), decompressing in the
   *  browser; falls back to the plain `.fmt`. Best-effort: a missing or failed
   *  fetch leaves `fmtBytes` null and {@link ensureFormat} builds it. */
  async preloadFormat() {
    if (!this.formatUrl || this.fmtBytes) return;
    const t = await this.tryPreloadGzFormat();
    if (t) {
      this.fmtBytes = t;
      return;
    }
    try {
      const e = await fetch(this.formatUrl);
      if (!e.ok) return;
      const r = await h(e, this.onProgress);
      this.looksLikeFormat(r) && (this.fmtBytes = r);
    } catch {
    }
  }
  /** Fetch & decompress the gzipped `<fmt>.gz` variant, or null to fall back to the plain
   *  `.fmt`. Only attempted when DecompressionStream exists: without it, a server serving
   *  `.gz` raw would leave the bytes gzip-compressed, and looksLikeFormat (length + non-'<'
   *  first byte) would wrongly accept the gzip-magic blob — booting the engine from garbage
   *  and suppressing the plain-.fmt fallback. Mirrors fetchGzWithFallback's gate. */
  async tryPreloadGzFormat() {
    if (!this.formatUrl || typeof DecompressionStream > "u") return null;
    try {
      const t = await fetch(`${this.formatUrl}.gz`);
      if (!t.ok) return null;
      let e = await h(t, this.onProgress);
      if (e[0] === 31 && e[1] === 139) {
        const r = new Response(e).body?.pipeThrough(
          new DecompressionStream("gzip")
        );
        r && (e = new Uint8Array(await new Response(r).arrayBuffer()));
      }
      return this.looksLikeFormat(e) ? e : null;
    } catch {
      return null;
    }
  }
  /** Guard against a server returning 200 + an HTML/SPA-fallback page for a
   *  missing format asset: a real `.fmt` is multi-MB and not HTML. Rejecting it
   *  keeps {@link ensureFormat} on the graceful build-from-source path. */
  looksLikeFormat(t) {
    return t.length > 65536 && t[0] !== 60;
  }
  /** Prefetch the bloom filter and every warmup file in parallel (worker not
   *  needed yet). Best-effort: failures just fall back to on-demand sync XHR. */
  async fetchWarmupAssets() {
    if (!this.warmup) return { bloom: null, files: [], notFound: [] };
    const { texliveUrl: t, preload: e, notFound: r, concurrency: i = 8 } = this.warmup, s = async (o) => {
      try {
        const a = await fetch(o);
        return a.ok ? await a.arrayBuffer() : null;
      } catch {
        return null;
      }
    }, c = s(`${t}bloom-filter.bin`), m = [];
    let u = 0;
    const f = async () => {
      for (; u < e.length; ) {
        const o = e[u++], a = await s(`${t}pdftex/${o.dir}/${o.name}`);
        a && m.push({ format: o.format, filename: o.name, data: a });
      }
    };
    await Promise.all([...Array.from({ length: Math.min(i, e.length) }, f)]);
    const l = await c;
    return l && this.durableCache && (this.bloomBytes = l), { bloom: l, files: m, notFound: r };
  }
  /** Send the resolved warmup set to the worker (worker must be ready). The
   *  worker handles these FIFO before any later `compilelatex`, so the sends are
   *  fire-and-forget — no reply to await, and a stale worker simply ignores them
   *  and fetches on demand. */
  injectWarmupAssets(t, e) {
    e.bloom && t.loadBloom(e.bloom), t.preload404(e.notFound);
    for (const r of e.files) t.preloadTexlive(r.format, r.filename, r.data.slice(0));
  }
  /** Persist the worker caches to the durable store, but only when new files were fetched
   *  since the last persist. Dumps the primary {@link tex} worker plus every
   *  {@link extraCacheDrivers} worker and merges them, so e.g. XeLaTeX's dvipdfmx-fetched
   *  fonts are saved too. Best-effort and non-blocking. */
  maybePersist() {
    if (!this.durableCache) return;
    const t = this.durableCache, e = [this.tex, ...this.extraCacheDrivers()];
    x(this.persist, async () => {
      const r = await Promise.all(e.map((s) => s.dumpCache()));
      let i = { files: [], notFound: [] };
      for (const s of r)
        i = P(i, { files: s.files, notFound: s.notFound });
      this.bloomBytes && (i.bloomFilter = this.bloomBytes), await t.save(i);
    });
  }
  /** Build the LaTeX format once (`compileformat`), caching the bytes; then make
   *  it available to `compilelatex` under {@link fmtFile}. Returns the build log
   *  (empty on a cache hit). The multi-MB `.fmt` is written into the work dir only
   *  once per session — it persists in MEMFS across recompiles (the work dir is
   *  wiped only by {@link clearInjectedFormat} on flushCache), so re-writing it on
   *  every body edit would just burn time. */
  async ensureFormat() {
    let t = "";
    if (!this.fmtBytes) {
      const e = await this.tex.run("compileformat");
      t = e.log, e.success && e.out && (this.fmtBytes = e.out);
    }
    return this.fmtBytes && !this.fmtInjected && (await this.tex.writeFile(this.fmtFile, this.fmtBytes), this.fmtInjected = !0), t;
  }
  /** Mark the injected format as gone (call after a flushCache wipes the work
   *  dir) so the next {@link ensureFormat} re-injects it. */
  clearInjectedFormat() {
    this.fmtInjected = !1;
  }
  result(t, e, r, i) {
    const s = b(r);
    return s.length > 0 && w(s), {
      success: t,
      pdf: e,
      log: r,
      errors: g(r),
      compileTime: performance.now() - i,
      synctex: null,
      ...s.length > 0 ? { glyphCoverage: { gaps: s } } : {},
      telemetry: {
        diagnostics: F(r, s),
        // Source enrichment here covers LuaLaTeX (uses this result() directly) and the
        // XeLaTeX failure path (early return). XeLaTeX's success path re-derives this
        // with XDV fonts too. Recovers packages the preamble snapshot hides from the log.
        dependencies: d(r, { source: this.mainSource() })
      }
    };
  }
  writeFile(t, e) {
    return typeof e == "string" && this.sources.set(t, e), this.tex.writeFile(t, e);
  }
  /** The main `.tex` source as last written, for dependency extraction. */
  mainSource() {
    return this.sources.get(`${this.mainBase}.tex`);
  }
  async mkdir(t) {
    this.tex.mkdir(t);
  }
  setMainFile(t) {
    this.mainBase = t.replace(/\.tex$/, ""), this.tex.setMainFile(t);
  }
  readFile(t) {
    return this.tex.readFile(t);
  }
  async clearCache() {
    await this.durableCache?.clear();
  }
  /** Whether the durable (IndexedDB) cache is active — i.e. `persistentCache`
   *  was requested AND IndexedDB is available. Lets hosts/tests verify that an
   *  engine actually rehydrates and persists rather than silently no-opping. */
  isPersistentCacheEnabled() {
    return this.durableCache !== null;
  }
  getStatus() {
    return this.tex.getStatus();
  }
}
export {
  z as BaseTexFmtEngine,
  I as createCompileWorker,
  $ as unicodeFormatUrl
};
