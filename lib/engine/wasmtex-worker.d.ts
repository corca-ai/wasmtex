import { CachedTexliveFile, TexliveFileEntry, TexliveVersion } from '../types';
import { BaseWorkerEngine } from './base-worker-engine';
/** Messages exchanged with a WasmTex engine worker. */
export interface WasmTexWorkerMsg {
    result?: string;
    cmd?: string;
    status?: number;
    log?: string;
    pdf?: ArrayBuffer;
    data?: string;
    file?: string;
    /** dumpcache response: fetched files + known-missing entries. */
    files?: CachedTexliveFile[];
    notFound?: TexliveFileEntry[];
}
/**
 * Shared driver for WasmTex workers (BibTeX, XeTeX, dvipdfmx) that
 * speak the simple `settexliveurl` / `writefile` / `readfile` / `<compile>`
 * protocol — i.e. without the corca-specific commands (bloom, preloadtexlive,
 * dumpcache, …) that `WasmTexPdftexEngine` relies on. Subclasses add their own
 * compile entry point.
 */
export declare abstract class WasmTexWorker<TMsg extends WasmTexWorkerMsg = WasmTexWorkerMsg> extends BaseWorkerEngine<TMsg> {
    onFileDownload?: (filename: string) => void;
    protected version: TexliveVersion;
    constructor(enginePath: string, texliveUrl: string | null, version: TexliveVersion);
    init(): Promise<void>;
    /** Tear down a worker that failed to initialize and settle any in-flight request. The
     *  worker reference MUST be cleared (only terminate() did this before): otherwise the
     *  `if (this.worker) return` re-entry guard would let a later init() resolve silently
     *  against a dead, errored worker instead of recreating one. */
    private failInit;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    mkdir(path: string): void;
    setMainFile(path: string): void;
    readFile(path: string): Promise<string | null>;
    flushCache(): void;
    isReady(): boolean;
}
/** Result of a single {@link CompileWorkerDriver.run} command. */
export interface CompileWorkerResult {
    success: boolean;
    log: string;
    /** The binary the worker produced (PDF for luatex/dvipdfmx, XDV/fmt for xetex). */
    out: Uint8Array | null;
}
/**
 * A WasmTex worker with a single-command compile entry point, shared by
 * the Unicode engines (XeTeX + dvipdfmx, LuaTeX). The worker replies to every
 * `compile*` command under the `cmd:compile` key with `{result,status,log,pdf}`.
 */
export declare class CompileWorkerDriver extends WasmTexWorker {
    /** Run `command` (`compilelatex` | `compileformat` | `compilepdf`) and collect
     *  the output. status 0 (ok) and 1 (warnings) both count as success. */
    run(command: string): Promise<CompileWorkerResult>;
    /** Load the CDN bloom filter so the worker skips sync XHR for definitely-
     *  missing files (fire-and-forget; the worker sends no reply). The buffer is
     *  cloned, NOT transferred — it's tiny (~172 KB) and the engine keeps it to
     *  store in the durable cache; transferring would detach that copy. */
    loadBloom(buf: ArrayBuffer): void;
    /** Inject a prefetched TeX Live file into the worker cache (warmup). Fire-and-
     *  forget: the worker processes messages FIFO, so all preloads land before the
     *  later `compilelatex`; not awaiting a reply keeps a stale worker (one without
     *  this command) from hanging the compile — it just degrades to on-demand XHR.
     *  Transfers buf. */
    preloadTexlive(format: number, filename: string, buf: ArrayBuffer): void;
    /** Pre-seed known-missing lookups so the worker skips their sync XHR
     *  (fire-and-forget, same rationale as {@link preloadTexlive}). */
    preload404(entries: ReadonlyArray<{
        format: number;
        filename: string;
    }>): void;
    /** Export every TeX Live file fetched/preloaded this session, plus known-missing
     *  entries, for the durable cache. */
    dumpCache(): Promise<{
        files: CachedTexliveFile[];
        notFound: TexliveFileEntry[];
    }>;
}
