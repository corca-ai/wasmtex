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
import { AssetDownloadError, type AssetDownloadEvent, AssetDownloadSession } from './asset-download'
import { fetchBloomFilter } from './bloom-filter'
import type { CompileEngine } from './compile-engine'
import { buildDependencyGraph } from './dependency-graph'
import { engineFormatUrl, engineWorkerUrl, formatAssetBase } from './engine-assets'
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
  const worker = engineWorkerUrl(base, version, binary)
  return new CompileWorkerDriver(
    binary === 'luatex' && options.luatexHeapCheckpoints ? `${worker}?engine=checkpoint` : worker,
    url,
    version,
    stage,
    profile,
  )
}

/**
 * URL of a prebuilt format asset shipped next to the
 * engine JS/WASM. Resolved like {@link createCompileWorker} so a preloaded format
 * and its engine share an asset dir unless the host supplies a compatible format base.
 */
export function unicodeFormatUrl(
  binary: 'xetex' | 'luatex',
  options: WasmTexEngineOptions,
): string {
  const base = formatAssetBase(
    options.assetBaseUrl ?? import.meta.env.BASE_URL,
    options.formatAssetBaseUrl,
  )
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
export interface TexFmtWarmSet {
  bloom: ArrayBuffer | null
  files: Array<{ format: number; filename: string; data: ArrayBuffer }>
  notFound: ReadonlyArray<{ format: number; filename: string }>
  source: 'warmup-cache' | 'persistent-cache'
}

/** Unicode controllers use a flat preload directory. Conflicting bytes under
 * one basename cannot be injected safely, even when their kpse formats differ.
 * Leave ambiguous files to the normal resolver; equal aliases remain reusable. */
function collisionSafeWarmup(cache: WarmupCache): WarmupCache {
  const byName = new Map<string, Uint8Array>()
  const conflicts = new Set<string>()
  for (const file of cache.files) {
    const bytes = new Uint8Array(file.data)
    const previous = byName.get(file.filename)
    if (
      previous &&
      (previous.length !== bytes.length || previous.some((byte, i) => byte !== bytes[i]))
    ) {
      conflicts.add(file.filename)
    } else byName.set(file.filename, bytes)
  }
  return { ...cache, files: cache.files.filter((file) => !conflicts.has(file.filename)) }
}

/** Suffix of the separate job a page preview runs as. */
export const PREVIEW_JOB_SUFFIX = '-wasmtex-preview'

/** Job-named inputs a full pass read, e.g. `./main.aux` -> `aux`. */
export function jobInputExtensions(
  inputFiles: readonly string[] | undefined,
  job: string,
): string[] {
  const prefix = `./${job}.`
  const extensions = new Set<string>()
  for (const file of inputFiles ?? []) {
    if (!file.startsWith(prefix)) continue
    const extension = file.slice(prefix.length)
    if (extension && extension !== 'tex' && !extension.includes('/')) extensions.add(extension)
  }
  return [...extensions]
}

/** How an engine wraps its terminal transcript at 79 columns: XeTeX counts
 *  characters, LuaTeX counts bytes. */
export type TranscriptWrap = 'characters' | 'bytes'

/**
 * Each project `.tex` file's first physical page, and every shipped page's
 * `\\count0`, from a full pass's terminal transcript. A page announces itself as
 * ` [n` and a file opening as `(./path`. The excerpt line after an over/underfull
 * box warning is skipped, since its text can hold ` [12]`. Null when the count
 * disagrees with the transcript's own `Output written on … (N pages`.
 */
export function transcriptPages(
  log: string,
  wrap: TranscriptWrap,
): { starts: Map<string, number>; numbers: number[] } | null {
  const { starts, numbers, written } = scanTranscript(log, wrap)
  return written === numbers.length ? { starts, numbers } : null
}

function scanTranscript(log: string, wrap: TranscriptWrap) {
  const encoder = new TextEncoder()
  const width = (line: string) =>
    wrap === 'characters' ? [...line].length : encoder.encode(line).length
  let excerpt = false
  const text = log
    .split('\n')
    .map((line) => {
      const skip = excerpt
      excerpt =
        /^(?:Overfull|Underfull|Loose|Tight) \\[hv]box/.test(line) ||
        (excerpt && width(line) === 79)
      if (skip) return width(line) === 79 ? '' : '\n'
      return width(line) === 79 ? line : `${line}\n`
    })
    .join('')
  const starts = new Map<string, number>()
  const numbers: number[] = []
  for (const match of text.matchAll(/\[(-?\d+)|\((?:\.\/)?([^\s()[\]]+\.tex)/g)) {
    if (match[2] !== undefined) {
      if (!starts.has(match[2])) starts.set(match[2], numbers.length + 1)
    } else if (match.index === 0 || /\s/.test(text[match.index - 1]!))
      numbers.push(Number(match[1]))
  }
  const written = /Output written on \S+ \((\d+) pages?/.exec(text)
  return { starts, numbers, written: written ? Number(written[1]) : null }
}

/** Packages that carry state across chapters outside the counters an omitted
 *  chapter's aux file restores, or that replace `\include` without its hooks. */
const CHAPTER_STATE_PACKAGES =
  /\/(?:biblatex|glossaries|glossaries-extra|acro|acronym|excludeonly|jurabib|titletoc)\.sty$/

/**
 * Typeset only the `\include`d `chapter`: `\includeonly` restores the other
 * chapters' counters from their aux files and earlier pages are discarded. A blank
 * `openright` page before the chapter heading carries no new left mark, so it is
 * discarded too: its running head would show the previous mark, not the omitted
 * chapter's. The job stops after `cap` kept pages or at the end of the chapter.
 * With one chapter included, the unnamed include hooks are its own (named ones do
 * not parse a name containing `/`).
 */
export function chapterPreviewHook(chapter: string, stop: string, cap: number): string {
  return (
    `\\includeonly{${chapter}}\\gdef\\wasmtexChapterOpen{0}\\gdef\\wasmtexChapterKept{0}` +
    `\\AddToHook{shipout/before}{\\ifcase\\wasmtexChapterOpen\\DiscardShipoutBox\\or` +
    `\\IfMarksEqualTF{2e-left}{top}{last}{\\DiscardShipoutBox}{\\gdef\\wasmtexChapterOpen{2}}\\fi}` +
    `\\AddToHook{shipout/after}{\\ifnum\\wasmtexChapterOpen=2 ` +
    `\\xdef\\wasmtexChapterKept{\\the\\numexpr\\wasmtexChapterKept+1}` +
    `\\ifnum\\wasmtexChapterKept<${cap} \\else${stop}\\fi\\fi}` +
    `\\AddToHook{include/before}{\\gdef\\wasmtexChapterOpen{1}}\\AddToHook{include/after}{${stop}}`
  )
}

/** The first chapter entry an aux file writes to the contents: its number, title,
 *  page and anchor, which a preview must reproduce. */
export function firstChapterEntry(aux: string | null): string | null {
  return /\\@writefile\{toc\}\{\\contentsline \{chapter\}.*/.exec(aux ?? '')?.[0] ?? null
}

/** A page preview and the physical page of the full PDF its first page replaces
 *  (1 for a prefix). */
export type ChapterPreviewResult = CompileResult & { firstPage?: number }

/** A preview job's names, timing and raw worker result. */
export interface PreviewRun {
  job: string
  main: string
  start: number
  fmtLog: string
  run: Awaited<ReturnType<CompileWorkerDriver['run']>>
}

export abstract class BaseTexFmtEngine implements CompileEngine {
  protected tex: CompileWorkerDriver
  /** Filename under which the built format is re-injected for `compilelatex`
   *  (e.g. `wasmtex-xetex.fmt`, `wasmtex-luatex.fmt`). */
  private readonly fmtFile: string
  protected mainBase = 'main'
  /** What this worker's last successful full pass read. A preview needs those files, so
   *  a worker that has not finished one (e.g. created after an interrupted compile)
   *  offers none. */
  private fullPass: {
    jobInputs: string[]
    preambleInputs: Set<string>
    /** Page placement for chapter previews; null when it cannot be trusted. */
    pages: ReturnType<typeof transcriptPages>
    /** Chapters whose preview failed or could not be placed since this pass. */
    refused: Set<string>
  } | null = null
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
  /** Retain caller warmup for reinitialization; caller buffers must never be detached. */
  private readonly suppliedWarmup: WarmupCache | undefined
  /** Durable IndexedDB cache of fetched assets (when persistentCache is on). */
  private durableCache: PersistentCache | null = null
  /** Bloom-filter bytes retained so the durable cache can store them too. */
  private bloomBytes: ArrayBuffer | null = null
  /** Files the worker has reported fetching this session; drives auto-persist (shape matches
   *  PersistState; inferred so this engine and WasmTexPdftexEngine don't share an import block). */
  private readonly persist = { downloadCount: 0, lastPersisted: -1, inFlight: false }
  protected readonly resolverProfile: CompletionSnapshotProfile
  public onAssetDownload?: (event: AssetDownloadEvent) => void
  protected downloadAbort = new AbortController()
  protected downloads = new AssetDownloadSession((event) => this.onAssetDownload?.(event))
  public onProgress?: (progress: number) => void
  public onFileDownload?: (filename: string) => void

  protected constructor(
    tex: CompileWorkerDriver,
    fmtFile: string,
    formatUrl?: string,
    warmup?: TexFmtWarmupPlan,
    persistentCache?: { version: TexliveVersion; texliveUrl: string },
    resolverProfile?: CompletionSnapshotProfile,
    suppliedWarmup?: WarmupCache,
  ) {
    this.suppliedWarmup = suppliedWarmup ? collisionSafeWarmup(suppliedWarmup) : undefined
    this.tex = tex
    this.tex.setAssetDownloadSession(this.downloads)
    this.fmtFile = fmtFile
    this.formatUrl = formatUrl
    this.warmup = warmup
    this.resolverProfile =
      resolverProfile ??
      ({ id: 'texlive-2025', texliveYear: '2025', mirrorRevision: null } as const)
    if (persistentCache && isIndexedDbSupported()) {
      this.durableCache = new PersistentCache({
        ...persistentCache,
        mirrorRevision: this.resolverProfile.mirrorRevision,
      })
    }
  }

  /** @internal Share the compiler's allowance with its synchronous Worker. */
  setAssetDownloadSession(session: AssetDownloadSession): void {
    this.downloads = session
    this.tex.setAssetDownloadSession(session)
  }

  abstract init(): Promise<void>
  abstract compile(): Promise<CompileResult>
  abstract flushCache(): Promise<void>
  abstract terminate(): void

  /** Wire callbacks, boot the worker, and — overlapping that boot — fetch the
   *  prebuilt format and warmup assets; then inject the warmup set once the
   *  worker is ready. A populated durable cache (a prior session) is preferred
   *  over a CDN prefetch, so return visits do ~zero network. */
  protected async initTex(): Promise<TexFmtWarmSet[]> {
    this.downloadAbort = new AbortController()
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
    const assetsP = this.loadDurable().then((durable) =>
      durable && durable.files.length > 0
        ? this.durableToAssets(durable)
        : this.fetchWarmupAssets(),
    )
    const [, , assets] = await Promise.all([fmtP, initP, assetsP])
    const warmSets = [assets]
    if (this.suppliedWarmup) {
      warmSets.push({
        bloom: this.suppliedWarmup.bloomFilter ?? null,
        files: this.suppliedWarmup.files.filter(
          (file) =>
            !assets.files.some(
              (base) => base.filename === file.filename && base.format !== file.format,
            ),
        ),
        notFound: this.suppliedWarmup.notFound,
        source: 'warmup-cache',
      })
    }
    for (const set of warmSets) this.injectWarmupAssets(this.tex, set)
    return warmSets
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
  protected rehydrateExtraDriver(driver: CompileWorkerDriver, warmSets: TexFmtWarmSet[]): void {
    for (const set of warmSets) this.injectWarmupAssets(driver, set)
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
   *  browser; falls back to the plain `.fmt`. Only an absent
   *  format leaves `fmtBytes` null and {@link ensureFormat} builds it. */
  private async preloadFormat(): Promise<void> {
    if (!this.formatUrl || this.fmtBytes) return
    const gzBytes = await this.tryPreloadGzFormat()
    if (gzBytes) {
      this.fmtBytes = gzBytes
      return
    }
    const bytes = await this.downloadFormatBytes(this.formatUrl)
    if (bytes === null) return
    this.fmtBytes = bytes
  }

  private downloadFormatBytes(url: string, compressed = false) {
    return this.downloads.read(url, {
      asset: 'format',
      signal: this.downloadAbort.signal,
      validate: async (bytes) => {
        if (compressed && bytes[0] === 0x1f && bytes[1] === 0x8b) {
          const stream = new Response(bytes as BodyInit).body?.pipeThrough(
            new DecompressionStream('gzip'),
          )
          if (stream)
            bytes = await readResponseWithProgress(
              new Response(stream),
              undefined,
              undefined,
              this.downloadAbort.signal,
            )
        }
        if (!this.looksLikeFormat(bytes)) throw new AssetDownloadError('invalid')
        return bytes
      },
      ...(this.onProgress ? { onPercent: this.onProgress } : {}),
    })
  }

  /** Fetch & decompress the gzipped `<fmt>.gz` variant, or null to fall back to the plain
   *  `.fmt`. Only attempted when DecompressionStream exists: without it, a server serving
   *  `.gz` raw would leave the bytes gzip-compressed, and looksLikeFormat (length + non-'<'
   *  first byte) would wrongly accept the gzip-magic blob — booting the engine from garbage
   *  and suppressing the plain-.fmt fallback. Mirrors fetchGzWithFallback's gate. */
  private async tryPreloadGzFormat(): Promise<Uint8Array | null> {
    if (!this.formatUrl || typeof DecompressionStream === 'undefined') return null
    return this.downloadFormatBytes(`${this.formatUrl}.gz`, true)
  }

  /** Guard against a server returning 200 + an HTML/SPA-fallback page for a
   *  missing format asset: a real `.fmt` is multi-MB and not HTML. Rejecting it
   *  fails initialization instead of silently generating a replacement. */
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
        const bytes = await this.downloads.read(url, {
          asset: 'data',
          signal: this.downloadAbort.signal,
          retry: false,
        })
        return bytes ? new Uint8Array(bytes).buffer : null
      } catch {
        return null
      }
    }
    const bloomP = this.suppliedWarmup?.bloomFilter
      ? Promise.resolve(this.suppliedWarmup.bloomFilter)
      : fetchBloomFilter(texliveUrl, { signal: this.downloadAbort.signal }, undefined, (event) =>
          this.onAssetDownload?.(event),
        ).catch(() => null)
    const supplied = new Set(
      this.suppliedWarmup?.files.map((file) => `${file.format}/${file.filename}`) ?? [],
    )

    const files: Array<{ format: number; filename: string; data: ArrayBuffer }> = []
    let next = 0
    const worker = async (): Promise<void> => {
      while (next < preload.length) {
        const entry = preload[next++]!
        if (supplied.has(`${entry.format}/${entry.name}`)) continue
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
    void persistIfNeeded(this.persist, () =>
      store.saveFrom(async () => {
        const dumps = await Promise.all(drivers.map((d) => d.dumpCache()))
        let cache: WarmupCache = { files: [], notFound: [] }
        for (const dump of dumps) {
          cache = mergeWarmupCaches(cache, { files: dump.files, notFound: dump.notFound })
        }
        if (this.bloomBytes) cache.bloomFilter = this.bloomBytes
        return cache
      }),
    )
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
  /** The work directory was wiped: the format and the full pass's outputs are gone. */
  protected clearInjectedFormat(): void {
    this.fmtInjected = false
    this.fullPass = null
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

  protected jobName(): string {
    return this.mainBase.slice(this.mainBase.lastIndexOf('/') + 1)
  }

  /** Record a successful full pass's inputs, in recorder order. Project `.tex` files read
   *  before the job's `.aux` (which `\\begin{document}` reads) belong to the preamble. */
  protected recordFullPass(
    inputFiles: readonly string[] | undefined,
    log: string,
    wrap: TranscriptWrap,
  ): void {
    const job = this.jobName()
    const preambleInputs = new Set<string>()
    for (const file of inputFiles ?? []) {
      if (file === `./${job}.aux`) break
      if (file.startsWith('./') && file.endsWith('.tex')) preambleInputs.add(file.slice(2))
    }
    const stateful = (inputFiles ?? []).some((file) => CHAPTER_STATE_PACKAGES.test(file))
    this.fullPass = {
      jobInputs: jobInputExtensions(inputFiles, job),
      preambleInputs,
      pages: stateful ? null : transcriptPages(log, wrap),
      refused: new Set(),
    }
  }

  /** Whether the last full pass read `path` in the preamble; unknown counts as read. */
  readsInPreamble(path: string): boolean {
    return this.fullPass?.preambleInputs.has(path) ?? true
  }

  /**
   * Run the current main source, prefixed by `hook` on its first line, as a separate
   * preview job beside the main file, then restore the main file. The job starts from
   * copies of the last full pass's job-named inputs, so its references match that pass
   * while the full pass's own auxiliary files stay untouched. Null means there is no
   * main source or no full pass on this worker: run `compile()` instead.
   */
  protected async runPreviewJob(
    hook: string,
    beforeRun?: (job: string) => Promise<void>,
    { cold = false }: { cold?: boolean } = {},
  ): Promise<PreviewRun | null> {
    const source = this.mainSource()
    if (source === undefined || !(this.fullPass || cold)) return null
    const start = performance.now()
    const fmtLog = await this.ensureFormat()
    const name = this.jobName()
    const job = `${name}${PREVIEW_JOB_SUFFIX}`
    await Promise.all(
      (this.fullPass?.jobInputs ?? []).map(async (extension) => {
        const content = await this.tex.readFile(`${name}.${extension}`)
        if (content !== null) await this.tex.writeFile(`${job}.${extension}`, content)
      }),
    )
    // A cold preview reads no aux file, not even one an earlier cold preview left.
    if (!this.fullPass) await this.tex.writeFile(`${job}.aux`, '')
    const main = `${this.mainBase.slice(0, this.mainBase.length - name.length)}${job}.tex`
    await this.tex.writeFile(main, hook + source)
    await beforeRun?.(job)
    this.tex.setMainFile(main)
    try {
      return { job, main, start, fmtLog, run: await this.tex.run('compilelatex') }
    } finally {
      this.tex.setMainFile(`${this.mainBase}.tex`)
    }
  }

  /** The physical page where `chapter` starts in the full PDF, or null when a chapter
   *  preview cannot be placed: no trusted pages, a refused chapter, or a start past
   *  the page limit. */
  protected chapterStart(chapter: string, pageLimit: number): number | null {
    const pass = this.fullPass
    if (!pass?.pages || pass.refused.has(chapter)) return null
    const start = pass.pages.starts.get(`${chapter}.tex`)
    return start !== undefined && start <= pageLimit ? start : null
  }

  /** Stop offering `chapter` previews until the next full pass. */
  refuseChapter(chapter: string): void {
    this.fullPass?.refused.add(chapter)
  }

  /** Where a successful chapter preview belongs, or null (refusing the chapter) when
   *  its first page number or its contents entry disagrees with the full pass. A
   *  leading blank page it discarded shifts it by one. */
  protected placeChapter(
    chapter: string,
    start: number,
    previewLog: string,
    wrap: TranscriptWrap,
    entries: [preview: string | null, full: string | null],
  ): number | null {
    const numbers = this.fullPass?.pages?.numbers
    const first = scanTranscript(previewLog, wrap).numbers[0]
    const shift = [0, 1].find((k) => first !== undefined && numbers?.[start - 1 + k] === first)
    if (shift === undefined || entries[0] === null || entries[0] !== entries[1]) {
      this.refuseChapter(chapter)
      return null
    }
    return start + shift
  }

  /** The author's errors must match the full pass's, which name the real main file. */
  protected attributePreviewErrors(result: CompileResult, previewMain: string): CompileResult {
    const main = `${this.mainBase}.tex`
    for (const error of result.errors) if (error.file === previewMain) error.file = main
    for (const diagnostic of result.telemetry?.diagnostics ?? [])
      if (diagnostic.file === previewMain) diagnostic.file = main
    return result
  }

  async clearCache(): Promise<void> {
    // Drop the durable IndexedDB cache for this mirror namespace (no-op when disabled).
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
