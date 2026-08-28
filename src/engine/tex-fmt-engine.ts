/**
 * Shared base for the Unicode WasmTex engines (XeTeX, LuaTeX).
 *
 * Both drive a single primary TeX worker. The format is either preloaded from a
 * shipped `.fmt` asset (when the subclass passes a `formatUrl`) or, failing that,
 * built once per session (`compileformat`); either way it is re-injected before
 * each run (flushCache wipes the work dir where it lives). They also share the file
 * management surface (`writeFile` / `mkdir` / `readFile` / …), which all delegates
 * to that primary worker where the project lives.
 *
 * Subclasses differ only in how they turn a compile into a PDF: LuaTeX emits PDF
 * directly (single worker), whereas XeTeX emits XDV and pipes it through a second
 * dvipdfmx worker. They therefore implement {@link init}, {@link compile},
 * {@link flushCache} and {@link terminate} themselves.
 */
import type {
  CompileResult,
  CompletionSnapshotProfile,
  EngineStatus,
  ResolverEvidenceReport,
  TexliveVersion,
  WarmupCache,
} from '../types'
import type { CompileEngine } from './compile-engine'
import { buildDependencyGraph } from './dependency-graph'
import { engineFormatUrl, engineWorkerUrl } from './engine-assets'
import { readResponseWithProgress } from './fetch-gz'
import { enrichGlyphSuggestions } from './glyph-suggestions'
import { buildDiagnostics, parseGlyphGaps, parseTexErrors } from './parse-errors'
import { persistIfNeeded } from './persist-watermark'
import { isIndexedDbSupported, PersistentCache } from './persistent-cache'
import { mergeResolverReports } from './resolver-evidence'
import { mergeWarmupCaches, type WasmTexEngineOptions } from './wasmtex-engine'
import { CompileWorkerDriver } from './wasmtex-worker'

/**
 * Build a {@link CompileWorkerDriver} for a WasmTex engine binary (`xetex`,
 * `dvipdfm`, `luatex`) from the shared engine options, resolving the asset URL,
 * TeX Live version and server endpoint the same way for every Unicode engine.
 */
export function createCompileWorker(
  binary: 'xetex' | 'dvipdfm' | 'luatex',
  options: WasmTexEngineOptions,
): CompileWorkerDriver {
  const base = options.assetBaseUrl ?? import.meta.env.BASE_URL
  const version = options.texliveVersion ?? '2025'
  const url = options.texliveUrl ?? null
  const profile = options.resolverProfile ?? {
    id: `texlive-${version}`,
    texliveYear: version,
    mirrorRevision: null,
  }
  const stage = binary === 'dvipdfm' ? 'dvipdfmx' : binary
  return new CompileWorkerDriver(
    engineWorkerUrl(base, version, binary),
    url,
    version,
    stage,
    profile,
  )
}

/**
 * URL of a prebuilt format asset shipped next to the
 * engine JS/WASM. Resolved like {@link createCompileWorker} so a preloaded format
 * and its engine always come from the same asset dir.
 */
export function unicodeFormatUrl(
  binary: 'xetex' | 'luatex',
  options: WasmTexEngineOptions,
): string {
  const base = options.assetBaseUrl ?? import.meta.env.BASE_URL
  const version = options.texliveVersion ?? '2025'
  return engineFormatUrl(base, version, binary)
}

/**
 * Built-in warmup plan for a Unicode engine: the TeX Live files a cold first
 * compile fetches. The engine prefetches them in parallel (overlapping worker
 * boot) and injects them so the worker never blocks on sync XHR.
 */
export interface TexFmtWarmupPlan {
  /** Resolved CDN endpoint (e.g. `https://…/2025/`). */
  texliveUrl: string
  /** Files that 200 during a first compile, with their CDN format dir. */
  preload: ReadonlyArray<{ format: number; name: string; dir: string }>
  /** Lookups that 404/403 during a first compile (pre-seeded to skip XHR). */
  notFound: ReadonlyArray<{ format: number; filename: string }>
  /** Max parallel prefetch requests. Defaults to 8. */
  concurrency?: number
}

