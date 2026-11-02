import { CompileResult, CompletionSnapshotProfile, EngineStatus, ResolverEvidenceReport, TexliveVersion, WarmupCache } from '../types.js';
import { CompileEngine } from './compile-engine.js';
import { WasmTexEngineOptions } from './wasmtex-engine.js';
import { CompileWorkerDriver } from './wasmtex-worker.js';
/**
 * Build a {@link CompileWorkerDriver} for a WasmTex engine binary (`xetex`,
 * `dvipdfm`, `luatex`) from the shared engine options, resolving the asset URL,
 * TeX Live version and server endpoint the same way for every Unicode engine.
 */
export declare function createCompileWorker(binary: 'xetex' | 'dvipdfm' | 'luatex', options: WasmTexEngineOptions): CompileWorkerDriver;
/**
 * URL of a prebuilt format asset shipped next to the
 * engine JS/WASM. Resolved like {@link createCompileWorker} so a preloaded format
 * and its engine share an asset dir unless the host supplies a compatible format base.
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
/** A resolved warmup set ready to inject: a bloom filter, prefetched files, and
 *  known-missing entries — sourced from the CDN (cold) or the durable cache. */
export interface TexFmtWarmSet {
    bloom: ArrayBuffer | null;
    files: Array<{
        format: number;
        filename: string;
        data: ArrayBuffer;
    }>;
    notFound: ReadonlyArray<{
        format: number;
        filename: string;
    }>;
    source: 'warmup-cache' | 'persistent-cache';
}
/** Suffix of the separate job a page preview runs as. */
export declare const PREVIEW_JOB_SUFFIX = "-wasmtex-preview";
/** Job-named inputs a full pass read, e.g. `./main.aux` -> `aux`. */
export declare function jobInputExtensions(inputFiles: readonly string[] | undefined, job: string): string[];
/** How an engine wraps its terminal transcript at 79 columns: XeTeX counts
 *  characters, LuaTeX counts bytes. */
export type TranscriptWrap = 'characters' | 'bytes';
/**
 * Each project `.tex` file's first physical page, and every shipped page's
 * `\\count0`, from a full pass's terminal transcript. A page announces itself as
 * ` [n` and a file opening as `(./path`. The excerpt line after an over/underfull
 * box warning is skipped, since its text can hold ` [12]`. Null when the count
 * disagrees with the transcript's own `Output written on … (N pages`.
 */
export declare function transcriptPages(log: string, wrap: TranscriptWrap): {
    starts: Map<string, number>;
    numbers: number[];
} | null;
/**
 * Typeset only the `\include`d `chapter`: `\includeonly` restores the other
 * chapters' counters from their aux files and earlier pages are discarded. A blank
 * `openright` page before the chapter heading carries no new left mark, so it is
 * discarded too: its running head would show the previous mark, not the omitted
 * chapter's. The job stops after `cap` kept pages or at the end of the chapter.
 * With one chapter included, the unnamed include hooks are its own (named ones do
 * not parse a name containing `/`).
 */
export declare function chapterPreviewHook(chapter: string, stop: string, cap: number): string;
/** The first chapter entry an aux file writes to the contents: its number, title,
 *  page and anchor, which a preview must reproduce. */
export declare function firstChapterEntry(aux: string | null): string | null;
/** A page preview and the physical page of the full PDF its first page replaces
 *  (1 for a prefix). */
