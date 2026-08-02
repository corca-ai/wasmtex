/**
 * Lazy per-package command shards.
 *
 * For packages outside the bundled core DB, a small (~1–10 KB) JSON shard can be
 * fetched on demand — keyed on the project's `\usepackage`s — and cached so it
 * works offline afterward. The loader fetches each package at most once and
 * stores the result in a pluggable cache. It is opt-in: hosts pass a `baseUrl`
 * (and optionally a store). No public shard registry ships yet, so this is off
 * by default — the bundled core DB + the engine hash dump cover the common case.
 */
import type { CommandArg } from './package-db'
import { registerShard } from './package-db'

export interface ShardCommand {
  name: string
  args?: CommandArg[]
  doc?: string
}

export interface PackageShard {
  package: string
  commands: ShardCommand[]
  environments?: ShardCommand[]
}

/** Minimal async string store (e.g. an IndexedDB-backed cache). */
export interface ShardStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

/** Narrow an arbitrary parsed JSON value to a usable PackageShard, or null. A shard with
 *  no `commands` array (a top-level array/number/`{"package":"p"}`) is malformed and must
 *  be rejected rather than handed to registerShard (which would throw on a non-iterable). */
function asShard(value: unknown): PackageShard | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { package?: unknown; commands?: unknown; environments?: unknown }
  if (typeof v.package !== 'string' || !Array.isArray(v.commands)) return null
  if (v.environments !== undefined && !Array.isArray(v.environments)) return null
  return value as PackageShard
}

export interface PackageShardLoaderOptions {
  /** Base URL for shards; the loader fetches `${baseUrl}/${name}.json`. */
  baseUrl: string
  /** Override fetch (for tests / non-browser hosts). */
  fetchImpl?: typeof fetch
  /** Durable cache so a shard fetched once is available offline. */
  store?: ShardStore
}

export class PackageShardLoader {
  private baseUrl: string
  private fetchImpl: typeof fetch
  private store: ShardStore | undefined
  /** In-flight or completed load per package — cached so each is fetched once. */
  private resolved = new Map<string, Promise<PackageShard | null>>()

  constructor(options: PackageShardLoaderOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchImpl = (options.fetchImpl ?? globalThis.fetch).bind(globalThis)
    this.store = options.store
  }

  /** Load shards for the given packages (each fetched at most once). */
  async loadAll(packages: Iterable<string>): Promise<void> {
    await Promise.all([...packages].map((p) => this.load(p)))
  }

  /** Load (and register) a single package's shard, from cache or network. */
  load(pkg: string): Promise<PackageShard | null> {
    // Cache the promise *synchronously* so concurrent/duplicate loads share one
    // fetch instead of racing past an "already resolved" check.
    const existing = this.resolved.get(pkg)
    if (existing) return existing
    const task = this.resolve(pkg)
    this.resolved.set(pkg, task)
    // Don't memoize a failure: if the load yields null (transient network/parse error)
    // or rejects, evict the cached promise so a later call retries instead of being
    // stuck with the cached null for the loader's lifetime. Successful loads stay cached,
    // and concurrent duplicates still share this single in-flight promise.
    task.then(
      (shard) => {
        if (shard === null) this.resolved.delete(pkg)
      },
      () => this.resolved.delete(pkg),
    )
    return task
  }

  private async resolve(pkg: string): Promise<PackageShard | null> {
    const shard = (await this.fromStore(pkg)) ?? (await this.fromNetwork(pkg))
    if (shard) registerShard(shard)
    return shard
  }

  private async fromStore(pkg: string): Promise<PackageShard | null> {
    if (!this.store) return null
    try {
      const cached = await this.store.get(this.key(pkg))
      return cached ? asShard(JSON.parse(cached)) : null
    } catch {
      return null
    }
  }

  private async fromNetwork(pkg: string): Promise<PackageShard | null> {
    try {
      const resp = await this.fetchImpl(`${this.baseUrl}/${pkg}.json`)
      if (!resp.ok) return null
      const text = await resp.text()
      const shard = asShard(JSON.parse(text))
      // A valid-JSON but malformed shard (no `commands` array) must be treated like any
      // other failure (null) — registering it would throw and reject the whole loadAll
      // batch, defeating the best-effort contract. Don't cache a malformed body either.
      if (!shard) return null
      // Caching is best-effort: a failed write (e.g. quota) must not discard the
      // valid shard we just fetched.
      await this.store?.set(this.key(pkg), text).catch(() => {})
      return shard
    } catch {
      return null
    }
  }

  private key(pkg: string): string {
    return `pkgshard:${pkg}`
  }
}
