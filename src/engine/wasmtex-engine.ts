import type {
  CachedTexliveFile,
  CompileResult,
  CompletionSnapshotProfile,
  ResolverEvidenceReport,
  TexliveFileEntry,
  TexliveVersion,
  WarmupCache,
} from '../types'
import { BaseWorkerEngine, resolveTexliveUrl } from './base-worker-engine'
import type { CompileEngine } from './compile-engine'
import {
  type EngineCompletionObservation,
  parseEngineCompletionObservation,
} from './completion-snapshot'
import { buildDependencyGraph } from './dependency-graph'
import { normalizeProjectDependencyPath } from './dependency-manifest'
import { engineFormatUrl, engineWorkerUrl } from './engine-assets'
import { readResponseWithProgress } from './fetch-gz'
import { enrichGlyphSuggestions } from './glyph-suggestions'
import { buildDiagnostics, parseGlyphGaps, parseTexErrors } from './parse-errors'
import { type PersistState, persistIfNeeded } from './persist-watermark'
import type { BinaryStore } from './persistent-cache'
import { isIndexedDbSupported, PersistentCache } from './persistent-cache'
import { durablePreambleKey, PreambleSnapshotCache, preambleSha256 } from './preamble-cache'
import { extractPreamble } from './preamble-utils'
import { type RawResolverEvidence, ResolverEvidenceCollector } from './resolver-evidence'
import { createEngineWorker } from './worker-host'

export interface WasmTexEngineOptions {
  /** TeX Live version to use. Defaults to '2025'. */
  texliveVersion?: TexliveVersion
  /** WASM binary to load. Defaults to 'pdftex'. 'xetex'/'luatex' select
   *  the corresponding Unicode engine worker. */
  engineBinary?: 'pdftex' | 'xetex' | 'luatex'
  /** Base URL for WASM assets. Defaults to `import.meta.env.BASE_URL`. */
  assetBaseUrl?: string
  /** TexLive server endpoint. Defaults to `${location.origin}${BASE_URL}texlive/`. */
  texliveUrl?: string
  /** Load the Asyncify engine build that can take resumable mid-run checkpoints (#81).
   *  Roughly 20-30% slower per compile than the plain build, so hosts enable it only for
   *  interactive incremental sessions. Browser workers only. */
  heapCheckpoints?: boolean
  /** If true, do not attempt to preload the base .fmt file. */
  skipFormatPreload?: boolean
  /** If true, disable precompiled preamble snapshots and always run a full
   *  compile. An escape hatch for documents incompatible with preamble
   *  precompilation. Defaults to false (snapshots enabled). */
  disablePreambleSnapshot?: boolean
  /** Pre-fetched TeX Live files from `warmup()`. */
  warmupCache?: WarmupCache
  /** Enable the built-in persistent (IndexedDB) cache of fetched TeX Live assets.
   *  Rehydrates on init and auto-persists after compiles that fetched new files,
   *  so return visits are near-instant and work offline. Silently no-ops where
   *  IndexedDB is unavailable. Defaults to false. */
  persistentCache?: boolean
  /** Persist document-specific pdfLaTeX preamble formats across worker sessions.
   *  Requires an immutable `preambleCacheIdentity.mirrorRevision`. */
  persistentPreambleCache?: boolean
  /** Immutable TeX Live mirror identity used to fail closed on cache reuse. */
  preambleCacheIdentity?: { mirrorRevision: string | null }
  /** Test/integration injection point; browser hosts normally omit it. @internal */
  preambleCacheStore?: BinaryStore
  /** Exact compile profile attached to host-local resolver evidence. */
  resolverProfile?: CompletionSnapshotProfile
}

/** Counter for unique message IDs. */
let nextMsgId = 1

/** Incoming response message from the WASM worker. */
interface WorkerMessage {
  result?: string
  status?: number
  cmd?: string
  msgId?: string
  file?: string
  log?: string
  pdf?: ArrayBuffer
  synctex?: ArrayBuffer
  format?: ArrayBuffer
  /** Checkpoint format + head PDF (incremental compile, #55). */
  fmt?: ArrayBuffer
  headPdf?: ArrayBuffer
  data?: string
  preambleSnapshot?: boolean
  preambleRebuilt?: boolean
  phaseTimings?: unknown
  preambleFormat?: ArrayBuffer
  preambleHash?: string
  preambleInputFiles?: string[]
  engineCommands?: string[]
  engineCommandsComplete?: boolean
  engineCommandsDropped?: number
  inputFiles?: string[]
  inputFilesComplete?: boolean
  semanticTrace?: string
  completionObservations?: string[]
  files?: CachedTexliveFile[]
  notFound?: TexliveFileEntry[]
  evidence?: RawResolverEvidence
}

function resolverTelemetry(
  resolver: ResolverEvidenceReport | undefined,
): Record<string, never> | { resolver: ResolverEvidenceReport } {
  return resolver ? { resolver } : {}
}

