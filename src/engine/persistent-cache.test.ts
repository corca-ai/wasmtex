import { afterEach, describe, expect, it } from 'vitest'
import type { WarmupCache } from '../types'
import {
  type BinaryStore,
  IndexedDbBinaryStore,
  MemoryBinaryStore,
  PersistentCache,
} from './persistent-cache'

function buf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

/** A store that awaits a macrotask before each op, forcing load()/save() to interleave. */
class YieldingStore implements BinaryStore {
  private inner = new MemoryBinaryStore()
  private async tick(): Promise<void> {
    await new Promise((r) => setTimeout(r, 0))
  }
  async get(key: string): Promise<ArrayBuffer | null> {
    await this.tick()
    return this.inner.get(key)
  }
  async set(key: string, value: ArrayBuffer): Promise<void> {
    await this.tick()
    return this.inner.set(key, value)
  }
  async delete(key: string): Promise<void> {
    await this.tick()
    return this.inner.delete(key)
  }
  async keys(): Promise<string[]> {
    await this.tick()
    return this.inner.keys()
  }
}

function warmup(partial: Partial<WarmupCache> = {}): WarmupCache {
  return { files: [], notFound: [], ...partial }
}

/** A cache over `store` pre-seeded with two files (a.sty, b.sty). */
async function cacheWithAB(store: BinaryStore): Promise<PersistentCache> {
  const cache = new PersistentCache({ store })
  await cache.save(
    warmup({
      files: [
        { format: 26, filename: 'a.sty', data: buf([1]) },
        { format: 26, filename: 'b.sty', data: buf([2]) },
      ],
    }),
  )
  return cache
}