/** A resolved warmup set ready to inject: a bloom filter, prefetched files, and
 *  known-missing entries — sourced from the CDN (cold) or the durable cache. */
interface TexFmtWarmSet {
  bloom: ArrayBuffer | null
  files: Array<{ format: number; filename: string; data: ArrayBuffer }>
  notFound: ReadonlyArray<{ format: number; filename: string }>
  source: 'warmup-cache' | 'persistent-cache'
}

export abstract class BaseTexFmtEngine implements CompileEngine {
  protected tex: CompileWorkerDriver
  /** Filename under which the built format is re-injected for `compilelatex`
   *  (e.g. `wasmtex-xetex.fmt`, `wasmtex-luatex.fmt`). */
  private readonly fmtFile: string
  protected mainBase = 'main'
  /** Last-written text sources, kept so dependency extraction can read the main
   *  source synchronously (no worker round-trip). */
  private readonly sources = new Map<string, string>()
  /** Built LaTeX format dump, cached after the first `compileformat` (or
   *  preloaded from a shipped `.fmt` asset, skipping `compileformat` entirely). */
  private fmtBytes: Uint8Array | null = null
  /** Whether {@link fmtBytes} is currently written into the worker's work dir.
   *  Reset by {@link clearInjectedFormat} when flushCache wipes the dir. */
  private fmtInjected = false
  /** URL of a prebuilt format to preload at init, if any. */
  private readonly formatUrl: string | undefined
  /** Built-in warmup plan (bloom filter + parallel prefetch), if any. */
  private readonly warmup: TexFmtWarmupPlan | undefined
  /** The warmup/durable set resolved at init, retained so an auxiliary worker (e.g. xetex's
   *  dvipdfmx) can be rehydrated from it after *its* own init completes. */
  private lastWarmSet: TexFmtWarmSet | null = null
  /** Durable IndexedDB cache of fetched assets (when persistentCache is on). */
  private durableCache: PersistentCache | null = null
  /** Bloom-filter bytes retained so the durable cache can store them too. */
  private bloomBytes: ArrayBuffer | null = null
  /** Files the worker has reported fetching this session; drives auto-persist (shape matches
   *  PersistState; inferred so this engine and WasmTexPdftexEngine don't share an import block). */
  private readonly persist = { downloadCount: 0, lastPersisted: -1, inFlight: false }
  protected readonly resolverProfile: CompletionSnapshotProfile
  public onProgress?: (progress: number) => void
  public onFileDownload?: (filename: string) => void

  protected constructor(
    tex: CompileWorkerDriver,
    fmtFile: string,
    formatUrl?: string,
    warmup?: TexFmtWarmupPlan,
    persistentCache?: { version: TexliveVersion },
    resolverProfile?: CompletionSnapshotProfile,
  ) {
    this.tex = tex
    this.fmtFile = fmtFile
    this.formatUrl = formatUrl
    this.warmup = warmup
    this.resolverProfile =
      resolverProfile ??
      ({ id: 'texlive-2025', texliveYear: '2025', mirrorRevision: null } as const)
    if (persistentCache && isIndexedDbSupported()) {
      this.durableCache = new PersistentCache({ version: persistentCache.version })
    }
  }

  abstract init(): Promise<void>
  abstract compile(): Promise<CompileResult>
  abstract flushCache(): Promise<void>
  abstract terminate(): void

  /** Wire callbacks, boot the worker, and — overlapping that boot — fetch the
   *  prebuilt format and warmup assets; then inject the warmup set once the
   *  worker is ready. A populated durable cache (a prior session) is preferred
   *  over a CDN prefetch, so return visits do ~zero network. */
  protected async initTex(): Promise<void> {
    this.tex.onFileDownload = (f) => {
      this.persist.downloadCount++
      this.onFileDownload?.(f)
    }
    // NB: the worker emits no `progress` messages, so wiring this.tex.onProgress
    // would be dead. Format-download progress is reported directly from
    // preloadFormat (streamed read), mirroring the pdfTeX engine.
    // Kick off network/IndexedDB reads immediately; they need no worker.
    const fmtP = this.preloadFormat()
    const initP = this.tex.init()
    const durable = await this.loadDurable()
    const assets =
      durable && durable.files.length > 0
        ? this.durableToAssets(durable)
        : await this.fetchWarmupAssets()
    await initP
    await fmtP
    this.lastWarmSet = assets
    this.injectWarmupAssets(this.tex, assets)
  }

