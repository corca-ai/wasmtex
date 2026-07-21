/**
 * Shared gzip-first fetch utility used by both the warmup module and
 * the WasmTex engine for pre-loading TeX Live files.
 */
/** Collect all chunks from a ReadableStream into a single ArrayBuffer. */
export declare function readStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer>;
/**
 * Read a Response body to bytes, invoking `onProgress` (0→100, clamped) per chunk
 * when a handler is given and a numeric Content-Length is known; otherwise a single
 * `arrayBuffer()` read with no progress. Shared by the pdfTeX and Unicode engines so
 * format-download progress reporting has one implementation.
 */
export declare function readResponseWithProgress(resp: Response, onProgress?: (pct: number) => void): Promise<Uint8Array>;
/**
 * Fetch a URL, trying `.gz` compressed version first (with DecompressionStream),
 * falling back to the raw URL. Returns null if both fail.
 */
export declare function fetchGzWithFallback(url: string, opts?: RequestInit): Promise<ArrayBuffer | null>;