describe('PersistentCache', () => {
  it('returns null before anything is saved', async () => {
    const cache = new PersistentCache({ store: new MemoryBinaryStore() })
    expect(await cache.load()).toBeNull()
  })

  it('round-trips files, the 404 set, and the bloom filter', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store, version: '2025' })

    await cache.save(
      warmup({
        files: [
          { format: 26, filename: 'amsmath.sty', data: buf([1, 2, 3]) },
          { format: 3, filename: 'cmr10', data: buf([4, 5]) },
        ],
        notFound: [{ format: 26, filename: 'missing.sty' }],
        bloomFilter: buf([9, 9, 9, 9]),
      }),
    )

    const loaded = await cache.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.files).toHaveLength(2)
    const ams = loaded!.files.find((f) => f.filename === 'amsmath.sty')!
    expect(new Uint8Array(ams.data)).toEqual(new Uint8Array([1, 2, 3]))
    expect(loaded!.notFound).toEqual([{ format: 26, filename: 'missing.sty' }])
    expect(new Uint8Array(loaded!.bloomFilter!)).toEqual(new Uint8Array([9, 9, 9, 9]))
  })

  it('isolates entries by TeX Live version', async () => {
    const store = new MemoryBinaryStore()
    const c2025 = new PersistentCache({ store, version: '2025' })
    const otherVersion = new PersistentCache({ store, version: 'test-version' })

    await c2025.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: buf([1]) }] }))
    expect(await otherVersion.load()).toBeNull()
    expect((await c2025.load())!.files).toHaveLength(1)
  })

  it('merges files and de-duplicates the 404 set across saves', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store })

    await cache.save(
      warmup({
        files: [{ format: 26, filename: 'a.sty', data: buf([1]) }],
        notFound: [{ format: 26, filename: 'x.sty' }],
      }),
    )
    await cache.save(
      warmup({
        files: [{ format: 26, filename: 'b.sty', data: buf([2]) }],
        notFound: [
          { format: 26, filename: 'x.sty' }, // duplicate
          { format: 26, filename: 'y.sty' },
        ],
      }),
    )

    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename).sort()).toEqual(['a.sty', 'b.sty'])
    expect(loaded!.notFound).toHaveLength(2)
  })

  it('removes a persisted 404 when real bytes are saved later', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store })

    await cache.save(warmup({ notFound: [{ format: 26, filename: 'recovered.sty' }] }))
    await cache.save(
      warmup({
        files: [{ format: 26, filename: 'recovered.sty', data: buf([1, 2, 3]) }],
      }),
    )

    const loaded = await cache.load()
    expect(loaded!.files.map((file) => file.filename)).toEqual(['recovered.sty'])
    expect(loaded!.notFound).toEqual([])
  })

  it('does not let a later 404 shadow already cached real bytes', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store })

    await cache.save(
      warmup({
        files: [{ format: 26, filename: 'available.sty', data: buf([4, 5, 6]) }],
      }),
    )
    await cache.save(warmup({ notFound: [{ format: 26, filename: 'available.sty' }] }))

    const loaded = await cache.load()
    expect(loaded!.files.map((file) => file.filename)).toEqual(['available.sty'])
    expect(loaded!.notFound).toEqual([])
  })

  it('repairs legacy metadata that contains the same key as a file and a 404', async () => {
    const store = new MemoryBinaryStore()
    await store.set('tl:2025:f:26/recovered.sty', buf([7, 8, 9]))
    await store.set(
      'tl:2025:meta',
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          version: '2025',
          entries: {
            '26/recovered.sty': {
              format: 26,
              filename: 'recovered.sty',
              size: 3,
              lastAccess: 1,
            },
          },
          notFound: [{ format: 26, filename: 'recovered.sty' }],
          hasBloom: false,
        }),
      ).buffer as ArrayBuffer,
    )

    const cache = new PersistentCache({ store })
    const loaded = await cache.load()
    expect(loaded!.files.map((file) => file.filename)).toEqual(['recovered.sty'])
    expect(loaded!.notFound).toEqual([])

    const repaired = JSON.parse(new TextDecoder().decode((await store.get('tl:2025:meta'))!))
    expect(repaired.notFound).toEqual([])
  })

  it('evicts least-recently-used files past the byte budget', async () => {
    const store = new MemoryBinaryStore()
    let clock = 1000
    const cache = new PersistentCache({ store, maxBytes: 10, now: () => clock })

    // 'old' saved first (older lastAccess), then 'new'. Budget = 10 bytes, each 6 bytes.
    await cache.save(
      warmup({ files: [{ format: 26, filename: 'old.sty', data: buf([0, 0, 0, 0, 0, 0]) }] }),
    )
    clock = 2000
    await cache.save(
      warmup({ files: [{ format: 26, filename: 'new.sty', data: buf([0, 0, 0, 0, 0, 0]) }] }),
    )

    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename)).toEqual(['new.sty'])
  })

  it('evicts the oldest files first to stay within the byte budget', async () => {
    const store = new MemoryBinaryStore()
    let clock = 1000
    const six = () => buf([0, 0, 0, 0, 0, 0])
    // Budget fits two 6-byte files but not three.
    const cache = new PersistentCache({ store, maxBytes: 12, now: () => clock })

    await cache.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: six() }] }))
    clock = 1100
    await cache.save(warmup({ files: [{ format: 26, filename: 'b.sty', data: six() }] }))
    clock = 1200
    await cache.save(warmup({ files: [{ format: 26, filename: 'c.sty', data: six() }] }))

    // a.sty is the oldest and is evicted; the two newest survive.
    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename).sort()).toEqual(['b.sty', 'c.sty'])
  })

  it('load() preserves stored recency so a reload does not flatten LRU order', async () => {
    const store = new MemoryBinaryStore()
    let clock = 1000
    const six = () => buf([0, 0, 0, 0, 0, 0])
    const cache = new PersistentCache({ store, maxBytes: 12, now: () => clock })

    await cache.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: six() }] }))
    clock = 1100
    await cache.save(warmup({ files: [{ format: 26, filename: 'b.sty', data: six() }] }))
    clock = 1200
    // Re-fetch 'a' in a later warmup: now 'a' is MRU and 'b' is the true LRU.
    await cache.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: six() }] }))

    clock = 1300
    await cache.load() // must NOT bump every entry to `now` (that flattens recency)

    clock = 1400
    await cache.save(warmup({ files: [{ format: 26, filename: 'c.sty', data: six() }] }))

    // 'b' is the genuinely least-recently-used and must be the one evicted. If load()
    // had reset a & b to the same timestamp, the tie-break would evict 'a' instead.
    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename).sort()).toEqual(['a.sty', 'c.sty'])
  })

  it('treats a schema/version mismatch as a miss', async () => {
    const store = new MemoryBinaryStore()
    // Forge a meta record with a wrong schema.
    await store.set(
      'tl:2025:meta',
      new TextEncoder().encode(JSON.stringify({ schema: 999, version: '2025', entries: {} }))
        .buffer as ArrayBuffer,
    )
    const cache = new PersistentCache({ store, version: '2025' })
    expect(await cache.load()).toBeNull()
  })

  it('load() tolerates a stored meta record missing entries', async () => {
    const store = new MemoryBinaryStore()
    await store.set(
      'tl:2025:meta',
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          version: '2025',
          notFound: [{ format: 26, filename: 'missing.sty' }],
          hasBloom: false,
        }),
      ).buffer as ArrayBuffer,
    )

    const cache = new PersistentCache({ store, version: '2025' })
    await expect(cache.load()).resolves.toEqual(
      warmup({ notFound: [{ format: 26, filename: 'missing.sty' }] }),
    )
  })

  it('save() tolerates a stored meta record missing notFound (defensive, like load())', async () => {
    const store = new MemoryBinaryStore()
    // A schema/version-valid meta with no `notFound` field (partial write / older writer).
    // load() guards with `?? []`; save() must too, or `meta.notFound.map(...)` throws and
    // the whole write chain rejects.
    await store.set(
      'tl:2025:meta',
      new TextEncoder().encode(JSON.stringify({ schema: 1, version: '2025', entries: {} }))
        .buffer as ArrayBuffer,
    )
    const cache = new PersistentCache({ store, version: '2025' })
    await expect(
      cache.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: buf([1]) }] })),
    ).resolves.toBeUndefined()
    expect((await cache.load())!.files.map((f) => f.filename)).toContain('a.sty')
  })

  it('clear() removes only the targeted version', async () => {
    const store = new MemoryBinaryStore()
    const c2025 = new PersistentCache({ store, version: '2025' })
    const otherVersion = new PersistentCache({ store, version: 'test-version' })
    await c2025.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: buf([1]) }] }))
    await otherVersion.save(warmup({ files: [{ format: 26, filename: 'b.sty', data: buf([2]) }] }))

    await c2025.clear()
    expect(await c2025.load()).toBeNull()
    expect((await otherVersion.load())!.files).toHaveLength(1)
  })

  it('skips entries whose data was lost without throwing', async () => {
    const store = new MemoryBinaryStore()
    const cache = await cacheWithAB(store)
    await store.delete('tl:2025:f:26/a.sty') // simulate partial data loss

    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename)).toEqual(['b.sty'])
  })

  it('lets a new 404 replace a positive entry whose backing data was lost', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store })
    await cache.save(
      warmup({ files: [{ format: 26, filename: 'lost.sty', data: buf([1, 2, 3]) }] }),
    )
    await store.delete('tl:2025:f:26/lost.sty')

    await cache.save(warmup({ notFound: [{ format: 26, filename: 'lost.sty' }] }))

    expect(await cache.load()).toEqual(warmup({ notFound: [{ format: 26, filename: 'lost.sty' }] }))
    const meta = JSON.parse(new TextDecoder().decode((await store.get('tl:2025:meta'))!))
    expect(meta.entries).not.toHaveProperty('26/lost.sty')
  })

  it('prunes meta entries whose data was lost so their size stops counting', async () => {
    const store = new MemoryBinaryStore()
    const cache = await cacheWithAB(store)
    await store.delete('tl:2025:f:26/a.sty') // data lost
    await cache.load() // load() prunes the phantom entry

    const meta = JSON.parse(new TextDecoder().decode((await store.get('tl:2025:meta'))!))
    expect(Object.keys(meta.entries)).toEqual(['26/b.sty'])
  })

  it('does not let load()’s phantom-entry prune clobber a concurrent save()', async () => {
    // load() prunes a phantom entry (blob gone) while a save() writes a new file. The prune
    // must route through the writeChain and re-read the latest meta, else its stale write
    // drops the file the concurrent save just recorded.
    const store = new YieldingStore()
    const cache = await cacheWithAB(store)
    await store.delete('tl:2025:f:26/a.sty') // a.sty is now a phantom entry

    await Promise.all([
      cache.load(),
      cache.save(warmup({ files: [{ format: 26, filename: 'new.sty', data: buf([3]) }] })),
    ])

    const meta = JSON.parse(new TextDecoder().decode((await store.get('tl:2025:meta'))!))
    const keys = Object.keys(meta.entries)
    expect(keys).toContain('26/new.sty') // the concurrent save survives
    expect(keys).not.toContain('26/a.sty') // the phantom is still pruned
  })

  it('serializes concurrent saves without lost updates', async () => {
    const store = new MemoryBinaryStore()
    const cache = new PersistentCache({ store })
    // Two fire-and-forget persists racing on the shared meta record.
    await Promise.all([
      cache.save(warmup({ files: [{ format: 26, filename: 'a.sty', data: buf([1]) }] })),
      cache.save(warmup({ files: [{ format: 26, filename: 'b.sty', data: buf([2]) }] })),
    ])
    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename).sort()).toEqual(['a.sty', 'b.sty'])
  })

  it('keeps just-saved files even when their combined size exceeds the budget', async () => {
    const store = new MemoryBinaryStore()
    const six = () => buf([0, 0, 0, 0, 0, 0])
    // Budget of 10 can't hold both 6-byte files, but neither may be evicted: we
    // just wrote both in one save, so discarding one would lose fresh data.
    const cache = new PersistentCache({ store, maxBytes: 10 })
    await cache.save(
      warmup({
        files: [
          { format: 26, filename: 'a.sty', data: six() },
          { format: 26, filename: 'b.sty', data: six() },
        ],
      }),
    )
    const loaded = await cache.load()
    expect(loaded!.files.map((f) => f.filename).sort()).toEqual(['a.sty', 'b.sty'])
  })
})

