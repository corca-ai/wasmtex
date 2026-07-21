import { CachedTexliveFile, CompileResult, TexliveFileEntry, TexliveVersion, WarmupCache } from '../types';
import { BaseWorkerEngine } from './base-worker-engine';
import { CompileEngine } from './compile-engine';
export interface WasmTexEngineOptions {
    /** TeX Live version to use. Defaults to '2025'. */
    texliveVersion?: TexliveVersion;
    /** WASM binary to load. Defaults to 'pdftex'. 'xetex'/'luatex' select
     *  the corresponding Unicode engine worker. */
    engineBinary?: 'pdftex' | 'xetex' | 'luatex';
    /** Base URL for WASM assets. Defaults to `import.meta.env.BASE_URL`. */
    assetBaseUrl?: string;
    /** TexLive server endpoint. Defaults to `${location.origin}${BASE_URL}texlive/`. */
    texliveUrl?: string;
    /** If true, do not attempt to preload the base .fmt file. */
    skipFormatPreload?: boolean;
    /** If true, disable precompiled preamble snapshots and always run a full
     *  compile. An escape hatch for documents incompatible with preamble
     *  precompilation. Defaults to false (snapshots enabled). */
    disablePreambleSnapshot?: boolean;
    /** Pre-fetched TeX Live files from `warmup()`. */
    warmupCache?: WarmupCache;
    /** Enable the built-in persistent (IndexedDB) cache of fetched TeX Live assets.
     *  Rehydrates on init and auto-persists after compiles that fetched new files,
     *  so return visits are near-instant and work offline. Silently no-ops where
     *  IndexedDB is unavailable. Defaults to false. */
    persistentCache?: boolean;
}
/** Incoming response message from the WASM worker. */
interface WorkerMessage {
    result?: string;
    status?: number;
    cmd?: string;
    msgId?: string;
    file?: string;
    log?: string;
    pdf?: ArrayBuffer;
    synctex?: ArrayBuffer;
    format?: ArrayBuffer;
    /** Checkpoint format + head PDF (incremental compile, #55). */
    fmt?: ArrayBuffer;
    headPdf?: ArrayBuffer;
    data?: string;
    preambleSnapshot?: boolean;
    preambleRebuilt?: boolean;
    engineCommands?: string[];
    inputFiles?: string[];
    semanticTrace?: string;
    files?: CachedTexliveFile[];
    notFound?: TexliveFileEntry[];
}
/** Merge two warmup caches; `override` entries win on key collisions.
 *  Exported for unit testing — the merge must keep `files` and `notFound`
 *  disjoint (the worker resolves a 404 before a preloaded file). */
export declare function mergeWarmupCaches(base: WarmupCache, override: WarmupCache): WarmupCache;
export declare class WasmTexPdftexEngine extends BaseWorkerEngine<WorkerMessage> implements CompileEngine {
    private formatPath;
    private skipFormatPreload;
    private version;
    private warmupCache;
    private preambleSnapshotEnabled;
    private persistentCacheEnabled;
    private durableCache;
    private bloomFilter;
    /** Main file name, tracked for source-based dependency extraction. */
    private mainFileName;
    /** Last-written text sources, so dependency extraction can read the main source
     *  synchronously (no worker round-trip). */
    private readonly sources;
    /** Download/persist watermark (drives auto-persist; single-flight guarded). */
    private readonly persist;
    onFileDownload?: (filename: string) => void;
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    /**
     * Dispatch a worker message to the appropriate handler.
     * Separated from init() to reduce cognitive complexity.
     */
    protected dispatchWorkerMessage(data: WorkerMessage, initResolve: () => void, initReject: (err: Error) => void): void;
    private preloadFormat;
    /** Pre-load a texlive file into the worker's MEMFS cache. */
    private preloadTexliveFile;
    /** Inject pre-fetched warmup cache into the worker. */
    protected injectWarmupCache(cache: WarmupCache): Promise<void>;
    /** Fetch bloom filter from CDN and send it to the worker. */
    private fetchAndSendBloomFilter;
    /**
     * Fetch a URL with optional download-progress tracking for the .fmt preload.
     */
    private fetchGzWithProgress;
    mkdir(path: string): Promise<void>;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    setMainFile(path: string): void;
    /**
     * Enable or disable precompiled preamble snapshots at runtime.
     * When disabled, every compile re-runs the full preamble (no `.fmt` reuse).
     */
    setPreambleSnapshot(enabled: boolean): void;
    /** Whether preamble snapshots are currently enabled. */
    isPreambleSnapshotEnabled(): boolean;
    flushCache(): Promise<void>;
    /**
     * Resolve the warmup set used to seed the worker: the durable cache (if
     * enabled) rehydrated from a previous session, merged with any caller-provided
     * `warmupCache`.
     */
    private resolveWarmupCache;
    /**
     * Export the worker's in-memory TeX Live cache: every file fetched or
     * preloaded this session (by `format/name`) plus the accumulated 404 set.
     */
    dumpTexliveCache(): Promise<WarmupCache>;
    /** Persist the worker's current TeX Live cache to the durable store (if enabled). */
    persistTexliveCache(): Promise<void>;
    /** Number of files the worker has reported downloading on demand this session. */
    getDownloadCount(): number;
    /** Clear the durable TeX Live cache for this version. */
    clearCache(): Promise<void>;
    private maybePersistCache;
    /** Build and return the base pdflatex format with this exact engine binary.
     *  Release tooling uses this instead of depending on an application-side event
     *  or reaching into the worker protocol directly. */
    buildFormat(): Promise<Uint8Array>;
    compile(): Promise<CompileResult>;
    /**
     * Build a mid-document checkpoint (#55): run `headText + \dump` in INITEX to capture
     * the engine state at a page boundary as a bootable format, plus the head PDF (pages
     * up to the boundary). `headText` MUST end at an existing page break (\clearpage etc.)
     * and a full compile must have run first (seeds the labels via main.aux).
     */
    buildCheckpoint(headText: string): Promise<{
        fmt: Uint8Array;
        headPdf: Uint8Array | null;
    }>;
    /**
     * Boot a checkpoint format and typeset only the tail (#55). Returns the tail PDF
     * (the host splices it after the checkpoint's head PDF). The `fmt` buffer is copied
     * before transfer so the caller can reuse it across many edits.
     */
    compileFromCheckpoint(fmt: Uint8Array, tailText: string): Promise<{
        pdf: Uint8Array | null;
        synctex: Uint8Array | null;
        status: number;
        log: string;
    }>;
    readFile(path: string): Promise<string | null>;
    isReady(): boolean;
    /** Guard for compile() — must be 'ready' (not already compiling) */
    private checkReady;
    /** Guard for writeFile/mkdir/setMainFile — worker must exist (ready or compiling) */
    private checkInitialized;
}
export {};