  /** Count a file fetched by an auxiliary worker (e.g. xetex's dvipdfmx) toward the
   *  auto-persist watermark, so a compile whose only new fetches came from that worker still
   *  persists instead of being skipped by maybePersist's "nothing new" guard. */
  protected bumpDownloadCount(): void {
    this.persist.downloadCount++
  }

  /** Auxiliary workers whose TeX Live caches must be persisted/rehydrated alongside the
   *  primary {@link tex} worker. Base: none. XeLaTeX overrides this with its dvipdfmx worker,
   *  which fetches and embeds fonts the primary XeTeX worker never caches. */
  protected extraCacheDrivers(): CompileWorkerDriver[] {
    return []
  }

  /** Rehydrate an auxiliary worker from the durable/warmup set resolved at init. Call only
   *  AFTER that worker's own init() so its preload queue is live — preloads are fire-and-forget
   *  and a not-yet-ready worker silently drops them. */
  protected rehydrateExtraDriver(driver: CompileWorkerDriver): void {
    if (this.lastWarmSet) this.injectWarmupAssets(driver, this.lastWarmSet)
  }

  /** Load the durable cache (if enabled) from a prior session. The durable set is
   *  already on disk, so don't re-persist until new files are fetched. */
  private async loadDurable(): Promise<WarmupCache | null> {
    if (!this.durableCache) return null
    try {
      const stored = await this.durableCache.load()
      if (stored) this.persist.lastPersisted = 0
      return stored
    } catch {
      return null
    }
  }

  private durableToAssets(cache: WarmupCache): TexFmtWarmSet {
    if (cache.bloomFilter) this.bloomBytes = cache.bloomFilter
    return {
      bloom: cache.bloomFilter ?? null,
      files: cache.files.map((f) => ({ format: f.format, filename: f.filename, data: f.data })),
      notFound: cache.notFound,
      source: 'persistent-cache',
    }
  }

  /** Fetch a prebuilt format asset into {@link fmtBytes} so the first compile
   *  skips the expensive per-session `compileformat`. Prefers a gzipped
   *  `<fmt>.gz` (format files are large and compress ~5×), decompressing in the
   *  browser; falls back to the plain `.fmt`. Best-effort: a missing or failed
   *  fetch leaves `fmtBytes` null and {@link ensureFormat} builds it. */
  private async preloadFormat(): Promise<void> {
    if (!this.formatUrl || this.fmtBytes) return
    const gzBytes = await this.tryPreloadGzFormat()
    if (gzBytes) {
      this.fmtBytes = gzBytes
      return
    }
    try {
      const resp = await fetch(this.formatUrl)
      if (!resp.ok) return
      const bytes = await readResponseWithProgress(resp, this.onProgress)
      if (this.looksLikeFormat(bytes)) this.fmtBytes = bytes
    } catch {
      // No prebuilt format available — ensureFormat() builds one on first compile.
    }
  }