/**
 * Minimal controllable fake of the slice of IndexedDB that IndexedDbBinaryStore touches.
 * `openOutcomes` is a queue of per-open results: 'error' fires onerror, 'success' fires
 * onsuccess with a working in-memory db. Handlers fire on a microtask, matching the real
 * async request lifecycle (the store assigns onsuccess/onerror after open() returns).
 */
class FakeIndexedDB {
  openCount = 0
  private data = new Map<string, unknown>()
  constructor(private openOutcomes: Array<'error' | 'success'>) {}

  open(_name: string, _version: number) {
    this.openCount++
    const outcome = this.openOutcomes.shift() ?? 'success'
    const req: Record<string, unknown> = {
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null,
      result: undefined,
      error: null,
    }
    queueMicrotask(() => {
      if (outcome === 'error') {
        req.error = new Error('transient open failure')
        ;(req.onerror as (() => void) | null)?.()
      } else {
        req.result = this.makeDb()
        ;(req.onsuccess as (() => void) | null)?.()
      }
    })
    return req
  }

  private makeDb() {
    const data = this.data
    const fireSuccess = (req: Record<string, unknown>) =>
      queueMicrotask(() => (req.onsuccess as (() => void) | null)?.())
    const objectStore = {
      get(key: string) {
        const req: Record<string, unknown> = {
          onsuccess: null,
          onerror: null,
          result: data.get(key),
        }
        fireSuccess(req)
        return req
      },
      put(value: unknown, key: string) {
        data.set(key, value)
        const req: Record<string, unknown> = { onsuccess: null, onerror: null, result: undefined }
        fireSuccess(req)
        return req
      },
    }
    return {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => objectStore,
      transaction: () => ({ objectStore: () => objectStore }),
    }
  }
}