function applyEngineCommandObservation(result: CompileResult, data: WorkerMessage): void {
  const rawCommands = Array.isArray(data.engineCommands) ? data.engineCommands : null
  const commands = rawCommands?.filter((command): command is string => typeof command === 'string')
  if (commands) result.engineCommands = commands

  const engineDropped = data.engineCommandsDropped
  if (
    typeof engineDropped !== 'number' ||
    !Number.isSafeInteger(engineDropped) ||
    engineDropped < 0
  ) {
    result.engineCommandsComplete = false
    return
  }
  const hostDropped = rawCommands ? rawCommands.length - (commands?.length ?? 0) : 0
  result.engineCommandsDropped = Math.min(Number.MAX_SAFE_INTEGER, engineDropped + hostDropped)
  result.engineCommandsComplete =
    rawCommands !== null && data.engineCommandsComplete === true && hostDropped === 0
}

function applyRecorderObservation(result: CompileResult, data: WorkerMessage): void {
  if (!Array.isArray(data.inputFiles)) {
    result.inputFilesComplete = false
    return
  }
  const inputFiles = data.inputFiles.filter((path): path is string => typeof path === 'string')
  result.inputFiles = inputFiles
  result.inputFilesComplete =
    data.inputFilesComplete === true && inputFiles.length === data.inputFiles.length
}

/** Merge two warmup caches; `override` entries win on key collisions.
 *  Exported for unit testing — the merge must keep `files` and `notFound`
 *  disjoint (the worker resolves a 404 before a preloaded file). */
export function mergeWarmupCaches(base: WarmupCache, override: WarmupCache): WarmupCache {
  const byKey = new Map<string, CachedTexliveFile>()
  for (const file of base.files) byKey.set(`${file.format}/${file.filename}`, file)
  for (const file of override.files) byKey.set(`${file.format}/${file.filename}`, file)

  // Keys the override explicitly marks missing must win over any cached bytes.
  const overrideNotFound = new Set(override.notFound.map((e) => `${e.format}/${e.filename}`))

  const seen = new Set<string>()
  const notFound: TexliveFileEntry[] = []
  for (const entry of [...base.notFound, ...override.notFound]) {
    const key = `${entry.format}/${entry.filename}`
    if (seen.has(key)) continue
    // Reconcile cross-list collisions so a key never appears in both lists: an
    // override 404 deletes the cached file; otherwise a (base or override) file
    // supersedes a base 404. The worker resolves a 404 before a preloaded file,
    // so leaving a key in both would shadow real bytes the caller supplied.
    if (byKey.has(key)) {
      if (overrideNotFound.has(key)) byKey.delete(key)
      else continue
    }
    seen.add(key)
    notFound.push(entry)
  }

  const merged: WarmupCache = { files: [...byKey.values()], notFound }
  const bloom = override.bloomFilter ?? base.bloomFilter
  if (bloom) merged.bloomFilter = bloom
  return merged
}

/** Checkpoints the worker took during this run (#81), as reported in the response. */
function applyHeapCheckpoints(result: CompileResult, data: WorkerMessage): void {
  const raw = (data as { heapCheckpoints?: unknown }).heapCheckpoints
  if (!Array.isArray(raw)) return
  result.heapCheckpoints = raw.map((c) => {
    const r = c as Record<string, unknown>
    return {
      id: String(r.id),
      line: Number(r.line),
      bytes: Number(r.bytes) || 0,
      ms: Number(r.ms) || 0,
      inputs: Array.isArray(r.inputs) ? r.inputs.map(String) : null,
    }
  })
}

export class WasmTexPdftexEngine extends BaseWorkerEngine<WorkerMessage> implements CompileEngine {
  private formatPath: string
  private skipFormatPreload: boolean
  private version: TexliveVersion
  private warmupCache: WarmupCache | undefined
  private readonly warmupPositiveSources = new Map<string, 'warmup-cache' | 'persistent-cache'>()
  private readonly warmupNegativeSources = new Map<string, 'warmup-negative' | 'durable-negative'>()
  private preambleSnapshotEnabled: boolean
  private persistentCacheEnabled: boolean
  private readonly assetBaseUrl: string
  private readonly effectiveTexliveUrl: string
  private readonly preambleMirrorRevision: string | null
  private preambleCache: PreambleSnapshotCache | null = null
  private engineBuildId: string | null = null
  private readonly projectFiles = new Map<string, string | Uint8Array>()
  private loadedPreambleKey: string | null = null
  private attemptedPreambleKey: string | null = null
  private activePreambleDependencies = new Set<string>()
  private preamblePersistInFlight: Promise<void> | null = null
  private durableCache: PersistentCache | null = null
  private bloomFilter: ArrayBuffer | undefined
  /** Main file name, tracked for source-based dependency extraction. */
  private mainFileName = 'main.tex'
  private heapCheckpointsSupported = false
  /** Last-written text sources, so dependency extraction can read the main source
   *  synchronously (no worker round-trip). */
  private readonly sources = new Map<string, string>()
  private completionObservation: EngineCompletionObservation | null = null
  /** Download/persist watermark (drives auto-persist; single-flight guarded). */
  private readonly persist: PersistState = { downloadCount: 0, lastPersisted: -1, inFlight: false }
  private readonly resolver: ResolverEvidenceCollector

