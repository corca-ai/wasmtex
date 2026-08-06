import { describe, expect, it } from 'vitest'
import { MemoryBinaryStore } from './persistent-cache'
import { durablePreambleKey, PreambleSnapshotCache, preambleSha256 } from './preamble-cache'

const identity = {
  engineBuildId: 'build-1',
  mirrorRevision: '2025-0123456789abcdef',
  texliveUrl: 'https://tex.example/2025/',
  texliveYear: '2025',
}

describe('PreambleSnapshotCache', () => {
  it('binds keys to build, mirror, endpoint, year, and preamble bytes', async () => {
    const key = await durablePreambleKey(identity, '\\documentclass{article}')
    await expect(durablePreambleKey(identity, '\\documentclass{book}')).resolves.not.toBe(key)
    await expect(
      durablePreambleKey({ ...identity, engineBuildId: 'build-2' }, '\\documentclass{article}'),
    ).resolves.not.toBe(key)
  })

  it('round-trips a validated snapshot across cache instances', async () => {
    const store = new MemoryBinaryStore()
    const key = await durablePreambleKey(identity, 'PREAMBLE')
    const snapshot = {
      key,
      workerHash: 'worker-hash',
      format: Uint8Array.of(1, 2, 3).buffer,
      inputFiles: ['/work/local.sty', '/tex/article.cls'],
      projectDependencies: [{ path: 'local.sty', sha256: await preambleSha256('STYLE') }],
    }
    await new PreambleSnapshotCache({ store }).save(snapshot)

    await expect(new PreambleSnapshotCache({ store }).load(key)).resolves.toEqual(snapshot)
  })

  it('evicts least-recently-used formats under the byte budget', async () => {
    const store = new MemoryBinaryStore()
    let now = 1
    const cache = new PreambleSnapshotCache({ store, maxBytes: 5, now: () => now++ })
    const first = await durablePreambleKey(identity, 'FIRST')
    const second = await durablePreambleKey(identity, 'SECOND')
    const record = (key: string) => ({
      key,
      workerHash: 'hash',
      format: Uint8Array.of(1, 2, 3).buffer,
      inputFiles: [],
      projectDependencies: [],
    })
    await cache.save(record(first))
    await cache.save(record(second))

    await expect(cache.load(first)).resolves.toBeNull()
    await expect(cache.load(second)).resolves.not.toBeNull()
  })

  it('clears corrupted metadata and fails closed', async () => {
    const store = new MemoryBinaryStore()
    const key = await durablePreambleKey(identity, 'PREAMBLE')
    await store.set(`preamble:1:${key}:meta`, new TextEncoder().encode('{}').buffer as ArrayBuffer)
    await store.set(`preamble:1:${key}:fmt`, Uint8Array.of(1).buffer)

    await expect(new PreambleSnapshotCache({ store }).load(key)).resolves.toBeNull()
    expect(await store.get(`preamble:1:${key}:fmt`)).toBeNull()
  })

  it('detects corrupted format bytes and fails closed', async () => {
    const store = new MemoryBinaryStore()
    const key = await durablePreambleKey(identity, 'PREAMBLE')
    const cache = new PreambleSnapshotCache({ store })
    await cache.save({
      key,
      workerHash: 'hash',
      format: Uint8Array.of(1, 2, 3).buffer,
      inputFiles: [],
      projectDependencies: [],
    })
    await store.set(`preamble:1:${key}:fmt`, Uint8Array.of(3, 2, 1).buffer)

    await expect(cache.load(key)).resolves.toBeNull()
    expect(await store.get(`preamble:1:${key}:fmt`)).toBeNull()
  })
})
