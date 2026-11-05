/**
 * Shared gzip-first fetch utility used by both the warmup module and
 * the WasmTex engine for pre-loading TeX Live files.
 */
/** Collect all chunks from a ReadableStream into a single ArrayBuffer. */
export declare function readStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer>;
/**
 * Read a Response body to bytes, invoking `onProgress` (0→100, clamped) per chunk
 * when a numeric Content-Length is known. Byte progress does not require a
 * Content-Length and remains meaningful for transparently decoded responses.
 * Shared by the pdfTeX and Unicode engines.
 */
export declare function readResponseWithProgress(resp: Response, onProgress?: (pct: number) => void, onBytes?: (received: number) => void, signal?: AbortSignal): Promise<Uint8Array>;
/**
 * Fetch a URL, trying `.gz` compressed version first (with DecompressionStream),
 * falling back to the raw URL. Returns null if both fail.
 */
export declare function fetchGzWithFallback(url: string, opts?: RequestInit): Promise<ArrayBuffer | null>;