describe('IndexedDbBinaryStore open() memoization', () => {
  const original = (globalThis as { indexedDB?: unknown }).indexedDB
  afterEach(() => {
    ;(globalThis as { indexedDB?: unknown }).indexedDB = original
  })

  it('does not cache a rejected open — a transient failure can be retried', async () => {
    const fake = new FakeIndexedDB(['error', 'success'])
    ;(globalThis as { indexedDB?: unknown }).indexedDB = fake
    const store = new IndexedDbBinaryStore('t')

    // First open transiently fails: the operation rejects.
    await expect(store.get('k')).rejects.toThrow('transient open failure')
    // IndexedDB has recovered: a later call must re-attempt open() and succeed, not
    // re-await the cached rejected promise.
    await expect(store.get('k')).resolves.toBeNull()
    expect(fake.openCount).toBe(2)
  })

  it('memoizes a successful open across operations', async () => {
    const fake = new FakeIndexedDB(['success'])
    ;(globalThis as { indexedDB?: unknown }).indexedDB = fake
    const store = new IndexedDbBinaryStore('t')

    await store.set('k', new Uint8Array([1, 2, 3]).buffer)
    expect(new Uint8Array((await store.get('k'))!)).toEqual(new Uint8Array([1, 2, 3]))
    expect(fake.openCount).toBe(1)
  })
})