  public onFileDownload?: (filename: string) => void

  constructor(options?: WasmTexEngineOptions) {
    const base = options?.assetBaseUrl ?? import.meta.env.BASE_URL
    const version = options?.texliveVersion ?? '2025'
    const binary = options?.engineBinary ?? 'pdftex'
    super(
      options?.heapCheckpoints
        ? `${engineWorkerUrl(base, version, binary)}?engine=checkpoint`
        : engineWorkerUrl(base, version, binary),
      options?.texliveUrl ?? null,
    )
    this.formatPath = engineFormatUrl(base, version, binary)
    this.skipFormatPreload = !!options?.skipFormatPreload
    this.version = version
    this.warmupCache = options?.warmupCache
    this.preambleSnapshotEnabled = !options?.disablePreambleSnapshot
    this.persistentCacheEnabled = !!options?.persistentCache && isIndexedDbSupported()
    this.assetBaseUrl = base
    this.effectiveTexliveUrl = resolveTexliveUrl(options?.texliveUrl ?? null, version)
    this.preambleMirrorRevision = options?.preambleCacheIdentity?.mirrorRevision ?? null
    this.resolver = new ResolverEvidenceCollector(
      'pdftex',
      options?.resolverProfile ?? {
        id: `texlive-${version}`,
        texliveYear: version,
        mirrorRevision: this.preambleMirrorRevision,
      },
    )
    if (
      options?.persistentPreambleCache &&
      this.preambleMirrorRevision &&
      (isIndexedDbSupported() || options.preambleCacheStore)
    ) {
      this.preambleCache = new PreambleSnapshotCache(
        options.preambleCacheStore ? { store: options.preambleCacheStore } : {},
      )
    }
  }

  async init(): Promise<void> {
    if (this.worker) {
      throw new Error('Engine already initialized')
    }

    this.status = 'loading'

    await new Promise<void>((resolve, reject) => {
      this.worker = createEngineWorker(this.enginePath)

      this.worker.onmessage = (ev) => {
        this.dispatchWorkerMessage(ev.data as WorkerMessage, resolve, reject)
      }

      // Settle the init promise on a startup error AND (since this handler is never
      // re-armed) any spontaneous post-init worker crash — handleWorkerError rejects every
      // in-flight request so a pending compile() never hangs. After init resolves, `reject`
      // is a no-op; before, rejectAllPending is a no-op (nothing in flight) — both safe.
      this.worker.onerror = (err) => {
        reject(this.handleWorkerError(err))
      }
    })

    // Set TexLive endpoint — proxied through Vite dev server (/texlive/ → texlive:5001)
    // Note: do NOT use PdfTeXEngine's setTexliveEndpoint() — it has a bug
    // that nullifies the worker reference after posting the message
    this.worker!.postMessage({ cmd: 'settexliveurl', url: this.effectiveTexliveUrl })

    // Apply the preamble-snapshot opt-out before any compile runs. The worker
    // defaults to enabled, so we only need to message it when disabling.
    if (!this.preambleSnapshotEnabled) {
      this.worker!.postMessage({ cmd: 'setpreamblesnapshot', enabled: false })
    }

    // Build the effective warmup set: the durable cache (if enabled) rehydrated
    // from a previous session, merged with any caller-provided warmup cache.
    const warmup = await this.resolveWarmupCache()

    // Inject warmup cache (pre-fetched files + 404 entries + bloom filter) before other preloads
    if (warmup) {
      await this.injectWarmupCache(warmup)
    } else {
      // No warmup cache — fetch bloom filter directly
      await this.fetchAndSendBloomFilter()
    }

    // Pre-load format and pdftex.map in parallel — unless the warmup set already
    // carried the map (a replayed dependency set does), which saves a ~5 MB fetch.
    const preloads: Promise<void>[] = []
    if (!this.warmupPositiveSources.has('11/pdftex.map')) {
      preloads.push(
        this.preloadTexliveFile(
          11,
          'pdftex.map',
          `${resolveTexliveUrl(this.texliveUrl, this.version)}pdftex/11/pdftex.map`,
        ),
      )
    }
    if (!this.skipFormatPreload) {
      preloads.push(this.preloadFormat())
    }
    const receipt = this.preambleCache ? this.loadEngineBuildId() : Promise.resolve()
    await Promise.all([...preloads, receipt])
  }

  private async loadEngineBuildId(): Promise<void> {
    try {
      const response = await fetch(
        `${this.assetBaseUrl}wasmtex/${this.version}/BUILD-RECEIPT.pdftex.json`,
      )
      if (!response.ok) return
      const receipt = (await response.json()) as {
        buildId?: unknown
        family?: unknown
        texliveYear?: unknown
      }
      if (
        typeof receipt.buildId === 'string' &&
        /^[a-f0-9]{64}$/.test(receipt.buildId) &&
        receipt.family === 'pdftex' &&
        receipt.texliveYear === this.version
      ) {
        this.engineBuildId = receipt.buildId
      }
    } catch {
      // Receipt unavailable/malformed: durable preamble reuse stays disabled.
    }
  }

