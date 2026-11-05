export type AssetDownloadKind = 'format' | 'package' | 'font' | 'data';
export type AssetDownloadFailure = 'stalled' | 'network' | 'http' | 'invalid' | 'cancelled';
/** No URL or project filename crosses this diagnostic boundary. */
export interface AssetDownloadEvent {
    requestId: number;
    asset: AssetDownloadKind;
    phase: 'start' | 'bytes' | 'retry' | 'end';
    receivedBytes: number;
    lastByteAgeMs: number | null;
    retryCount: number;
    failure?: AssetDownloadFailure;
    status?: number;
}
export declare class AssetDownloadError extends Error {
    readonly failure: AssetDownloadFailure;
    readonly status?: number | undefined;
    constructor(failure: AssetDownloadFailure, status?: number | undefined);
}
interface DownloadInput {
    asset: AssetDownloadKind;
    signal?: AbortSignal;
    /** Speculation leaves retries to foreground demand. */
    retry?: boolean;
    onPercent?: (percent: number) => void;
    validate?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}
/** One recovery budget shared by one compiler attempt's asset requests. */
export declare class AssetDownloadSession {
    private readonly onEvent?;
    private readonly fetchImpl;
    private remainingRetries;
    private generation;
    private workerRequests;
    constructor(onEvent?: ((event: AssetDownloadEvent) => void) | undefined, fetchImpl?: typeof fetch);
    /** Start another explicit compile attempt after the host has serialized prior work.
     * Late completions from the previous attempt cannot refill or spend its allowance. */
    beginAttempt(): void;
    /** Worker-local IDs are translated into the same host-wide request namespace. */
    recordWorkerEvent(owner: object, event: AssetDownloadEvent): void;
    /** Reserve retries before a synchronous Worker operation; concurrent fetches
     * cannot spend the same allowance. Legacy Workers return no budget field. */
    reserveRetries(): {
        limit: number;
        settle: (remaining?: unknown) => void;
    };
    read(url: string, input: DownloadInput): Promise<Uint8Array | null>;
    private canRetry;
    private retryable;
    private emit;
    private validate;
    private transfer;
}
/** Closed worker protocol: ignore malformed counters and unrecognized classifications. */
export declare function isAssetDownloadEvent(value: unknown): value is AssetDownloadEvent;
export {};
