import type { ToolBackend } from './backend-registry'

/**
 * Content-addressed cache (S5 / #112, execution-model). A stage's output is a pure
 * function of its inputs (the same deterministic engine, browser or server — proven by
 * S4 #111), so an artifact can be keyed by a hash of its inputs and reused **anywhere**:
 * "compile once, instant everywhere." Either host populates it; both read it — the
 * substrate for the cold(server)→warm(client) handoff. A server-type backend's request
 * already carries an `x-wasmtex-cache-key` header (#110) so a shared cache can dedupe.
 *
 * Keep only deterministic, non-sensitive artifacts here (formats, `.bbl`/`.ind`, …), or
 * stay within the integrator's trust boundary — a cache that leaves the device is a
 * privacy surface.
 */

/** Pluggable store: in-memory by default; an integrator can back it with KV/Redis/a CDN. */
export interface CacheStore {
  get(key: string): Promise<string | undefined> | string | undefined
  set(key: string, value: string): Promise<void> | void
}

/** A simple in-memory {@link CacheStore} (per process). */
export class MemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, string>()
  get(key: string): string | undefined {
    return this.map.get(key)
  }
  set(key: string, value: string): void {
    this.map.set(key, value)
  }
}

/** Identity fields that separate artifacts produced by different tools, stages, versions,
 * or non-request backend configuration in a shared store. */
export interface BackendCacheIdentity {
  backendId: string
  stage?: string | undefined
  backendVersion?: string | undefined
  backendOptions?: unknown
}

/** Options for {@link withCache}. Passing a function directly remains supported as the
 * legacy shorthand for `keyOf`. */
export interface WithCacheOptions<Req> {
  keyOf?: ((request: Req) => Promise<string> | string) | undefined
  stage?: string | undefined
  backendVersion?: string | undefined
  /** Configuration that affects output but is not already represented in `request`. */
  backendOptions?: unknown
}

/** Deterministic JSON: object keys sorted recursively, so equal inputs hash equally.
 *  `undefined` is kept distinct from `null` (so they don't share a key), and object keys
 *  whose value is `undefined` are omitted — matching `JSON.stringify` (the actual POSTed
 *  body), so `{a}` and `{a, b: undefined}` are the same work and hit the same cache. */
function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  // `JSON.stringify` serializes `undefined` array elements AND holes (sparse gaps) as
  // `null`, so the cache key must too — else two byte-identical POST bodies get different
  // keys. `Array.prototype.map` skips holes, so walk by index and treat a hole (`!(k in
  // value)`) and an explicit `undefined` identically as `null`.
  if (Array.isArray(value))
    return `[${Array.from({ length: value.length }, (_, k) =>
      k in value && value[k] !== undefined ? stableStringify(value[k]) : 'null',
    ).join(',')}]`
  const obj = value as Record<string, unknown>
  const body = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')
  return `{${body}}`
}

/** Content-address key: a SHA-256 hex digest of the input (works in the browser and Node
 *  via WebCrypto). Use as the cache key and the `x-wasmtex-cache-key` header value. */
export async function contentKey(parts: unknown): Promise<string> {
  const data = new TextEncoder().encode(stableStringify(parts))
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Build the final shared-store key. The schema marker intentionally invalidates the old
 * request-only key space, whose entries cannot prove which backend produced them. */
export function backendCacheKey(
  identity: BackendCacheIdentity,
  requestKey: unknown,
): Promise<string> {
  return contentKey({
    schema: 'wasmtex-tool-cache',
    schemaVersion: 1,
    stage: identity.stage ?? null,
    backendId: identity.backendId,
    backendVersion: identity.backendVersion ?? null,
    backendOptions: identity.backendOptions ?? null,
    requestKey,
  })
}

/**
 * Wrap a string-producing {@link ToolBackend} with content-addressed caching: a cache hit
 * (keyed by the backend identity plus the request's {@link contentKey}, or a custom `keyOf`)
 * returns instantly and never runs the backend — so a stage compiled once on any host is
 * free everywhere without reusing an artifact from another tool or version.
 */
export function withCache<Req, Res extends string, Stage extends string>(
  backend: ToolBackend<Req, Res, Stage>,
  store: CacheStore,
  keyOfOrOptions: ((request: Req) => Promise<string> | string) | WithCacheOptions<Req> = {},
): ToolBackend<Req, Res, Stage> {
  const options: WithCacheOptions<Req> =
    typeof keyOfOrOptions === 'function' ? { keyOf: keyOfOrOptions } : keyOfOrOptions
  const keyOf = options.keyOf ?? contentKey
  const identity: BackendCacheIdentity = {
    backendId: backend.id,
    stage: options.stage ?? backend.stage,
    backendVersion: options.backendVersion ?? backend.version,
    backendOptions: options.backendOptions,
  }
  return {
    id: `${backend.id}+cache`,
    stage: backend.stage,
    ...(identity.backendVersion ? { version: identity.backendVersion } : {}),
    location: backend.location,
    async run(request: Req): Promise<Res> {
      const key = await backendCacheKey(identity, await keyOf(request))
      const hit = await store.get(key)
      if (hit !== undefined) return hit as Res
      const result = await backend.run(request)
      await store.set(key, result)
      return result
    },
  }
}
