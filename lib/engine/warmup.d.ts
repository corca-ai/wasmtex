import { TexliveVersion, WarmupCache } from '../types';
export interface WarmupOptions {
    /** TeX Live version. Defaults to '2025'. */
    texliveVersion?: TexliveVersion;
    /** Override TeX Live CDN endpoint. */
    texliveUrl?: string;
    /** Max concurrent fetches. Defaults to 6. */
    concurrency?: number;
    /** AbortSignal for cancellation. */
    signal?: AbortSignal;
    /** Progress callback: called with (completed, total). */
    onProgress?: (completed: number, total: number) => void;
}
/**
 * Pre-fetch TeX Live files needed for first compilation.
 *
 * Call this as early as possible (e.g. on page load), then pass the
 * result as `warmupCache` to the `WasmTex` constructor.
 *
 * ```ts
 * const cache = await warmup()
 * const editor = new WasmTex('#editor', '#preview', { warmupCache: cache })
 * ```
 */
export declare function warmup(options?: WarmupOptions): Promise<WarmupCache>;
