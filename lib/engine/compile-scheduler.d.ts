import { CompileResult } from '../types';
export declare class CompileScheduler {
    private engine;
    private onResult;
    private onStatusChange;
    private debounceTimer;
    private compiling;
    private pendingCompile;
    private generation;
    private lastCompileTime;
    private minDebounceMs;
    private maxDebounceMs;
    /** Poll interval for retrying a compile blocked on engine readiness. */
    private readonly readyRetryMs;
    /** Consecutive ready-retries already spent on the current pending compile. */
    private readyRetries;
    /** Cap on ready-retries (~2s at 50ms) before giving up and surfacing a failure, so a
     *  permanently-not-ready engine isn't polled forever with the compile silently dropped. */
    private readonly maxReadyRetries;
    constructor(engine: {
        compile(): Promise<CompileResult>;
        isReady(): boolean;
    }, onResult: (result: CompileResult) => void, onStatusChange: (status: import('../types').AppStatus, detail?: string) => void, { minDebounceMs, maxDebounceMs }?: {
        minDebounceMs?: number | undefined;
        maxDebounceMs?: number | undefined;
    });
    private get debounceMs();
    schedule(): void;
    /** Re-arm the debounce timer to retry a compile once the engine becomes ready. */
    private armReadyRetry;
    private runCompile;
    /** Immediately fire the pending debounce timer (skip remaining wait). */
    flush(): void;
    cancel(): void;
    getDebounceMs(): number;
}
