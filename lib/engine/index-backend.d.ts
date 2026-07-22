import { BackendRegistry, INDEX_STAGE, ToolBackend } from './backend-registry';
/** The per-stage backend name the compiler resolves the index pass through. Shared with
 *  the server xindy backend (`xindy-backend.ts`, which uses the literal `'index'`). */
export { INDEX_STAGE };
/** What {@link WasmTexCompiler} sends to a **server** index backend: the `.idx` emitted
 *  by the LaTeX pass. The backend runs makeindex/xindy off-device and returns the `.ind`. */
export interface IndexStageRequest {
    idx: string;
}
/**
 * Whether a LaTeX source uses the index machinery — `\makeindex` (activates `.idx` output)
 * **and** `\printindex` (something to resolve). The compile loop gates on this before
 * running makeindex, so a stale `.idx` lingering in a reused engine's MEMFS can't add a
 * phantom index to a document that doesn't ask for one. Strips comments first so a
 * commented-out directive doesn't trigger detection.
 */
export declare function detectIndexUse(source: string): boolean;
/**
 * Route the index stage through the backend registry: if the integrator registered a
 * **server** backend for {@link INDEX_STAGE}, run it and return the `.ind`; otherwise
 * return `null` so the caller falls back to the bundled client makeindex engine. Keeps the
 * client-first default non-negotiable — a remote backend runs only when the integrator
 * explicitly wired one. Extracted so the routing is unit-testable without a WASM engine;
 * mirrors {@link runRemoteBibliography}.
 */
export declare function runRemoteIndex(registry: BackendRegistry | undefined, request: IndexStageRequest): Promise<string | null>;
export interface MakeindexBackendOptions {
    /** Integrator endpoint that runs makeindex and returns the `.ind`. */
    endpoint: string;
    /** Deployed makeindex version, used to isolate shared cache entries. */
    version?: string;
    fetchImpl?: typeof fetch;
    /** Content-address key for caching (S5 #112). */
    cacheKey?: (request: IndexStageRequest) => string;
}
/**
 * Build a **server** makeindex backend for the `index` stage (`.idx` → `.ind`). The client
 * default (bundled WASM) needs no backend; register this only to offload the index pass to
 * an endpoint running the same makeindex — mirrors {@link createXindyBackend}.
 */
export declare function createMakeindexBackend(opts: MakeindexBackendOptions): ToolBackend<IndexStageRequest, string, typeof INDEX_STAGE>;
