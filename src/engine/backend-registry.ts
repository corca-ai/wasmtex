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
  readonly id: string
  /** Compile stage and implementation version used to namespace shared cache entries. */
  readonly stage?: string
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
export class BackendRegistry {
  private readonly overrides = new Map<string, ToolBackend<unknown, unknown>>()

  constructor(
    private readonly defaults: Readonly<Record<string, ToolBackend<unknown, unknown>>> = {},
  ) {}

  register<Req, Res>(stage: string, backend: ToolBackend<Req, Res>): void {
    this.overrides.set(stage, backend as ToolBackend<unknown, unknown>)
  }

  resolve<Req, Res>(stage: string): ToolBackend<Req, Res> | null {
    const backend = this.overrides.get(stage) ?? this.defaults[stage] ?? null
    return backend as ToolBackend<Req, Res> | null
  }

  /** True if the resolved backend for `stage` runs off-device (a server backend). */
  isRemote(stage: string): boolean {
    return this.resolve(stage)?.location === 'server'
  }
}

export interface RemoteBackendOptions<Req, Res> {
  id: string
  /** Stage name, sent as a header so one endpoint can serve many stages. */
  stage: string
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
export function createRemoteBackend<Req, Res>(
  opts: RemoteBackendOptions<Req, Res>,
): ToolBackend<Req, Res> {
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
export interface JsonTextBackendOptions<Req> {
  id: string
  stage: string
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
export function createJsonTextBackend<Req>(
  opts: JsonTextBackendOptions<Req>,
): ToolBackend<Req, string> {
  return createRemoteBackend<Req, string>({
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
