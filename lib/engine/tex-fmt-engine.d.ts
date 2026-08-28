import { CompileResult, CompletionSnapshotProfile, EngineStatus, ResolverEvidenceReport, TexliveVersion } from '../types';
import { CompileEngine } from './compile-engine';
import { WasmTexEngineOptions } from './wasmtex-engine';
import { CompileWorkerDriver } from './wasmtex-worker';
/**
 * Build a {@link CompileWorkerDriver} for a WasmTex engine binary (`xetex`,
 * `dvipdfm`, `luatex`) from the shared engine options, resolving the asset URL,
 * TeX Live version and server endpoint the same way for every Unicode engine.
 */
export declare function createCompileWorker(binary: 'xetex' | 'dvipdfm' | 'luatex', options: WasmTexEngineOptions): CompileWorkerDriver;
/**
 * URL of a prebuilt format asset shipped next to the
 * engine JS/WASM. Resolved like {@link createCompileWorker} so a preloaded format
 * and its engine always come from the same asset dir.
 */
export declare function unicodeFormatUrl(binary: 'xetex' | 'luatex', options: WasmTexEngineOptions): string;
/**
 * Built-in warmup plan for a Unicode engine: the TeX Live files a cold first
 * compile fetches. The engine prefetches them in parallel (overlapping worker
 * boot) and injects them so the worker never blocks on sync XHR.
 */