  /**
   * Dispatch a worker message to the appropriate handler.
   * Separated from init() to reduce cognitive complexity.
   */
  protected dispatchWorkerMessage(
    data: WorkerMessage,
    initResolve: () => void,
    initReject: (err: Error) => void,
  ): void {
    // Init message (no msgId) — the WASM postRun callback
    if (!data.cmd && !data.msgId) {
      if (data.result === 'ok') {
        this.status = 'ready'
        this.heapCheckpointsSupported =
          (data as { heapCheckpoints?: unknown }).heapCheckpoints === true
        initResolve()
      } else {
        this.status = 'error'
        initReject(new Error('Engine failed to initialize'))
      }
      return
    }

    // Dispatch by msgId (new protocol for parallel messages)
    if (data.msgId && this.deliverResponse(data.msgId, data)) {
      return
    }

    // Dispatch by cmd (legacy protocol for compile/readfile)
    if (data.cmd) {
      if (this.handleResolverMessage(data)) return
      if (data.cmd === 'downloading' && data.file) {
        this.persist.downloadCount++
        this.onFileDownload?.(data.file)
        return
      }

      this.deliverResponse(`cmd:${data.cmd}`, data)
    }
  }

  private handleResolverMessage(data: WorkerMessage): boolean {
    if (data.cmd === 'resolverready') {
      this.resolver.markSupported()
      return true
    }
    if (data.cmd === 'resolver' && data.evidence) {
      this.resolver.record(data.evidence)
      return true
    }
    return false
  }

  private async preloadFormat(): Promise<void> {
    try {
      const buf = await this.fetchGzWithProgress(this.formatPath)
      if (!buf) return
      await this.postMessageWithResponse({ cmd: 'loadformat', data: buf }, 'cmd:loadformat', [buf])
    } catch {
      // Format not available — worker will try building one at compile time
    }
  }

  /** Pre-load a texlive file into the worker's MEMFS cache. */
  private async preloadTexliveFile(format: number, filename: string, url: string): Promise<void> {
    try {
      const resp = await fetch(url)
      if (!resp.ok) return
      const buf = await resp.arrayBuffer()
      const msgId = `msg-${nextMsgId++}`
      await this.postMessageWithResponse(
        { cmd: 'preloadtexlive', format, filename, data: buf, source: 'warmup-cache', msgId },
        msgId,
        [buf],
      )
    } catch {
      // File not available — worker will fetch on demand via XHR
    }
  }

  /** Inject pre-fetched warmup cache into the worker. */
  protected async injectWarmupCache(cache: WarmupCache): Promise<void> {
    const promises: Promise<unknown>[] = []

    // Send each cached file to the worker via preloadtexlive.
    // Copy each buffer so the original cache stays usable across multiple init() calls.
    for (const file of cache.files) {
      const msgId = `msg-${nextMsgId++}`
      const buf = file.data.slice(0)
      promises.push(
        this.postMessageWithResponse(
          {
            cmd: 'preloadtexlive',
            format: file.format,
            filename: file.filename,
            data: buf,
            source:
              this.warmupPositiveSources.get(`${file.format}/${file.filename}`) ?? 'warmup-cache',
            msgId,
          },
          msgId,
          [buf],
        ),
      )
    }

    // Send 404 entries in a single batch.
    // Uses a timeout because old pre-built WASM workers won't have the
    // preload404 command and will silently ignore it (no response).
    const negativeGroups = [
      {
        source: 'warmup-negative' as const,
        entries: cache.notFound.filter(
          (entry) =>
            this.warmupNegativeSources.get(`${entry.format}/${entry.filename}`) !==
            'durable-negative',
        ),
      },
      {
        source: 'durable-negative' as const,
        entries: cache.notFound.filter(
          (entry) =>
            this.warmupNegativeSources.get(`${entry.format}/${entry.filename}`) ===
            'durable-negative',
        ),
      },
    ]
    for (const group of negativeGroups) {
      if (group.entries.length === 0) continue
      const msgId = `msg-${nextMsgId++}`
      const preload404 = this.postMessageWithResponse(
        { cmd: 'preload404', entries: group.entries, source: group.source, msgId },
        msgId,
      )
      // An old worker lacking the preload404 command never replies, so the
      // waiter registered under msgId would leak for the engine's lifetime.
      // On timeout, drop it (a no-op once deliverResponse already cleared it).
      const timeout = new Promise<void>((resolve) =>
        setTimeout(() => {
          this.pendingResponses.delete(msgId)
          resolve()
        }, 2000),
      )
      promises.push(Promise.race([preload404, timeout]))
    }

    // Send bloom filter to worker if available
    if (cache.bloomFilter) {
      const buf = cache.bloomFilter.slice(0)
      this.worker!.postMessage({ cmd: 'loadbloom', data: buf }, [buf])
    }

    await Promise.all(promises)
  }

