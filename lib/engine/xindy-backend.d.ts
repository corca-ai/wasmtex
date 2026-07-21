import { ToolBackend } from './backend-registry';
/**
 * xindy as a server-first pluggable backend (M5 / #117, execution-model principle 3).
 *
 * xindy is Common Lisp (CLISP) + Perl wrappers — it needs a Lisp runtime, so shipping it
 * to WASM is a research-grade spike. It is also not in the hot loop and deterministic, so
 * — like Biber (#116) — the pragmatic path is a **server offload**: an integrator points
 * {@link createXindyBackend} at an endpoint running xindy. makeindex (#115) covers the
 * common index case client-side; this is for multilingual / complex indexing.
 *
 * **Decision (the #104 spike):** ship xindy server-first; a WASM port is deferred (low
 * demand vs. the Lisp-runtime cost). Revisit only if a client-only xindy is requested.
 */
export interface XindyRequest {
    /** The `.idx` file emitted by the LaTeX pass. */
    idx: string;
    /** xindy options (language module, codepage, extra modules). */
    options?: {
        language?: string;
        codepage?: string;
        modules?: string[];
    };
}
export interface XindyBackendOptions {
    /** Integrator endpoint that runs xindy and returns the `.ind`. */
    endpoint: string;
    fetchImpl?: typeof fetch;
    /** Content-address key for caching (S5 #112). */
    cacheKey?: (request: XindyRequest) => string;
}
/** Build a server xindy backend for the `index` stage (`.idx` → `.ind`). */
export declare function createXindyBackend(opts: XindyBackendOptions): ToolBackend<XindyRequest, string>;