export interface TexFmtWarmupPlan {
    /** Resolved CDN endpoint (e.g. `https://…/2025/`). */
    texliveUrl: string;
    /** Files that 200 during a first compile, with their CDN format dir. */
    preload: ReadonlyArray<{
        format: number;
        name: string;
        dir: string;
    }>;
    /** Lookups that 404/403 during a first compile (pre-seeded to skip XHR). */
    notFound: ReadonlyArray<{
        format: number;
        filename: string;
    }>;
    /** Max parallel prefetch requests. Defaults to 8. */
    concurrency?: number;
}
export declare abstract class BaseTexFmtEngine implements CompileEngine {
    protected tex: CompileWorkerDriver;
    /** Filename under which the built format is re-injected for `compilelatex`
     *  (e.g. `wasmtex-xetex.fmt`, `wasmtex-luatex.fmt`). */
    private readonly fmtFile;
    protected mainBase: string;
    /** Last-written text sources, kept so dependency extraction can read the main
     *  source synchronously (no worker round-trip). */
    private readonly sources;
    /** Built LaTeX format dump, cached after the first `compileformat` (or
     *  preloaded from a shipped `.fmt` asset, skipping `compileformat` entirely). */
    private fmtBytes;
    /** Whether {@link fmtBytes} is currently written into the worker's work dir.
     *  Reset by {@link clearInjectedFormat} when flushCache wipes the dir. */
    private fmtInjected;
    /** URL of a prebuilt format to preload at init, if any. */
    private readonly formatUrl;
    /** Built-in warmup plan (bloom filter + parallel prefetch), if any. */
    private readonly warmup;
    /** The warmup/durable set resolved at init, retained so an auxiliary worker (e.g. xetex's
     *  dvipdfmx) can be rehydrated from it after *its* own init completes. */
    private lastWarmSet;
    /** Durable IndexedDB cache of fetched assets (when persistentCache is on). */
    private durableCache;
    /** Bloom-filter bytes retained so the durable cache can store them too. */
    private bloomBytes;
    /** Files the worker has reported fetching this session; drives auto-persist (shape matches
     *  PersistState; inferred so this engine and WasmTexPdftexEngine don't share an import block). */
    private readonly persist;
    protected readonly resolverProfile: CompletionSnapshotProfile;
    onProgress?: (progress: number) => void;
    onFileDownload?: (filename: string) => void;
    protected constructor(tex: CompileWorkerDriver, fmtFile: string, formatUrl?: string, warmup?: TexFmtWarmupPlan, persistentCache?: {
        version: TexliveVersion;
    }, resolverProfile?: CompletionSnapshotProfile);
    abstract init(): Promise<void>;
    abstract compile(): Promise<CompileResult>;
    abstract flushCache(): Promise<void>;
    abstract terminate(): void;
    /** Wire callbacks, boot the worker, and — overlapping that boot — fetch the
     *  prebuilt format and warmup assets; then inject the warmup set once the
     *  worker is ready. A populated durable cache (a prior session) is preferred
     *  over a CDN prefetch, so return visits do ~zero network. */
    protected initTex(): Promise<void>;
    /** Count a file fetched by an auxiliary worker (e.g. xetex's dvipdfmx) toward the
     *  auto-persist watermark, so a compile whose only new fetches came from that worker still
     *  persists instead of being skipped by maybePersist's "nothing new" guard. */
    protected bumpDownloadCount(): void;
    /** Auxiliary workers whose TeX Live caches must be persisted/rehydrated alongside the
     *  primary {@link tex} worker. Base: none. XeLaTeX overrides this with its dvipdfmx worker,
     *  which fetches and embeds fonts the primary XeTeX worker never caches. */
    protected extraCacheDrivers(): CompileWorkerDriver[];
    /** Rehydrate an auxiliary worker from the durable/warmup set resolved at init. Call only
     *  AFTER that worker's own init() so its preload queue is live — preloads are fire-and-forget
     *  and a not-yet-ready worker silently drops them. */
    protected rehydrateExtraDriver(driver: CompileWorkerDriver): void;
    /** Load the durable cache (if enabled) from a prior session. The durable set is
     *  already on disk, so don't re-persist until new files are fetched. */
    private loadDurable;
    private durableToAssets;
    /** Fetch a prebuilt format asset into {@link fmtBytes} so the first compile
     *  skips the expensive per-session `compileformat`. Prefers a gzipped
     *  `<fmt>.gz` (format files are large and compress ~5×), decompressing in the
     *  browser; falls back to the plain `.fmt`. Best-effort: a missing or failed
     *  fetch leaves `fmtBytes` null and {@link ensureFormat} builds it. */
    private preloadFormat;
    /** Fetch & decompress the gzipped `<fmt>.gz` variant, or null to fall back to the plain
     *  `.fmt`. Only attempted when DecompressionStream exists: without it, a server serving
     *  `.gz` raw would leave the bytes gzip-compressed, and looksLikeFormat (length + non-'<'
     *  first byte) would wrongly accept the gzip-magic blob — booting the engine from garbage
     *  and suppressing the plain-.fmt fallback. Mirrors fetchGzWithFallback's gate. */
    private tryPreloadGzFormat;
    /** Guard against a server returning 200 + an HTML/SPA-fallback page for a
     *  missing format asset: a real `.fmt` is multi-MB and not HTML. Rejecting it
     *  keeps {@link ensureFormat} on the graceful build-from-source path. */
    private looksLikeFormat;
    /** Prefetch the bloom filter and every warmup file in parallel (worker not
     *  needed yet). Best-effort: failures just fall back to on-demand sync XHR. */
    private fetchWarmupAssets;
    /** Send the resolved warmup set to the worker (worker must be ready). The
     *  worker handles these FIFO before any later `compilelatex`, so the sends are
     *  fire-and-forget — no reply to await, and a stale worker simply ignores them
     *  and fetches on demand. */
    private injectWarmupAssets;
    /** Persist the worker caches to the durable store, but only when new files were fetched
     *  since the last persist. Dumps the primary {@link tex} worker plus every
     *  {@link extraCacheDrivers} worker and merges them, so e.g. XeLaTeX's dvipdfmx-fetched
     *  fonts are saved too. Best-effort and non-blocking. */
    protected maybePersist(): void;
    /** Build the LaTeX format once (`compileformat`), caching the bytes; then make
     *  it available to `compilelatex` under {@link fmtFile}. Returns the build log
     *  (empty on a cache hit). The multi-MB `.fmt` is written into the work dir only
     *  once per session — it persists in MEMFS across recompiles (the work dir is
     *  wiped only by {@link clearInjectedFormat} on flushCache), so re-writing it on
     *  every body edit would just burn time. */
    protected ensureFormat(): Promise<string>;
    /** Mark the injected format as gone (call after a flushCache wipes the work
     *  dir) so the next {@link ensureFormat} re-injects it. */
    protected clearInjectedFormat(): void;
    protected result(success: boolean, pdf: Uint8Array | null, log: string, start: number, inputFiles?: string[], inputFilesComplete?: boolean, resolverReports?: ReadonlyArray<ResolverEvidenceReport | undefined>): CompileResult;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    /** The main `.tex` source as last written, for dependency extraction. */
    protected mainSource(): string | undefined;
    mkdir(path: string): Promise<void>;
    setMainFile(path: string): void;
    readFile(path: string): Promise<string | null>;
    clearCache(): Promise<void>;
    /** Whether the durable (IndexedDB) cache is active — i.e. `persistentCache`
     *  was requested AND IndexedDB is available. Lets hosts/tests verify that an
     *  engine actually rehydrates and persists rather than silently no-opping. */
    isPersistentCacheEnabled(): boolean;
    getStatus(): EngineStatus;
}
