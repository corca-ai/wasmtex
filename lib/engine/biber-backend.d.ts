import { BackendRegistry, BackendRunContext, BIBER_STAGE, ToolBackend } from './backend-registry.js';
/**
 * File-level Biber stage for host-provided local or server executors.
 *
 * The host supplies the full Biber runtime, for example in an isolated WASM Worker,
 * or registers a server using createBiberBackend. Without an explicit executor,
 * the compiler retains its bundled biblatex-lite subset.
 *
 * Unlike the legacy `BibliographyBackend.generateBbl` (entry-level, synchronous), Biber
 * is **file-level**: it consumes the `.bcf` control file (emitted by the first LaTeX pass)
 * plus the `.bib` databases and emits the `.bbl`.
 */
export interface BiberRequest {
    /** The `.bcf` (biblatex control file) emitted by the first LaTeX pass — references the
     *  `.bib` files and carries the biblatex options Biber needs. */
    bcf: string;
    /** The `.bib` database files, keyed by filename. */
    bibFiles: Record<string, string>;
}
export interface BiberBackendOptions {
    /** Integrator endpoint that runs Biber and returns the `.bbl`. */
    endpoint: string;
    /** Deployed Biber version, used to isolate shared cache entries. */
    version?: string;
    /** Injectable for tests / non-global-fetch hosts. */
    fetchImpl?: typeof fetch;
    /** Content-address key (e.g. a hash of the `.bcf` + `.bib`s) so a shared cache can
     *  dedupe identical Biber runs (S5 #112). */
    cacheKey?: (request: BiberRequest) => string;
}
/** Build a server Biber backend for the `.bcf`-typed {@link BIBER_STAGE}. */
export declare function createBiberBackend(opts: BiberBackendOptions): ToolBackend<BiberRequest, string, typeof BIBER_STAGE>;
/**
 * Route a biblatex document's bibliography stage through a **server** Biber backend: if the
 * integrator registered one for {@link BIBER_STAGE}, run it on the `.bcf`-based
 * {@link BiberRequest} and return the `.bbl`; otherwise return `null` so the caller falls
 * back to the bundled biblatex-lite. Keeps the client-first default non-negotiable — a remote
 * Biber runs only when the integrator explicitly wired one. The `.bcf` sibling of
 * `runRemoteBibliography` (classic `.aux` flow); extracted so the routing is unit-testable
 * without a WASM engine.
 */
export declare function runRemoteBiber(registry: BackendRegistry | undefined, request: BiberRequest): Promise<string | null>;
export { BIBER_STAGE };
/** Run the explicitly selected Biber executor, preserving the built-in default when absent. */
export declare function runBiberBackend(registry: BackendRegistry | undefined, request: BiberRequest, context?: BackendRunContext): Promise<string | null>;