  /** Fetch & decompress the gzipped `<fmt>.gz` variant, or null to fall back to the plain
   *  `.fmt`. Only attempted when DecompressionStream exists: without it, a server serving
   *  `.gz` raw would leave the bytes gzip-compressed, and looksLikeFormat (length + non-'<'
   *  first byte) would wrongly accept the gzip-magic blob — booting the engine from garbage
   *  and suppressing the plain-.fmt fallback. Mirrors fetchGzWithFallback's gate. */
  private async tryPreloadGzFormat(): Promise<Uint8Array | null> {
    if (!this.formatUrl || typeof DecompressionStream === 'undefined') return null
    try {
      const gz = await fetch(`${this.formatUrl}.gz`)
      if (!gz.ok) return null
      // Progress reflects the (compressed) transfer; decompress after.
      let bytes = await readResponseWithProgress(gz, this.onProgress)
      // The server may serve `.gz` raw (gzip magic 1f 8b) or already decode it via
      // Content-Encoding; only decompress when it's still gzip.
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Response(bytes as BodyInit).body?.pipeThrough(
          new DecompressionStream('gzip'),
        )
        if (stream) bytes = new Uint8Array(await new Response(stream).arrayBuffer())
      }
      return this.looksLikeFormat(bytes) ? bytes : null
    } catch {
      return null // fall through to the uncompressed format
    }
  }

  /** Guard against a server returning 200 + an HTML/SPA-fallback page for a
   *  missing format asset: a real `.fmt` is multi-MB and not HTML. Rejecting it
   *  keeps {@link ensureFormat} on the graceful build-from-source path. */
  private looksLikeFormat(bytes: Uint8Array): boolean {
    return bytes.length > 65536 && bytes[0] !== 0x3c /* '<' */
  }

  /** Prefetch the bloom filter and every warmup file in parallel (worker not
   *  needed yet). Best-effort: failures just fall back to on-demand sync XHR. */
  private async fetchWarmupAssets(): Promise<TexFmtWarmSet> {
    if (!this.warmup) return { bloom: null, files: [], notFound: [], source: 'warmup-cache' }
    const { texliveUrl, preload, notFound, concurrency = 8 } = this.warmup
    const fetchBuf = async (url: string): Promise<ArrayBuffer | null> => {
      try {
        const resp = await fetch(url)
        return resp.ok ? await resp.arrayBuffer() : null
      } catch {
        return null
      }
    }
    const bloomP = fetchBuf(`${texliveUrl}bloom-filter.bin`)

    const files: Array<{ format: number; filename: string; data: ArrayBuffer }> = []
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < preload.length) {
        const entry = preload[next++]!
        const buf = await fetchBuf(`${texliveUrl}pdftex/${entry.dir}/${entry.name}`)
        if (buf) files.push({ format: entry.format, filename: entry.name, data: buf })
      }
    }
    await Promise.all([...Array.from({ length: Math.min(concurrency, preload.length) }, worker)])
    const bloom = await bloomP
    // Retain the bloom bytes so a later persist() stores them in the durable cache.
    if (bloom && this.durableCache) this.bloomBytes = bloom
    return { bloom, files, notFound, source: 'warmup-cache' }
  }

  /** Send the resolved warmup set to the worker (worker must be ready). The
   *  worker handles these FIFO before any later `compilelatex`, so the sends are
   *  fire-and-forget — no reply to await, and a stale worker simply ignores them
   *  and fetches on demand. */
  private injectWarmupAssets(driver: CompileWorkerDriver, assets: TexFmtWarmSet): void {
    if (assets.bloom) driver.loadBloom(assets.bloom)
    driver.preload404(
      assets.notFound,
      assets.source === 'persistent-cache' ? 'durable-negative' : 'warmup-negative',
    )
    // Copy each buffer: preloadTexlive TRANSFERS (detaches) it, but the same warm set is
    // re-injected into a second worker (XeLaTeX's dvipdfmx via rehydrateExtraDriver), which
    // would otherwise receive a 0-byte detached buffer. Mirrors WasmTexPdftexEngine.injectWarmupCache.
    for (const f of assets.files) {
      driver.preloadTexlive(f.format, f.filename, f.data.slice(0), assets.source)
    }
  }

  /** Persist the worker caches to the durable store, but only when new files were fetched
   *  since the last persist. Dumps the primary {@link tex} worker plus every
   *  {@link extraCacheDrivers} worker and merges them, so e.g. XeLaTeX's dvipdfmx-fetched
   *  fonts are saved too. Best-effort and non-blocking. */
  protected maybePersist(): void {
    if (!this.durableCache) return
    const store = this.durableCache
    const drivers = [this.tex, ...this.extraCacheDrivers()]
    // Advance the watermark only after the save resolves (see persistIfNeeded): a failed
    // save must retry on a later compile, not mark the fetched files as already-persisted.
    void persistIfNeeded(this.persist, async () => {
      const dumps = await Promise.all(drivers.map((d) => d.dumpCache()))
      let cache: WarmupCache = { files: [], notFound: [] }
      for (const dump of dumps) {
        cache = mergeWarmupCaches(cache, { files: dump.files, notFound: dump.notFound })
      }
      if (this.bloomBytes) cache.bloomFilter = this.bloomBytes
      await store.save(cache)
    })
  }

  /** Build the LaTeX format once (`compileformat`), caching the bytes; then make
   *  it available to `compilelatex` under {@link fmtFile}. Returns the build log
   *  (empty on a cache hit). The multi-MB `.fmt` is written into the work dir only
   *  once per session — it persists in MEMFS across recompiles (the work dir is
   *  wiped only by {@link clearInjectedFormat} on flushCache), so re-writing it on
   *  every body edit would just burn time. */
  protected async ensureFormat(): Promise<string> {
    let buildLog = ''
    if (!this.fmtBytes) {
      const fmt = await this.tex.run('compileformat')
      buildLog = fmt.log
      if (fmt.success && fmt.out) this.fmtBytes = fmt.out
    }
    if (this.fmtBytes && !this.fmtInjected) {
      await this.tex.writeFile(this.fmtFile, this.fmtBytes)
      this.fmtInjected = true
    }
    return buildLog
  }

  /** Mark the injected format as gone (call after a flushCache wipes the work
   *  dir) so the next {@link ensureFormat} re-injects it. */
  protected clearInjectedFormat(): void {
    this.fmtInjected = false
  }

  protected result(
    success: boolean,
    pdf: Uint8Array | null,
    log: string,
    start: number,
    inputFiles?: string[],
    inputFilesComplete?: boolean,
    resolverReports: ReadonlyArray<ResolverEvidenceReport | undefined> = [],
  ): CompileResult {
    const glyphGaps = parseGlyphGaps(log)
    if (glyphGaps.length > 0) enrichGlyphSuggestions(glyphGaps)
    return {
      success,
      pdf,
      log,
      errors: parseTexErrors(log),
      compileTime: performance.now() - start,
      synctex: null,
      ...(inputFiles ? { inputFiles } : {}),
      ...(typeof inputFilesComplete === 'boolean' ? { inputFilesComplete } : {}),
      ...(glyphGaps.length > 0 ? { glyphCoverage: { gaps: glyphGaps } } : {}),
      telemetry: {
        diagnostics: buildDiagnostics(log, glyphGaps),
        ...(resolverReports.some(Boolean)
          ? { resolver: mergeResolverReports(this.resolverProfile, resolverReports) }
          : {}),
        // Source enrichment here covers LuaLaTeX (uses this result() directly) and the
        // XeLaTeX failure path (early return). XeLaTeX's success path re-derives this
        // with XDV fonts too. Recovers packages the preamble snapshot hides from the log.
        dependencies: buildDependencyGraph(log, {
          inputFiles,
          source: this.mainSource(),
        }),
      },
    }
  }

  writeFile(path: string, content: string | Uint8Array): Promise<void> {
    if (typeof content === 'string') this.sources.set(path, content)
    return this.tex.writeFile(path, content)
  }

  /** The main `.tex` source as last written, for dependency extraction. */
  protected mainSource(): string | undefined {
    return this.sources.get(`${this.mainBase}.tex`)
  }

  async mkdir(path: string): Promise<void> {
    this.tex.mkdir(path)
  }

  setMainFile(path: string): void {
    this.mainBase = path.replace(/\.tex$/, '')
    this.tex.setMainFile(path)
  }

  readFile(path: string): Promise<string | null> {
    return this.tex.readFile(path)
  }

  async clearCache(): Promise<void> {
    // Drop the durable IndexedDB cache for this version (no-op when disabled).
    await this.durableCache?.clear()
  }

  /** Whether the durable (IndexedDB) cache is active — i.e. `persistentCache`
   *  was requested AND IndexedDB is available. Lets hosts/tests verify that an
   *  engine actually rehydrates and persists rather than silently no-opping. */
  isPersistentCacheEnabled(): boolean {
    return this.durableCache !== null
  }

  getStatus(): EngineStatus {
    return this.tex.getStatus()
  }
}
