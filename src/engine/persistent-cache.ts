/**
 * Built-in persistent cache for TeX Live assets.
 *
 * Durably stores the TeX Live files the engine has fetched (by `format/name`
 * key), plus the bloom filter and the 404 set, so a return visit performs
 * ~zero network fetches for already-seen assets and works offline.
 *
 * The cache is namespaced by TeX Live year (`version`) so bumping the year
 * invalidates cleanly. Storage is abstracted behind {@link BinaryStore}: the
 * browser uses {@link IndexedDbBinaryStore}; environments without IndexedDB
 * fall back to an in-memory store (no durability, but no errors either).
 */
import type { CachedTexliveFile, TexliveFileEntry, WarmupCache } from '../types'

/** Minimal async binary key→value store. */
export interface BinaryStore {
  get(key: string): Promise<ArrayBuffer | null>
  set(key: string, value: ArrayBuffer): Promise<void>
  delete(key: string): Promise<void>
  keys(): Promise<string[]>
}

/** Whether a durable IndexedDB store is usable in this environment. */
export function isIndexedDbSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

/** In-memory store — graceful fallback when IndexedDB is missing, and used in tests. */
export class MemoryBinaryStore implements BinaryStore {
  private map = new Map<string, ArrayBuffer>()

  async get(key: string): Promise<ArrayBuffer | null> {
    return this.map.get(key) ?? null
  }
  async set(key: string, value: ArrayBuffer): Promise<void> {
    this.map.set(key, value)
  }
  async delete(key: string): Promise<void> {
    this.map.delete(key)
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()]
  }
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** IndexedDB-backed binary store. Browser-only; construct behind {@link isIndexedDbSupported}. */
export class IndexedDbBinaryStore implements BinaryStore {
  private storeName = 'files'
  private dbPromise: Promise<IDBDatabase> | null = null

  constructor(private dbName = 'wasmtex-texlive-cache') {}

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise
    // Only memoize a *successful* open. If the open rejects (a transient
    // 'blocked'/VersionError/private-browsing hiccup, or a synchronous throw from
    // indexedDB.open), clear the memo so a later call can retry — otherwise one
    // transient failure poisons every cache op for the lifetime of this store.
    const p = new Promise<IDBDatabase>((resolve, reject) => {
      let req: IDBOpenDBRequest
      try {
        req = indexedDB.open(this.dbName, 1)
      } catch (e) {
        reject(e)
        return
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(this.storeName)) db.createObjectStore(this.storeName)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
    this.dbPromise = p
    // The `=== p` guard avoids clobbering a newer in-flight retry.
    p.catch(() => {
      if (this.dbPromise === p) this.dbPromise = null
    })
    return p
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const db = await this.open()
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName)
    const value = await promisify(store.get(key))
    return (value as ArrayBuffer | undefined) ?? null
  }
  async set(key: string, value: ArrayBuffer): Promise<void> {
    const db = await this.open()
    const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName)
    await promisify(store.put(value, key))
  }
  async delete(key: string): Promise<void> {
    const db = await this.open()
    const store = db.transaction(this.storeName, 'readwrite').objectStore(this.storeName)
    await promisify(store.delete(key))
  }
  async keys(): Promise<string[]> {
    const db = await this.open()
    const store = db.transaction(this.storeName, 'readonly').objectStore(this.storeName)
    const result = await promisify(store.getAllKeys())
    return (result as IDBValidKey[]).map(String)
  }
}

interface CacheEntryMeta {
  format: number
  filename: string
  size: number
  lastAccess: number
}

interface CacheMeta {
  schema: number
  version: string
  entries: Record<string, CacheEntryMeta>
  notFound: TexliveFileEntry[]
  hasBloom: boolean
}

const SCHEMA = 1
/** Default cache budget: 150 MB of TeX Live assets per version. */
const DEFAULT_MAX_BYTES = 150 * 1024 * 1024

export interface PersistentCacheOptions {
  /** TeX Live year; namespaces all keys. Defaults to '2025'. */
  version?: string
  /** Override the backing store (defaults to IndexedDB, falling back to memory). */
  store?: BinaryStore
  /** Soft byte budget; least-recently-used files are evicted past it. */
  maxBytes?: number
  /** Clock injection point for deterministic tests. */
  now?: () => number
}

