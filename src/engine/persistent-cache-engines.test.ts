import { afterEach, describe, expect, it, vi } from 'vitest'
import { WasmTexLuatexEngine } from './luatex-engine'
import {
  clearTexliveCache,
  IndexedDbBinaryStore,
  MemoryBinaryStore,
  PersistentCache,
} from './persistent-cache'
import { WasmTexPdftexEngine } from './wasmtex-engine'
import { type EngineWorker, setWorkerFactory } from './worker-host'
import { WasmTexXetexEngine } from './xetex-engine'

const mirror = 'https://mirror.example/snapshots/one/2025/'
const otherMirror = 'https://mirror.example/snapshots/two/2025/'
const data = {
  files: [{ format: 26, filename: 'unique.sty', data: new Uint8Array([5, 6]).buffer }],
  notFound: [{ format: 26, filename: 'unique-miss.sty' }],
  bloomFilter: new Uint8Array([7, 8]).buffer,
}

function installStore(): MemoryBinaryStore {
  const store = new MemoryBinaryStore()
  vi.stubGlobal('indexedDB', {})
  vi.spyOn(IndexedDbBinaryStore.prototype, 'get').mockImplementation((key) => store.get(key))
  vi.spyOn(IndexedDbBinaryStore.prototype, 'set').mockImplementation((key, value) =>
    store.set(key, value),
  )
  vi.spyOn(IndexedDbBinaryStore.prototype, 'delete').mockImplementation((key) => store.delete(key))
  vi.spyOn(IndexedDbBinaryStore.prototype, 'keys').mockImplementation(() => store.keys())
  return store
}

interface Message {
  cmd: string
  msgId?: string
  filename?: string
  data?: ArrayBuffer
  entries?: Array<{ filename: string }>
}
function observeWorkers(): Message[][] {
  const messages: Message[][] = []
  setWorkerFactory(() => {
    const recorded: Message[] = []
    messages.push(recorded)
    const worker: EngineWorker = {
      onmessage: null,
      onerror: null,
      terminate() {},
      postMessage(value, transfer) {
        const message = structuredClone(value, { transfer: transfer ?? [] }) as Message
        recorded.push(message)
        if (message.msgId)
          queueMicrotask(() => worker.onmessage?.({ data: { msgId: message.msgId, result: 'ok' } }))
      },
    }
    queueMicrotask(() => worker.onmessage?.({ data: { result: 'ok' } }))
    return worker
  })
  vi.stubGlobal('fetch', async () => new Response(null, { status: 404 }))
  return messages
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setWorkerFactory(() => {
    throw new Error('No worker factory installed')
  })
})

describe.each([
  WasmTexPdftexEngine,
  WasmTexXetexEngine,
  WasmTexLuatexEngine,
])('%s mirror restoration', (Engine) => {
  it('rehydrates only matching files, misses and Bloom into each worker', async () => {
    const store = installStore()
    await new PersistentCache({ store, texliveUrl: mirror, mirrorRevision: 'r1' }).save(data)
    for (const [texliveUrl, mirrorRevision, matched] of [
      [otherMirror, 'r1', false],
      [mirror, 'r2', false],
      [mirror, 'r1', true],
    ] as const) {
      const workers = observeWorkers()
      const engine = new Engine({
        assetBaseUrl: 'https://assets.example/',
        texliveUrl,
        persistentCache: true,
        resolverProfile: { id: 'test', texliveYear: '2025', mirrorRevision },
      })
      try {
        await engine.init()
        expect(workers).toHaveLength(Engine === WasmTexXetexEngine ? 2 : 1)
        for (const messages of workers) {
          const file = messages.find(
            (message) => message.cmd === 'preloadtexlive' && message.filename === 'unique.sty',
          )
          expect(!!file).toBe(matched)
          expect(
            messages.some(
              (message) =>
                message.cmd === 'preload404' &&
                message.entries?.some((entry) => entry.filename === 'unique-miss.sty'),
            ),
          ).toBe(matched)
          const bloom = messages.find((message) => message.cmd === 'loadbloom')
          expect(!!bloom).toBe(matched)
          if (matched) {
            expect(new Uint8Array(file!.data!)).toEqual(new Uint8Array([5, 6]))
            expect(new Uint8Array(bloom!.data!)).toEqual(new Uint8Array([7, 8]))
          }
        }
      } finally {
        engine.terminate()
      }
    }
  })

  it('clears its own mirror while preserving another mirror', async () => {
    const store = installStore()
    const own = new PersistentCache({ store, texliveUrl: mirror })
    const other = new PersistentCache({ store, texliveUrl: otherMirror })
    await own.save(data)
    await other.save(data)
    const engine = new Engine({ assetBaseUrl: '/', texliveUrl: mirror, persistentCache: true })
    await engine.clearCache()
    expect(await own.load()).toBeNull()
    expect(await other.load()).toEqual(data)
    engine.terminate()
  })
})

it('standalone year clear removes all mirror namespaces and legacy keys only for that year', async () => {
  const store = installStore()
  const a = new PersistentCache({ store, texliveUrl: mirror })
  const b = new PersistentCache({ store, texliveUrl: otherMirror })
  const nextYear = new PersistentCache({ store, version: '2026' })
  for (const cache of [a, b, nextYear]) await cache.save(data)
  await store.set('tl:2025:meta', new ArrayBuffer(1))
  await store.set('tl:2025:f:26/legacy.sty', new ArrayBuffer(1))
  await store.set('unrelated:key', new ArrayBuffer(1))
  await clearTexliveCache({ version: '2025' })
  expect(await a.load()).toBeNull()
  expect(await b.load()).toBeNull()
  expect((await store.keys()).some((key) => key.startsWith('tl:2025:'))).toBe(false)
  expect(await nextYear.load()).toEqual(data)
  expect(await store.get('unrelated:key')).not.toBeNull()
})

it('does not restore a cache from a dump that started before engine.clearCache()', async () => {
  const store = installStore()
  observeWorkers()
  let finishDump!: (value: typeof data) => void
  const dump = new Promise<typeof data>((resolve) => {
    finishDump = resolve
  })
  class DeferredDumpEngine extends WasmTexPdftexEngine {
    override dumpTexliveCache() {
      return dump
    }
  }
  const engine = new DeferredDumpEngine({
    assetBaseUrl: '/',
    texliveUrl: mirror,
    persistentCache: true,
  })
  try {
    await engine.init()
    const saving = engine.persistTexliveCache()
    await engine.clearCache()
    finishDump(data)
    await saving
    expect(await new PersistentCache({ store, texliveUrl: mirror }).load()).toBeNull()
  } finally {
    engine.terminate()
  }
})
