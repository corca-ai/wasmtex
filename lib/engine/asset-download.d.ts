export type AssetDownloadKind = 'format' | 'package' | 'font' | 'data';
export type AssetDownloadFailure = 'stalled' | 'network' | 'http' | 'invalid';
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
    onPercent?: (percent: number) => void;
    validate?: (bytes: Uint8Array) => Uint8Array | Promise<Uint8Array>;
}
/** One recovery budget shared by one compiler attempt's asset requests. */
export declare class AssetDownloadSession {
    private readonly onEvent?;
    private readonly fetchImpl;
    private remainingRetries;
    private sequence;
    constructor(onEvent?: ((event: AssetDownloadEvent) => void) | undefined, fetchImpl?: typeof fetch);
    read(url: string, input: DownloadInput): Promise<Uint8Array | null>;
    private retryable;
    private emit;
    private validate;
    private transfer;
}
export {};
