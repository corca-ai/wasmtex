import { describe, expect, it } from 'vitest'
import { MemoryBinaryStore, PersistentCache } from './persistent-cache'

const first = 'https://mirror.example/snapshots/one/2025/'
const second = 'https://mirror.example/snapshots/two/2025/'
const payload = {
  files: [{ format: 26, filename: 'same.sty', data: new Uint8Array([1, 2]).buffer }],
  notFound: [{ format: 26, filename: 'missing.sty' }],
  bloomFilter: new Uint8Array([3, 4]).buffer,
}
function cache(store: MemoryBinaryStore, texliveUrl: string, mirrorRevision?: string) {
  return new PersistentCache({ store, texliveUrl, mirrorRevision: mirrorRevision ?? null })
}

describe('persistent mirror identity', () => {
  it('isolates files, misses, and Bloom filters between mirrors within a year', async () => {
    const store = new MemoryBinaryStore()
    await cache(store, first).save(payload)
    expect(await cache(store, second).load()).toBeNull()
    expect(await cache(store, first).load()).toEqual(payload)
  })

  it('isolates revisions even at the same endpoint', async () => {
    const store = new MemoryBinaryStore()
    await cache(store, first, 'revision-one').save(payload)
    expect(await cache(store, first, 'revision-two').load()).toBeNull()
    expect(await cache(store, first, 'revision-one').load()).toEqual(payload)
  })

  it('reuses a normalized absolute mirror URL', async () => {
    const store = new MemoryBinaryStore()
    await cache(store, 'https://MIRROR.example:443/snapshots/one/2025/').save(payload)
    expect(await cache(store, first).load()).toEqual(payload)
  })

  it('clears only the active mirror namespace', async () => {
    const store = new MemoryBinaryStore()
    const a = cache(store, first)
    const b = cache(store, second)
    await a.save(payload)
    await b.save(payload)
    await a.clear()
    expect(await a.load()).toBeNull()
    expect(await b.load()).toEqual(payload)
  })

  it.each([
    '',
    'relative/mirror/',
    'not a URL',
    'https:mirror.example/',
    'https:/mirror.example/',
  ])('ignores incomplete mirror identity %j', async (texliveUrl) => {
    const store = new MemoryBinaryStore()
    const invalid = cache(store, texliveUrl)
    await invalid.save(payload)
    expect(await invalid.load()).toBeNull()
    expect(await store.keys()).toEqual([])
  })

  it('treats year-only legacy entries as a cache miss', async () => {
    const store = new MemoryBinaryStore()
    await store.set('tl:2025:f:26/same.sty', payload.files[0]!.data)
    await store.set('tl:2025:bloom', payload.bloomFilter)
    await store.set(
      'tl:2025:meta',
      new TextEncoder().encode(
        JSON.stringify({
          schema: 1,
          version: '2025',
          entries: { '26/same.sty': { format: 26, filename: 'same.sty', size: 2, lastAccess: 0 } },
          notFound: payload.notFound,
          hasBloom: true,
        }),
      ).buffer,
    )
    expect(await cache(store, first).load()).toBeNull()
  })

  it('waits for a preceding save before clearing the namespace', async () => {
    const store = new MemoryBinaryStore()
    const a = cache(store, first)
    const saving = a.save(payload)
    const clearing = a.clear()
    await Promise.all([saving, clearing])
    expect(await a.load()).toBeNull()
  })
})

it('keeps each mirror budget and eviction independent', async () => {
  const store = new MemoryBinaryStore()
  const a = new PersistentCache({ store, texliveUrl: first, maxBytes: 2 })
  const b = cache(store, second)
  await a.save(payload)
  await b.save(payload)
  await a.save({
    files: [{ format: 26, filename: 'new.sty', data: new Uint8Array([8, 9]).buffer }],
    notFound: [],
  })
  expect((await a.load())!.files.map((file) => file.filename)).toEqual(['new.sty'])
  expect(await b.load()).toEqual(payload)
})

it('does not invent a default mirror for an unknown year', async () => {
  const store = new MemoryBinaryStore()
  const unknown = new PersistentCache({ store, version: 'future' })
  await unknown.save(payload)
  expect(await unknown.load()).toBeNull()
  expect(await store.keys()).toEqual([])
})