/**
 * Durable, versioned cache of {@link WarmupCache} contents (files + bloom + 404s)
 * with a byte budget and LRU eviction.
 */
export class PersistentCache {
  private store: BinaryStore
  readonly version: string
  private maxBytes: number
  private now: () => number
  /** Serializes save() so overlapping persists can't lose-update the meta. */
  private writeChain: Promise<void> = Promise.resolve()

  constructor(options: PersistentCacheOptions = {}) {
    this.version = options.version ?? '2025'
    this.store =
      options.store ??
      (isIndexedDbSupported() ? new IndexedDbBinaryStore() : new MemoryBinaryStore())
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES
    this.now = options.now ?? (() => Date.now())
  }

  private metaKey(): string {
    return `tl:${this.version}:meta`
  }
  private fileKey(format: number, filename: string): string {
    return `tl:${this.version}:f:${format}/${filename}`
  }
  private bloomKey(): string {
    return `tl:${this.version}:bloom`
  }

  private async readMeta(): Promise<CacheMeta | null> {
    const buf = await this.store.get(this.metaKey())
    if (!buf) return null
    try {
      const meta = JSON.parse(new TextDecoder().decode(buf)) as CacheMeta
      // A schema or version mismatch is treated as a cache miss (clean invalidation).
      if (meta.schema !== SCHEMA || meta.version !== this.version) return null
      return meta
    } catch {
      return null
    }
  }

  private async writeMeta(meta: CacheMeta): Promise<void> {
    const buf = new TextEncoder().encode(JSON.stringify(meta))
    await this.store.set(this.metaKey(), buf.buffer as ArrayBuffer)
  }

  /** Rehydrate the cached WarmupCache, or null if nothing is stored for this version. */
  async load(): Promise<WarmupCache | null> {
    const meta = await this.readMeta()
    if (!meta) return null

    meta.entries ??= {}
    const files: CachedTexliveFile[] = []
    const positiveKeys = new Set<string>()
    let needsReconcile = false
    for (const key of Object.keys(meta.entries)) {
      const entry = meta.entries[key]!
      const data = await this.store.get(this.fileKey(entry.format, entry.filename))
      if (!data) {
        // Backing blob is gone — prune the meta entry so its phantom size
        // doesn't inflate the byte total and drive wrong eviction.
        delete meta.entries[key]
        needsReconcile = true
        continue
      }
      files.push({ format: entry.format, filename: entry.filename, data })
      positiveKeys.add(key)
      // Do NOT bump entry.lastAccess here: a bulk reload is not a per-file access,
      // and stamping every entry with the same `now` flattens the recency order
      // saved across reloads, so eviction would discard the wrong (newer) file.
    }

    const storedNotFound = meta.notFound ?? []
    const notFound = storedNotFound.filter(
      (entry) => !positiveKeys.has(`${entry.format}/${entry.filename}`),
    )
    if (notFound.length !== storedNotFound.length) needsReconcile = true
    const result: WarmupCache = { files, notFound }
    if (meta.hasBloom) {
      const bloom = await this.store.get(this.bloomKey())
      if (bloom) result.bloomFilter = bloom
    }
    // Persist only when we actually pruned phantom entries — otherwise load() is read-only.
    // Route the prune through the same writeChain as save() and re-read the latest meta, so a
    // concurrent save()'s freshly-recorded file isn't clobbered by load()'s stale write.
    if (needsReconcile) await this.reconcileMeta()
    return result
  }

  /** Reconcile metadata with backing blobs, serialized behind the writeChain and
   *  re-reading current state so it never overwrites a concurrent save(). */
  private reconcileMeta(): Promise<void> {
    const run = this.writeChain.then(async () => {
      const meta = await this.readMeta()
      if (!meta) return
      meta.entries ??= {}
      meta.notFound ??= []
      let changed = false
      const positiveKeys = new Set<string>()
      for (const key of Object.keys(meta.entries)) {
        const entry = meta.entries[key]!
        if (!(await this.store.get(this.fileKey(entry.format, entry.filename)))) {
          delete meta.entries[key]
          changed = true
        } else {
          positiveKeys.add(key)
        }
      }
      const notFound = meta.notFound.filter(
        (entry) => !positiveKeys.has(`${entry.format}/${entry.filename}`),
      )
      if (notFound.length !== meta.notFound.length) {
        meta.notFound = notFound
        changed = true
      }
      if (changed) await this.writeMeta(meta)
    })
    this.writeChain = run.catch(() => {})
    return run
  }

