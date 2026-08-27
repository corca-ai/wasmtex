import { ToolBackend } from './backend-registry';
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
    get(key: string): Promise<string | undefined> | string | undefined;
    set(key: string, value: string): Promise<void> | void;
}
/** A simple in-memory {@link CacheStore} (per process). */
export declare class MemoryCacheStore implements CacheStore {
    private readonly map;
    get(key: string): string | undefined;
    set(key: string, value: string): void;
}
/** Identity fields that separate artifacts produced by different tools, stages, versions,
 * or non-request backend configuration in a shared store. */
export interface BackendCacheIdentity {
    backendId: string;
    stage?: string | undefined;
    backendVersion?: string | undefined;
    backendOptions?: unknown;
}
/** Options for {@link withCache}. Passing a function directly remains supported as the
 * legacy shorthand for `keyOf`. */
export interface WithCacheOptions<Req> {
    keyOf?: ((request: Req) => Promise<string> | string) | undefined;
    stage?: string | undefined;
    backendVersion?: string | undefined;
    /** Configuration that affects output but is not already represented in `request`. */
    backendOptions?: unknown;
}
/** Content-address key: a SHA-256 hex digest of the input (works in the browser and Node
 *  via WebCrypto). Use as the cache key and the `x-wasmtex-cache-key` header value. */
export declare function contentKey(parts: unknown): Promise<string>;
/** Build the final shared-store key. The schema marker intentionally invalidates the old
 * request-only key space, whose entries cannot prove which backend produced them. */
export declare function backendCacheKey(identity: BackendCacheIdentity, requestKey: unknown): Promise<string>;
/**
 * Wrap a string-producing {@link ToolBackend} with content-addressed caching: a cache hit
 * (keyed by the backend identity plus the request's {@link contentKey}, or a custom `keyOf`)
 * returns instantly and never runs the backend — so a stage compiled once on any host is
 * free everywhere without reusing an artifact from another tool or version.
 */
export declare function withCache<Req, Res extends string, Stage extends string>(backend: ToolBackend<Req, Res, Stage>, store: CacheStore, keyOfOrOptions?: ((request: Req) => Promise<string> | string) | WithCacheOptions<Req>): ToolBackend<Req, Res, Stage>;