export type ChapterPreviewResult = CompileResult & {
    firstPage?: number;
};
/** A preview job's names, timing and raw worker result. */
export interface PreviewRun {
    job: string;
    main: string;
    start: number;
    fmtLog: string;
    run: Awaited<ReturnType<CompileWorkerDriver['run']>>;
}
export declare abstract class BaseTexFmtEngine implements CompileEngine {
    protected tex: CompileWorkerDriver;
    /** Filename under which the built format is re-injected for `compilelatex`
     *  (e.g. `wasmtex-xetex.fmt`, `wasmtex-luatex.fmt`). */
    private readonly fmtFile;
    protected mainBase: string;
    /** What this worker's last successful full pass read. A preview needs those files, so
     *  a worker that has not finished one (e.g. created after an interrupted compile)
     *  offers none. */
    private fullPass;
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
    /** Retain caller warmup for reinitialization; caller buffers must never be detached. */
    private readonly suppliedWarmup;
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
        texliveUrl: string;
    }, resolverProfile?: CompletionSnapshotProfile, suppliedWarmup?: WarmupCache);
    abstract init(): Promise<void>;
    abstract compile(): Promise<CompileResult>;
    abstract flushCache(): Promise<void>;
    abstract terminate(): void;
    /** Wire callbacks, boot the worker, and — overlapping that boot — fetch the
     *  prebuilt format and warmup assets; then inject the warmup set once the
     *  worker is ready. A populated durable cache (a prior session) is preferred
     *  over a CDN prefetch, so return visits do ~zero network. */
    protected initTex(): Promise<TexFmtWarmSet[]>;
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
    protected rehydrateExtraDriver(driver: CompileWorkerDriver, warmSets: TexFmtWarmSet[]): void;
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
    /** The work directory was wiped: the format and the full pass's outputs are gone. */
    protected clearInjectedFormat(): void;
    protected result(success: boolean, pdf: Uint8Array | null, log: string, start: number, inputFiles?: string[], inputFilesComplete?: boolean, resolverReports?: ReadonlyArray<ResolverEvidenceReport | undefined>): CompileResult;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    /** The main `.tex` source as last written, for dependency extraction. */
    protected mainSource(): string | undefined;
    mkdir(path: string): Promise<void>;
    setMainFile(path: string): void;
    readFile(path: string): Promise<string | null>;
    protected jobName(): string;
    /** Record a successful full pass's inputs, in recorder order. Project `.tex` files read
     *  before the job's `.aux` (which `\\begin{document}` reads) belong to the preamble. */
    protected recordFullPass(inputFiles: readonly string[] | undefined, log: string, wrap: TranscriptWrap): void;
    /** Whether the last full pass read `path` in the preamble; unknown counts as read. */
    readsInPreamble(path: string): boolean;
    /**
     * Run the current main source, prefixed by `hook` on its first line, as a separate
     * preview job beside the main file, then restore the main file. The job starts from
     * copies of the last full pass's job-named inputs, so its references match that pass
     * while the full pass's own auxiliary files stay untouched. Null means there is no
     * main source or no full pass on this worker: run `compile()` instead.
     */
    protected runPreviewJob(hook: string, beforeRun?: (job: string) => Promise<void>, { cold }?: {
        cold?: boolean;
    }): Promise<PreviewRun | null>;
    /** The physical page where `chapter` starts in the full PDF, or null when a chapter
     *  preview cannot be placed: no trusted pages, a refused chapter, or a start past
     *  the page limit. */
    protected chapterStart(chapter: string, pageLimit: number): number | null;
    /** Stop offering `chapter` previews until the next full pass. */
    refuseChapter(chapter: string): void;
    /** Where a successful chapter preview belongs, or null (refusing the chapter) when
     *  its first page number or its contents entry disagrees with the full pass. A
     *  leading blank page it discarded shifts it by one. */
    protected placeChapter(chapter: string, start: number, previewLog: string, wrap: TranscriptWrap, entries: [preview: string | null, full: string | null]): number | null;
    /** The author's errors must match the full pass's, which name the real main file. */
    protected attributePreviewErrors(result: CompileResult, previewMain: string): CompileResult;
    clearCache(): Promise<void>;
    /** Whether the durable (IndexedDB) cache is active — i.e. `persistentCache`
     *  was requested AND IndexedDB is available. Lets hosts/tests verify that an
     *  engine actually rehydrates and persists rather than silently no-opping. */
    isPersistentCacheEnabled(): boolean;
    getStatus(): EngineStatus;
}