  /**
   * Persist a WarmupCache (merging into any existing entries), then evict past
   * the budget. Saves are serialized so concurrent fire-and-forget persists
   * can't lose-update the shared meta record.
   */
  save(cache: WarmupCache): Promise<void> {
    const run = this.writeChain.then(() => this.doSave(cache))
    this.writeChain = run.catch(() => {})
    return run
  }

  private async doSave(cache: WarmupCache): Promise<void> {
    const meta: CacheMeta = (await this.readMeta()) ?? {
      schema: SCHEMA,
      version: this.version,
      entries: {},
      notFound: [],
      hasBloom: false,
    }
    // readMeta only validates schema/version, so a partially-written/older record may lack
    // these fields — normalize before dereferencing (load() is defensive the same way).
    meta.entries ??= {}
    meta.notFound ??= []
    const now = this.now()
    const savedFileKeys = new Set(cache.files.map((file) => `${file.format}/${file.filename}`))

    for (const file of cache.files) {
      const key = `${file.format}/${file.filename}`
      await this.store.set(this.fileKey(file.format, file.filename), file.data)
      meta.entries[key] = {
        format: file.format,
        filename: file.filename,
        size: file.data.byteLength,
        lastAccess: now,
      }
    }

    // Real bytes always win. Remove older misses before merging new negative
    // entries, and never let a later transient miss shadow cached bytes.
    meta.notFound = meta.notFound.filter(
      (entry) => !savedFileKeys.has(`${entry.format}/${entry.filename}`),
    )
    const seen = new Set(meta.notFound.map((e) => `${e.format}/${e.filename}`))
    for (const entry of cache.notFound) {
      const key = `${entry.format}/${entry.filename}`
      const positive = meta.entries[key]
      if (positive) {
        const data = await this.store.get(this.fileKey(positive.format, positive.filename))
        if (data) continue
        // The metadata survived but the backing blob did not. Drop the phantom
        // positive so this observed miss can be persisted and retried coherently.
        delete meta.entries[key]
      }
      if (!seen.has(key)) {
        seen.add(key)
        meta.notFound.push(entry)
      }
    }

    if (cache.bloomFilter) {
      await this.store.set(this.bloomKey(), cache.bloomFilter)
      meta.hasBloom = true
    }

    await this.evict(meta, savedFileKeys)
    await this.writeMeta(meta)
  }

  private async evict(meta: CacheMeta, keep: Set<string> = new Set()): Promise<void> {
    let total = 0
    for (const key of Object.keys(meta.entries)) total += meta.entries[key]!.size
    if (total <= this.maxBytes) return

    // Evict least-recently-used files until under budget, never discarding the
    // files we just wrote (a single payload larger than the budget is kept as-is
    // rather than thrashing the very data we were asked to persist).
    const byAge = Object.keys(meta.entries).sort(
      (a, b) => meta.entries[a]!.lastAccess - meta.entries[b]!.lastAccess,
    )
    for (const key of byAge) {
      if (total <= this.maxBytes) break
      if (keep.has(key)) continue
      const entry = meta.entries[key]!
      await this.store.delete(this.fileKey(entry.format, entry.filename))
      total -= entry.size
      delete meta.entries[key]
    }
  }

  /** Drop everything stored for this version. */
  async clear(): Promise<void> {
    const prefix = `tl:${this.version}:`
    for (const key of await this.store.keys()) {
      if (key.startsWith(prefix)) await this.store.delete(key)
    }
  }
}

/**
 * Clear the durable TeX Live asset cache for a given TeX Live year (default
 * '2025'). No-op when IndexedDB is unavailable. Useful for "clear cache"
 * actions without an engine instance.
 */
export async function clearTexliveCache(options?: { version?: string }): Promise<void> {
  if (!isIndexedDbSupported()) return
  const cacheOptions: PersistentCacheOptions = {}
  if (options?.version) cacheOptions.version = options.version
  await new PersistentCache(cacheOptions).clear()
}