  /** Fetch bloom filter from CDN and send it to the worker. */
  private async fetchAndSendBloomFilter(): Promise<void> {
    try {
      const url = `${resolveTexliveUrl(this.texliveUrl, this.version)}bloom-filter.bin`
      const resp = await fetch(url)
      if (!resp.ok) return
      const buf = await resp.arrayBuffer()
      // Retain a copy for the durable cache before the original is transferred.
      if (this.persistentCacheEnabled) this.bloomFilter = buf.slice(0)
      this.worker!.postMessage({ cmd: 'loadbloom', data: buf }, [buf])
    } catch {
      // Bloom filter not available — worker falls back to XHR for all lookups
    }
  }

  /**
   * Fetch a URL with optional download-progress tracking for the .fmt preload.
   */
  private async fetchGzWithProgress(url: string): Promise<ArrayBuffer | null> {
    try {
      const resp = await fetch(url)
      if (!resp.ok) return null
      const bytes = await readResponseWithProgress(resp, this.onProgress)
      return bytes.buffer as ArrayBuffer
    } catch {
      return null
    }
  }

  async mkdir(path: string): Promise<void> {
    this.checkInitialized()
    await this.postMessageWithResponse({ cmd: 'mkdir', url: path }, 'cmd:mkdir')
  }

  async writeFile(path: string, content: string | Uint8Array): Promise<void> {
    this.checkInitialized()
    this.projectFiles.set(path, content)
    if (typeof content === 'string') this.sources.set(path, content)
    if (this.activePreambleDependencies.has(path)) {
      this.loadedPreambleKey = null
      this.attemptedPreambleKey = null
      this.activePreambleDependencies.clear()
    }
    await this.postMessageWithResponse(
      { cmd: 'writefile', url: path, src: content },
      'cmd:writefile',
    )
  }

  setMainFile(path: string): void {
    this.checkInitialized()
    if (path !== this.mainFileName) {
      this.loadedPreambleKey = null
      this.attemptedPreambleKey = null
      this.activePreambleDependencies.clear()
    }
    this.mainFileName = path
    this.worker!.postMessage({ cmd: 'setmainfile', url: path })
  }

  /**
   * Enable or disable precompiled preamble snapshots at runtime.
   * When disabled, every compile re-runs the full preamble (no `.fmt` reuse).
   */
  setPreambleSnapshot(enabled: boolean): void {
    this.checkInitialized()
    this.preambleSnapshotEnabled = enabled
    if (!enabled) {
      this.loadedPreambleKey = null
      this.attemptedPreambleKey = null
      this.activePreambleDependencies.clear()
    }
    this.worker!.postMessage({ cmd: 'setpreamblesnapshot', enabled })
  }

  /** Whether preamble snapshots are currently enabled. */
  isPreambleSnapshotEnabled(): boolean {
    return this.preambleSnapshotEnabled
  }

  async flushCache(): Promise<void> {
    this.checkInitialized()
    await this.preamblePersistInFlight
    this.loadedPreambleKey = null
    this.attemptedPreambleKey = null
    this.activePreambleDependencies.clear()
    this.projectFiles.clear()
    this.sources.clear()
    this.worker!.postMessage({ cmd: 'flushcache' })
  }

  /**
   * Resolve the warmup set used to seed the worker: the durable cache (if
   * enabled) rehydrated from a previous session, merged with any caller-provided
   * `warmupCache`.
   */
  private async resolveWarmupCache(): Promise<WarmupCache | undefined> {
    let resolved = this.warmupCache
    if (this.persistentCacheEnabled) {
      this.durableCache = new PersistentCache({ version: this.version })
      try {
        const stored = await this.durableCache.load()
        if (stored) {
          resolved = resolved ? mergeWarmupCaches(stored, resolved) : stored
          // The durable set is already saved; don't re-persist until new downloads.
          this.persist.lastPersisted = 0
        }
      } catch {
        // Corrupt/unavailable durable cache — fall back to the provided warmup only.
      }
    }
    this.recordWarmupSources(resolved)
    if (resolved?.bloomFilter) this.bloomFilter = resolved.bloomFilter
    return resolved
  }

  private recordWarmupSources(resolved: WarmupCache | undefined): void {
    this.warmupPositiveSources.clear()
    this.warmupNegativeSources.clear()
    const callerFileKeys = new Set(
      this.warmupCache?.files.map((file) => `${file.format}/${file.filename}`) ?? [],
    )
    const callerNegativeKeys = new Set(
      this.warmupCache?.notFound.map((entry) => `${entry.format}/${entry.filename}`) ?? [],
    )
    for (const file of resolved?.files ?? []) {
      const key = `${file.format}/${file.filename}`
      this.warmupPositiveSources.set(
        key,
        callerFileKeys.has(key) ? 'warmup-cache' : 'persistent-cache',
      )
    }
    for (const entry of resolved?.notFound ?? []) {
      const key = `${entry.format}/${entry.filename}`
      this.warmupNegativeSources.set(
        key,
        callerNegativeKeys.has(key) ? 'warmup-negative' : 'durable-negative',
      )
    }
  }

