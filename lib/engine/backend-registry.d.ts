import { BiberRequest } from './biber-backend';
import { BibliographyStageRequest } from './bibliography-backend';
import { IndexStageRequest } from './index-backend';
export declare const BIBTEX_STAGE = "bibliography:bibtex";
export declare const BIBER_STAGE = "bibliography:biber";
export declare const INDEX_STAGE = "index";
/** Compile-time request/response contract owned by one registry stage. */
export interface BackendStageContract<Req, Res> {
    readonly request: Req;
    readonly response: Res;
}
/** Built-in stage contracts accepted by {@link WasmTexCompiler}. Classic BibTeX and Biber
 * are deliberately different slots because their `.aux` and `.bcf` requests are not
 * interchangeable. */
export interface WasmTexBackendStages {
    [BIBTEX_STAGE]: BackendStageContract<BibliographyStageRequest, string>;
    [BIBER_STAGE]: BackendStageContract<BiberRequest, string>;
    [INDEX_STAGE]: BackendStageContract<IndexStageRequest, string>;
}
type StageMapConstraint<Stages> = {
    [Stage in keyof Stages]: BackendStageContract<unknown, unknown>;
};
type StageName<Stages> = Extract<keyof Stages, string>;
type StageRequest<Contract> = Contract extends BackendStageContract<infer Req, unknown> ? Req : never;
type StageResponse<Contract> = Contract extends BackendStageContract<unknown, infer Res> ? Res : never;
type BackendImplementations<Stages> = {
    [Stage in StageName<Stages>]: ToolBackend<StageRequest<Stages[Stage]>, StageResponse<Stages[Stage]>, Stage>;
};
/** A backend that runs one compile stage. `Req`/`Res` are the stage's payloads. */
export interface ToolBackend<Req, Res, Stage extends string = string> {
    readonly id: string;
    /** Compile stage. Required both for runtime registration validation and cache identity. */
    readonly stage: Stage;
    /** Implementation version used to namespace shared cache entries. */
    readonly version?: string;
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
export declare class BackendRegistry<Stages extends StageMapConstraint<Stages> = WasmTexBackendStages> {
    private readonly defaults?;
    private readonly overrides;
    constructor(defaults?: Readonly<Partial<BackendImplementations<Stages>>> | undefined);
    register<Stage extends StageName<Stages>>(stage: Stage, backend: BackendImplementations<Stages>[Stage]): void;
    resolve<Stage extends StageName<Stages>>(stage: Stage): BackendImplementations<Stages>[Stage] | null;
    /** True if the resolved backend for `stage` runs off-device (a server backend). */
    isRemote<Stage extends StageName<Stages>>(stage: Stage): boolean;
}
export interface RemoteBackendOptions<Req, Res, Stage extends string = string> {
    id: string;
    /** Stage name, sent as a header so one endpoint can serve many stages. */
    stage: Stage;
    /** Backend implementation version. Include it when different deployed versions can emit
     *  different artifacts for the same request. */
    version?: string;
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
export declare function createRemoteBackend<Req, Res, const Stage extends string = string>(opts: RemoteBackendOptions<Req, Res, Stage>): ToolBackend<Req, Res, Stage>;
/** Options for {@link createJsonTextBackend} — a remote backend whose request is JSON
 *  and whose response is text. `fetchImpl`/`cacheKey` accept `undefined` so callers can
 *  forward optional fields without the `exactOptionalPropertyTypes` spread dance. */
export interface JsonTextBackendOptions<Req, Stage extends string = string> {
    id: string;
    stage: Stage;
    version?: string | undefined;
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
export declare function createJsonTextBackend<Req, const Stage extends string = string>(opts: JsonTextBackendOptions<Req, Stage>): ToolBackend<Req, string, Stage>;
export {};
