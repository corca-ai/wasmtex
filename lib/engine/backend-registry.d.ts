/**
 * Pluggable per-stage execution backends (S3 / #110, execution-model principle 3).
 *
 * A compile is a pipeline of stages — the TeX engine pass, bibliography
 * (bibtex/biber), index (makeindex/xindy), export, … Each stage resolves through a
 * {@link ToolBackend}. The **default for every stage is client/local** (WASM/TS in the
 * browser), so nothing leaves the device. An integrator may register a **server**
 * backend for a specific stage — e.g. a remote Biber (M4 #116) for full biblatex
 * fidelity — by wiring a {@link createRemoteBackend} into the registry. The boundary is
 * the integrator's choice, per stage; see `docs/execution-model.md`.
 *
 * This generalizes the bibliography-only `BibliographyBackend` seam in
 * `bibliography-backend.ts` (which stays as the bibliography stage's client backend).
 */
/** A backend that runs one compile stage. `Req`/`Res` are the stage's payloads. */
export interface ToolBackend<Req, Res> {
    readonly id: string;
    /** Where this backend runs. Drives telemetry and the privacy default — a `server`
     *  backend only ever sees what the integrator routes to it. */
    readonly location: 'client' | 'server';
    run(request: Req): Promise<Res>;
}
/**
 * Per-stage backend registry. Construct with the client defaults; an integrator
 * overrides individual stages with {@link register}. `resolve` returns the override or
 * the default (or null if neither exists), so the default path is 100% client unless a
 * stage is explicitly re-routed.
 */
export declare class BackendRegistry {
    private readonly defaults;
    private readonly overrides;
    constructor(defaults?: Readonly<Record<string, ToolBackend<unknown, unknown>>>);
    register<Req, Res>(stage: string, backend: ToolBackend<Req, Res>): void;
    resolve<Req, Res>(stage: string): ToolBackend<Req, Res> | null;
    /** True if the resolved backend for `stage` runs off-device (a server backend). */
    isRemote(stage: string): boolean;
}
export interface RemoteBackendOptions<Req, Res> {
    id: string;
    /** Stage name, sent as a header so one endpoint can serve many stages. */
    stage: string;
    /** Integrator endpoint that runs the same headless engine for this stage. */
    endpoint: string;
    /** Injectable for tests / non-global-fetch hosts. Defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    encodeRequest: (request: Req) => BodyInit;
    decodeResponse: (response: Response) => Promise<Res>;
    /** Content-address key for the request (e.g. a sources+deps hash). Sent as a header
     *  so the endpoint / a shared cache (S5 #112) can dedupe identical work. */
    cacheKey?: (request: Req) => string;
}
/**
 * A **server** {@link ToolBackend} that POSTs the stage request to an integrator
 * endpoint and returns the artifact. The endpoint runs the same deterministic engine,
 * so its output is identical to the client path (verified by S4 #111).
 */
export declare function createRemoteBackend<Req, Res>(opts: RemoteBackendOptions<Req, Res>): ToolBackend<Req, Res>;
/** Options for {@link createJsonTextBackend} — a remote backend whose request is JSON
 *  and whose response is text. `fetchImpl`/`cacheKey` accept `undefined` so callers can
 *  forward optional fields without the `exactOptionalPropertyTypes` spread dance. */
export interface JsonTextBackendOptions<Req> {
    id: string;
    stage: string;
    endpoint: string;
    fetchImpl?: typeof fetch | undefined;
    cacheKey?: ((request: Req) => string) | undefined;
}
/**
 * Build a server {@link ToolBackend} that POSTs the request as JSON and reads the
 * response as text — the shape every text-artifact stage (Biber `.bbl`, xindy `.ind`,
 * …) shares. Thin wrapper over {@link createRemoteBackend} that fills in the JSON
 * encode / text decode and forwards the optional `fetchImpl`/`cacheKey`.
 */
export declare function createJsonTextBackend<Req>(opts: JsonTextBackendOptions<Req>): ToolBackend<Req, string>;