  /**
   * Export the worker's in-memory TeX Live cache: every file fetched or
   * preloaded this session (by `format/name`) plus the accumulated 404 set.
   */
  async dumpTexliveCache(): Promise<WarmupCache> {
    this.checkInitialized()
    const msgId = `msg-${nextMsgId++}`
    const data = await this.postMessageWithResponse({ cmd: 'dumpcache', msgId }, msgId)
    const result: WarmupCache = { files: data.files ?? [], notFound: data.notFound ?? [] }
    if (this.bloomFilter) result.bloomFilter = this.bloomFilter
    return result
  }

  /** Persist the worker's current TeX Live cache to the durable store (if enabled). */
  async persistTexliveCache(): Promise<void> {
    if (!this.durableCache) return
    const dump = await this.dumpTexliveCache()
    await this.durableCache.save(dump)
  }

  /** Number of files the worker has reported downloading on demand this session. */
  getDownloadCount(): number {
    return this.persist.downloadCount
  }

  /** Clear the durable TeX Live cache for this version. */
  async clearCache(): Promise<void> {
    const cache =
      this.durableCache ??
      (isIndexedDbSupported() ? new PersistentCache({ version: this.version }) : null)
    await Promise.all([cache?.clear(), this.preambleCache?.clear()])
  }

  private maybePersistCache(): void {
    if (!this.durableCache) return
    // Advance the watermark only after a confirmed save, leaving it unadvanced on failure
    // so a later compile retries instead of treating un-saved files as persisted; the shared
    // helper also single-flight-guards overlapping saves. (See persist-watermark.ts.)
    void persistIfNeeded(this.persist, () => this.persistTexliveCache())
  }

  /** Build and return the base pdflatex format with this exact engine binary.
   *  Release tooling uses this instead of depending on an application-side event
   *  or reaching into the worker protocol directly. */
  async buildFormat(): Promise<Uint8Array> {
    this.checkReady()
    this.status = 'compiling'

    const data = await this.postMessageWithResponse({ cmd: 'compileformat' }, 'cmd:compile')
    this.status = 'ready'

    if (data.result !== 'ok' || data.status !== 0 || !data.pdf) {
      throw new Error(`Failed to build pdflatex format:\n${data.log || 'unknown engine error'}`)
    }
    return new Uint8Array(data.pdf)
  }

  /** True once the worker reported the Asyncify build (see the `heapCheckpoints` option). */
  get supportsHeapCheckpoints(): boolean {
    return this.heapCheckpointsSupported
  }

  /** Compile; on the checkpoint build, `checkpoints` asks the worker to keep a resumable
   *  state before reading each listed main-file line (reported in `result.heapCheckpoints`). */
  async compile(options?: {
    checkpoints?: Array<{ id: string; line: number }>
  }): Promise<CompileResult> {
    const checkpoints = options?.checkpoints?.length ? options.checkpoints : undefined
    return this.runCompile(
      checkpoints ? { cmd: 'compilelatex', checkpoints } : { cmd: 'compilelatex' },
    )
  }

  /** Resume a compile from a checkpoint taken earlier (#81): the worker restores that
   *  state, reads the rest of the main file as the host last wrote it, and finishes the
   *  run like a normal compile - a complete PDF and SyncTeX, no splicing. The caller
   *  guarantees the checkpoint is still valid (unchanged bytes before its line, unchanged
   *  inputs). Further `checkpoints` after the resume line can be taken on the way. */
  async compileFromHeapCheckpoint(
    id: string,
    checkpoints?: Array<{ id: string; line: number }>,
  ): Promise<CompileResult> {
    if (!this.heapCheckpointsSupported) {
      throw new Error('heap checkpoints are not supported by this engine')
    }
    return this.runCompile({
      cmd: 'compileheapcheckpoint',
      id,
      ...(checkpoints?.length ? { checkpoints } : {}),
    })
  }

  /** Free checkpoints in the worker (all when `ids` is omitted). */
  async dropHeapCheckpoints(ids?: string[]): Promise<void> {
    if (!this.worker || !this.heapCheckpointsSupported) return
    await this.postMessageWithResponse(
      { cmd: 'dropheapcheckpoints', ids },
      'cmd:dropheapcheckpoints',
    )
  }

