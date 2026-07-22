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
import type { BiberRequest } from './biber-backend'
import type { BibliographyStageRequest } from './bibliography-backend'
import type { IndexStageRequest } from './index-backend'

export const BIBTEX_STAGE = 'bibliography:bibtex'
export const BIBER_STAGE = 'bibliography:biber'
export const INDEX_STAGE = 'index'

/** Compile-time request/response contract owned by one registry stage. */
export interface BackendStageContract<Req, Res> {
  readonly request: Req
  readonly response: Res
}

/** Built-in stage contracts accepted by {@link WasmTexCompiler}. Classic BibTeX and Biber
 * are deliberately different slots because their `.aux` and `.bcf` requests are not
 * interchangeable. */
export interface WasmTexBackendStages {
  [BIBTEX_STAGE]: BackendStageContract<BibliographyStageRequest, string>
  [BIBER_STAGE]: BackendStageContract<BiberRequest, string>
  [INDEX_STAGE]: BackendStageContract<IndexStageRequest, string>
}

type StageMapConstraint<Stages> = {
  [Stage in keyof Stages]: BackendStageContract<unknown, unknown>
}
type StageName<Stages> = Extract<keyof Stages, string>
type StageRequest<Contract> =
  Contract extends BackendStageContract<infer Req, unknown> ? Req : never
type StageResponse<Contract> =
  Contract extends BackendStageContract<unknown, infer Res> ? Res : never
type BackendImplementations<Stages> = {
  [Stage in StageName<Stages>]: ToolBackend<
    StageRequest<Stages[Stage]>,
    StageResponse<Stages[Stage]>,
    Stage
  >
}

/** A backend that runs one compile stage. `Req`/`Res` are the stage's payloads. */
export interface ToolBackend<Req, Res, Stage extends string = string> {
  readonly id: string
  /** Compile stage. Required both for runtime registration validation and cache identity. */
  readonly stage: Stage
  /** Implementation version used to namespace shared cache entries. */
  readonly version?: string
  /** Where this backend runs. Drives telemetry and the privacy default — a `server`
   *  backend only ever sees what the integrator routes to it. */
  readonly location: 'client' | 'server'
  run(request: Req): Promise<Res>
}

/**
 * Per-stage backend registry. Construct with the client defaults; an integrator
 * overrides individual stages with {@link register}. `resolve` returns the override or
 * the default (or null if neither exists), so the default path is 100% client unless a
 * stage is explicitly re-routed.
 */
export class BackendRegistry<Stages extends StageMapConstraint<Stages> = WasmTexBackendStages> {
  private readonly overrides: Partial<BackendImplementations<Stages>> = {}

  constructor(private readonly defaults?: Readonly<Partial<BackendImplementations<Stages>>>) {}

  register<Stage extends StageName<Stages>>(
    stage: Stage,
    backend: BackendImplementations<Stages>[Stage],
  ): void {
    if (backend.stage !== stage) {
      throw new Error(
        `backend "${backend.id}" declares stage "${backend.stage}" but was registered for "${stage}"`,
      )
    }
    this.overrides[stage] = backend
  }

  resolve<Stage extends StageName<Stages>>(
    stage: Stage,
  ): BackendImplementations<Stages>[Stage] | null {
    const backend = this.overrides[stage] ?? this.defaults?.[stage] ?? null
    if (backend && backend.stage !== stage) {
      throw new Error(
        `backend "${backend.id}" declares stage "${backend.stage}" but was resolved for "${stage}"`,
      )
    }
    return backend
  }

  /** True if the resolved backend for `stage` runs off-device (a server backend). */
  isRemote<Stage extends StageName<Stages>>(stage: Stage): boolean {
    return this.resolve(stage)?.location === 'server'
  }
}

export interface RemoteBackendOptions<Req, Res, Stage extends string = string> {
  id: string
  /** Stage name, sent as a header so one endpoint can serve many stages. */
  stage: Stage
  /** Backend implementation version. Include it when different deployed versions can emit
   *  different artifacts for the same request. */
  version?: string
  /** Integrator endpoint that runs the same headless engine for this stage. */
  endpoint: string
  /** Injectable for tests / non-global-fetch hosts. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  encodeRequest: (request: Req) => BodyInit
  decodeResponse: (response: Response) => Promise<Res>
  /** Content-address key for the request (e.g. a sources+deps hash). Sent as a header
   *  so the endpoint / a shared cache (S5 #112) can dedupe identical work. */
  cacheKey?: (request: Req) => string
}

/**
 * A **server** {@link ToolBackend} that POSTs the stage request to an integrator
 * endpoint and returns the artifact. The endpoint runs the same deterministic engine,
 * so its output is identical to the client path (verified by S4 #111).
 */
export function createRemoteBackend<Req, Res, const Stage extends string = string>(
  opts: RemoteBackendOptions<Req, Res, Stage>,
): ToolBackend<Req, Res, Stage> {
  return {
    id: opts.id,
    stage: opts.stage,
    ...(opts.version ? { version: opts.version } : {}),
    location: 'server',
    async run(request: Req): Promise<Res> {
      const doFetch = opts.fetchImpl ?? fetch
      const headers: Record<string, string> = { 'x-wasmtex-stage': opts.stage }
      const key = opts.cacheKey?.(request)
      if (key) headers['x-wasmtex-cache-key'] = key
      const response = await doFetch(opts.endpoint, {
        method: 'POST',
        headers,
        body: opts.encodeRequest(request),
      })
      if (!response.ok) {
        throw new Error(`remote backend "${opts.id}" failed: HTTP ${response.status}`)
      }
      return opts.decodeResponse(response)
    },
  }
}

/** Options for {@link createJsonTextBackend} — a remote backend whose request is JSON
 *  and whose response is text. `fetchImpl`/`cacheKey` accept `undefined` so callers can
 *  forward optional fields without the `exactOptionalPropertyTypes` spread dance. */
export interface JsonTextBackendOptions<Req, Stage extends string = string> {
  id: string
  stage: Stage
  version?: string | undefined
  endpoint: string
  fetchImpl?: typeof fetch | undefined
  cacheKey?: ((request: Req) => string) | undefined
}

/**
 * Build a server {@link ToolBackend} that POSTs the request as JSON and reads the
 * response as text — the shape every text-artifact stage (Biber `.bbl`, xindy `.ind`,
 * …) shares. Thin wrapper over {@link createRemoteBackend} that fills in the JSON
 * encode / text decode and forwards the optional `fetchImpl`/`cacheKey`.
 */
export function createJsonTextBackend<Req, const Stage extends string = string>(
  opts: JsonTextBackendOptions<Req, Stage>,
): ToolBackend<Req, string, Stage> {
  return createRemoteBackend<Req, string, Stage>({
    id: opts.id,
    stage: opts.stage,
    ...(opts.version ? { version: opts.version } : {}),
    endpoint: opts.endpoint,
    encodeRequest: (request) => JSON.stringify(request),
    decodeResponse: (response) => response.text(),
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.cacheKey ? { cacheKey: opts.cacheKey } : {}),
  })
}
