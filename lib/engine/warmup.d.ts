import { TexliveDependency, TexliveDependencySet, TexliveFileEntry, TexliveVersion, WarmupCache } from '../types';
export interface WarmupOptions {
    /** TeX Live version. Defaults to '2025'. */
    texliveVersion?: TexliveVersion;
    /** Override TeX Live CDN endpoint. */
    texliveUrl?: string;
    /** Max concurrent fetches. Defaults to 6. */
    concurrency?: number;
    /** Replay a compile's exact dependency set (`telemetry.texliveDependencies`) on top of
     *  the built-in first-compile manifest (the union, deduplicated by request name). An
     *  engine that only reports network lookups records a set without the kernel files it
     *  got from warmup, so replacing the manifest would reintroduce those fetches. Ignored
     *  when its `texliveVersion` does not match the requested one, so a set recorded
     *  against another year can never seed the wrong mirror. */
    dependencies?: TexliveDependencySet;
    /** Explicit file list, overriding both the built-in manifest and `dependencies`.
     *  Each entry is fetched as `candidate ?? filename` and injected as `filename`. */
    files?: TexliveDependency[];
    /** Explicit known-absent list, overriding the built-in one and `dependencies`. */
    notFound?: TexliveFileEntry[];
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