  private async runCompile(command: Record<string, unknown>): Promise<CompileResult> {
    this.checkReady()
    const durablePreambleKey = this.preambleCache ? await this.restorePersistentPreamble() : null
    this.status = 'compiling'
    const start = performance.now()
    this.resolver.begin()
    const data = await this.postMessageWithResponse(command, 'cmd:compile')
    const resolver = this.resolver.finish()
    this.completionObservation = Array.isArray(data.completionObservations)
      ? parseEngineCompletionObservation(data.completionObservations)
      : null

    this.status = 'ready'
    const compileTime = performance.now() - start
    const log = data.log || ''
    // pdfTeX status 0 is success, 1 is warnings/non-fatal errors.
    // Both can produce valid PDF output.
    const success = data.result === 'ok' && (data.status === 0 || data.status === 1)
    // Only wrap real PDF bytes: `data.result === 'ok'` without a `pdf` field (a compile that
    // produced no pages) must map to null, not `new Uint8Array(undefined)` (a 0-byte buffer
    // that downstream `if (result.pdf)` checks would treat as a renderable PDF).
    const pdf = data.pdf ? new Uint8Array(data.pdf) : null
    // A successful compile may produce no .synctex file (synctex off / no output);
    // the worker then omits the field, so map it to null rather than an empty array.
    const synctex = data.synctex ? new Uint8Array(data.synctex) : null
    const format = success && data.format ? new Uint8Array(data.format) : undefined
    const errors = parseTexErrors(log)
    const preambleSnapshot = !!data.preambleSnapshot
    const preambleRebuilt = !!data.preambleRebuilt

    const result: CompileResult = {
      success,
      pdf,
      log,
      errors,
      compileTime,
      synctex,
      format,
      preambleSnapshot,
      preambleRebuilt,
    }
    const phaseTimings = this.validPhaseTimings(data.phaseTimings)
    if (phaseTimings) result.phaseTimings = phaseTimings
    applyHeapCheckpoints(result, data)
    applyEngineCommandObservation(result, data)
    applyRecorderObservation(result, data)
    if (data.semanticTrace) {
      result.semanticTrace = data.semanticTrace
    }
    const glyphGaps = parseGlyphGaps(log)
    if (glyphGaps.length > 0) {
      enrichGlyphSuggestions(glyphGaps)
      result.glyphCoverage = { gaps: glyphGaps }
    }
    // Source-based dependency enrichment: with a cached preamble snapshot, packages
    // load during the format build, so their `(...)` opens are absent from this
    // compile's log — the source's `\usepackage` declarations recover them.
    result.telemetry = {
      diagnostics: buildDiagnostics(log, glyphGaps),
      ...resolverTelemetry(resolver),
      dependencies: buildDependencyGraph(log, {
        inputFiles: result.inputFiles,
        source: this.sources.get(this.mainFileName),
      }),
    }

    // Built-in persistent cache: after a successful compile that fetched new
    // files, durably persist the worker's cache (non-blocking, best-effort).
    if (success) this.maybePersistCache()
    if (
      success &&
      preambleRebuilt &&
      durablePreambleKey &&
      data.preambleFormat &&
      data.preambleHash &&
      data.preambleInputFiles
    ) {
      this.persistPreambleSnapshot(
        durablePreambleKey,
        data.preambleFormat,
        data.preambleHash,
        data.preambleInputFiles,
      )
    }

    return result
  }

  private validPhaseTimings(value: unknown): CompileResult['phaseTimings'] | null {
    if (!value || typeof value !== 'object') return null
    const candidate = value as Record<string, unknown>
    const read = (field: string): number | null => {
      const number = candidate[field]
      return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null
    }
    const workerTotalMs = read('workerTotalMs')
    const heapRestoreMs = read('heapRestoreMs')
    const heapSnapshotMs = read('heapSnapshotMs')
    const heapSnapshotBytes = read('heapSnapshotBytes')
    const heapSizeBytes = read('heapSizeBytes')
    const preambleBuildMs = read('preambleBuildMs')
    const formatInstallMs = read('formatInstallMs')
    const preambleExportMs = read('preambleExportMs')
    const postProcessMs = read('postProcessMs')
    const texRunMs = read('texRunMs')
    if (
      workerTotalMs === null ||
      heapRestoreMs === null ||
      heapSnapshotMs === null ||
      heapSnapshotBytes === null ||
      heapSizeBytes === null ||
      preambleBuildMs === null ||
      formatInstallMs === null ||
      preambleExportMs === null ||
      postProcessMs === null ||
      texRunMs === null
    ) {
      return null
    }
    return {
      workerTotalMs,
      heapRestoreMs,
      heapSnapshotMs,
      heapSnapshotBytes,
      heapSizeBytes,
      preambleBuildMs,
      formatInstallMs,
      preambleExportMs,
      postProcessMs,
      texRunMs,
      ...(candidate.checkpointResume === true ? { checkpointResume: true } : {}),
    }
  }

  private async currentPreambleKey(): Promise<string | null> {
    if (!this.preambleCache || !this.engineBuildId || !this.preambleMirrorRevision) return null
    const source = this.sources.get(this.mainFileName)
    if (!source) return null
    const split = extractPreamble(source)
    if (!split) return null
    return durablePreambleKey(
      {
        engineBuildId: this.engineBuildId,
        mirrorRevision: this.preambleMirrorRevision,
        texliveUrl: this.effectiveTexliveUrl,
        texliveYear: this.version,
      },
      split.preamble,
    )
  }

