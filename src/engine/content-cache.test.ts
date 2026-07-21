import { describe, expect, it, vi } from 'vitest'
import type { ToolBackend } from './backend-registry'
import { contentKey, MemoryCacheStore, withCache } from './content-cache'

describe('contentKey (#112)', () => {
  it('is deterministic and order-independent for object keys', async () => {
    const a = await contentKey({ x: 1, y: [2, 3], z: 'q' })
    const b = await contentKey({ z: 'q', y: [2, 3], x: 1 })
    expect(a).toBe(b)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })

  it('differs when the input differs', async () => {
    expect(await contentKey({ x: 1 })).not.toBe(await contentKey({ x: 2 }))
  })

  it('distinguishes null from undefined (no wrong-artifact collision)', async () => {
    // A field that is explicitly `null` is a different request than one that is
    // `undefined`/absent — they must not share a cache key (else the 2nd is served the
    // 1st's artifact).
    expect(await contentKey({ field: null })).not.toBe(await contentKey({ field: undefined }))
  })

  it('treats an absent key and a present-but-undefined key as equal (matches JSON body)', async () => {
    // `JSON.stringify` (the actual POSTed body) omits undefined-valued keys, so the cache
    // key must too — otherwise `{idx}` and `{idx, options: undefined}` are the same work
    // yet miss each other in the cache.
    expect(await contentKey({ idx: 'X' })).toBe(await contentKey({ idx: 'X', options: undefined }))
    expect(await contentKey({})).toBe(await contentKey({ a: undefined }))
  })

  it('serializes undefined array elements as null (matches JSON body)', async () => {
    // `JSON.stringify([undefined])` is `"[null]"`, so two requests whose array holds a hole
    // vs. an explicit null POST byte-identical bodies — they must share a cache key, else
    // already-cached work misses itself and one server artifact gets two keys.
    expect(await contentKey({ modules: [undefined] })).toBe(await contentKey({ modules: [null] }))
  })

  it('serializes array HOLES (sparse gaps) as null too (matches JSON body)', async () => {
    // `Array.prototype.map` SKIPS holes, so a literal gap `[1, , 3]` was serialized as
    // `"[1,,3]"` while `JSON.stringify([1, , 3])` is `"[1,null,3]"` — byte-identical POST
    // bodies got different cache keys, silently defeating dedup. A hole must key like null.
    // biome-ignore lint/suspicious/noSparseArray: the hole is exactly what we are testing.
    expect(await contentKey([1, , 3])).toBe(await contentKey([1, null, 3]))
    const sparse: unknown[] = [1]
    sparse[2] = 3 // leaves index 1 a hole
    expect(await contentKey({ modules: sparse })).toBe(await contentKey({ modules: [1, null, 3] }))
  })
})

describe('withCache (#112)', () => {
  function countingBackend(): { backend: ToolBackend<string, string>; runs: () => number } {
    const run = vi.fn(async (req: string) => `out:${req}`)
    return {
      backend: { id: 'b', location: 'server', run },
      runs: () => run.mock.calls.length,
    }
  }

  it('runs the backend on a miss, then serves hits from the store without re-running', async () => {
    const { backend, runs } = countingBackend()
    const cached = withCache(backend, new MemoryCacheStore())

    expect(await cached.run('a')).toBe('out:a')
    expect(await cached.run('a')).toBe('out:a') // hit
    expect(await cached.run('a')).toBe('out:a') // hit
    expect(runs()).toBe(1)
    expect(cached.id).toBe('b+cache')

    expect(await cached.run('b')).toBe('out:b') // different input → miss
    expect(runs()).toBe(2)
  })

  it('a store pre-populated on one host serves the other host instantly (shared cache)', async () => {
    const store = new MemoryCacheStore()
    const serverKey = await contentKey('shared-input')
    store.set(serverKey, 'precomputed-by-server')

    const { backend, runs } = countingBackend()
    const clientCached = withCache(backend, store)
    expect(await clientCached.run('shared-input')).toBe('precomputed-by-server')
    expect(runs()).toBe(0) // never ran the (client) backend — the server's result was reused
  })
})
