import { EngineStatus, TexliveVersion } from '../types';
import { EngineWorker } from './worker-host';
/** Shared base for WASM worker engines (pdfTeX, BibTeX). */
export declare abstract class BaseWorkerEngine<TMsg = unknown> {
    protected worker: EngineWorker | null;
    protected status: EngineStatus;
    protected enginePath: string;
    protected texliveUrl: string | null;
    /**
     * Waiters per response key, oldest first. Legacy cmd-keyed requests
     * (`cmd:writefile`, `cmd:compile`, …) share a non-unique key, so concurrent
     * in-flight requests must queue rather than overwrite one another's resolver.
     */
    protected pendingResponses: Map<string, {
        resolve: (data: TMsg) => void;
        reject: (reason: Error) => void;
    }[]>;
    onProgress?: (progress: number) => void;
    constructor(enginePath: string, texliveUrl: string | null);
    getStatus(): EngineStatus;
    terminate(): void;
    /** Send a message to the worker and wait for a response keyed by responseKey. */
    protected postMessageWithResponse(msg: unknown, responseKey: string, transferables?: Transferable[]): Promise<TMsg>;
    /**
     * Deliver a worker response to the oldest waiter registered under `key` (FIFO,
     * matching the single-threaded worker's reply order). Returns true if a waiter
     * was waiting.
     */
    protected deliverResponse(key: string, data: TMsg): boolean;
    /** Reject every pending request (oldest-first) so awaiters settle instead of hanging.
     *  Pass a string to reject as an AbortError (graceful teardown, e.g. terminate()), or a
     *  concrete Error to surface a real failure (e.g. a worker crash). No-op when idle. */
    protected rejectAllPending(reason: string | Error): void;
    /** Handle a spontaneous worker error (WASM OOM / uncaught glue error) that fires AFTER
     *  init: mark the engine errored and settle every in-flight request — notably a pending
     *  `compile()` — with a real error so it rejects instead of hanging forever (which would
     *  wedge the scheduler with `compiling` stuck true). Returns the surfaced Error. */
    protected handleWorkerError(err: unknown): Error;
}
/** Resolve the TexLive server URL from an override, env var, or current origin. */
export declare function resolveTexliveUrl(override: string | null, version?: TexliveVersion): string;