  private async restorePersistentPreamble(): Promise<string | null> {
    if (!this.preambleSnapshotEnabled || !this.preambleCache) return null
    const key = await this.currentPreambleKey()
    if (!key || key === this.loadedPreambleKey || key === this.attemptedPreambleKey) return key
    this.attemptedPreambleKey = key
    const snapshot = await this.preambleCache.load(key).catch(() => null)
    if (!snapshot || !(await this.dependenciesMatch(snapshot.projectDependencies))) return key
    const format = snapshot.format.slice(0)
    const response = await this.postMessageWithResponse(
      {
        cmd: 'loadpreamblesnapshot',
        format,
        hash: snapshot.workerHash,
        inputFiles: snapshot.inputFiles,
      },
      'cmd:loadpreamblesnapshot',
      [format],
    )
    if (response.result === 'ok') {
      this.loadedPreambleKey = key
      this.activePreambleDependencies = new Set(
        snapshot.projectDependencies.map((dependency) => dependency.path),
      )
    }
    return key
  }

  private async dependenciesMatch(
    dependencies: ReadonlyArray<{ path: string; sha256: string }>,
  ): Promise<boolean> {
    const actual = await Promise.all(
      dependencies.map(async (dependency) => {
        const content = this.projectFiles.get(dependency.path)
        return content === undefined ? null : preambleSha256(content)
      }),
    )
    return actual.every((digest, index) => digest === dependencies[index]!.sha256)
  }

  private persistPreambleSnapshot(
    key: string,
    format: ArrayBuffer,
    workerHash: string,
    inputFiles: string[],
  ): void {
    const cache = this.preambleCache
    if (!cache) return
    const paths = [
      ...new Set(
        inputFiles
          .map(normalizeProjectDependencyPath)
          .filter((path): path is string => !!path && this.projectFiles.has(path)),
      ),
    ].sort()
    this.activePreambleDependencies = new Set(paths)
    const task = Promise.all(
      paths.map(async (path) => ({
        path,
        sha256: await preambleSha256(this.projectFiles.get(path)!),
      })),
    )
      .then((projectDependencies) =>
        cache.save({ key, workerHash, format, inputFiles, projectDependencies }),
      )
      .then(() => {
        this.loadedPreambleKey = key
        this.attemptedPreambleKey = key
      })
      .catch(() => {})
    const tracked = task.finally(() => {
      if (this.preamblePersistInFlight === tracked) this.preamblePersistInFlight = null
    })
    this.preamblePersistInFlight = tracked
  }

  getCompletionObservation(): EngineCompletionObservation | null {
    return this.completionObservation ? structuredClone(this.completionObservation) : null
  }

  /**
   * Build a mid-document checkpoint (#55): run `headText + \dump` in INITEX to capture
   * the engine state at a page boundary as a bootable format, plus the head PDF (pages
   * up to the boundary). `headText` MUST end at an existing page break (\clearpage etc.)
   * and a full compile must have run first (seeds the labels via main.aux).
   */
  async buildCheckpoint(
    headText: string,
  ): Promise<{ fmt: Uint8Array; headPdf: Uint8Array | null }> {
    this.checkInitialized()
    const data = await this.postMessageWithResponse(
      { cmd: 'buildcheckpoint', headText },
      'cmd:buildcheckpoint',
    )
    if (data.result !== 'ok' || !data.fmt) {
      const tail = (data.log || '').split('\n').slice(-3).join(' ')
      throw new Error(`buildCheckpoint failed (status ${data.status}): ${tail}`)
    }
    return {
      fmt: new Uint8Array(data.fmt),
      headPdf: data.headPdf ? new Uint8Array(data.headPdf) : null,
    }
  }

  /**
   * Boot a checkpoint format and typeset only the tail (#55). Returns the tail PDF
   * (the host splices it after the checkpoint's head PDF). The `fmt` buffer is copied
   * before transfer so the caller can reuse it across many edits.
   */
  async compileFromCheckpoint(
    fmt: Uint8Array,
    tailText: string,
  ): Promise<{ pdf: Uint8Array | null; synctex: Uint8Array | null; status: number; log: string }> {
    this.checkInitialized()
    const fmtCopy = fmt.slice().buffer
    const data = await this.postMessageWithResponse(
      { cmd: 'compilefromcheckpoint', fmt: fmtCopy, tailText },
      'cmd:compilefromcheckpoint',
      [fmtCopy],
    )
    return {
      pdf: data.pdf ? new Uint8Array(data.pdf) : null,
      synctex: data.synctex ? new Uint8Array(data.synctex) : null,
      status: data.status ?? -1,
      log: data.log || '',
    }
  }

  async readFile(path: string): Promise<string | null> {
    this.checkInitialized()

    const data = await this.postMessageWithResponse({ cmd: 'readfile', url: path }, 'cmd:readfile')

    return data.result === 'ok' ? (data.data ?? null) : null
  }

  isReady(): boolean {
    return this.status === 'ready'
  }

  /** Guard for compile() — must be 'ready' (not already compiling) */
  private checkReady(): void {
    if (this.status !== 'ready') {
      throw new Error(`Engine not ready (status: ${this.status})`)
    }
  }

  /** Guard for writeFile/mkdir/setMainFile — worker must exist (ready or compiling) */
  private checkInitialized(): void {
    if (!this.worker || this.status === 'unloaded' || this.status === 'loading') {
      throw new Error(`Engine not initialized (status: ${this.status})`)
    }
  }
}
