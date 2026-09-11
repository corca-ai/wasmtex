import { afterEach, expect, it, vi } from 'vitest'
import { WasmTexLuatexEngine } from './luatex-engine'
import { type EngineWorker, setWorkerFactory } from './worker-host'
import { WasmTexXetexEngine } from './xetex-engine'

interface Message {
  cmd: string
  format?: number
  filename?: string
  data?: ArrayBuffer
  entries?: Array<{ format: number; filename: string }>
}

afterEach(() => {
  vi.unstubAllGlobals()
  setWorkerFactory(() => {
    throw new Error('No worker factory installed')
  })
})

it.each([
  WasmTexXetexEngine,
  WasmTexLuatexEngine,
])('injects supplied files into every Unicode worker without detaching caller data (%s)', async (Engine) => {
  const workers: Message[][] = []
  setWorkerFactory(() => {
    const messages: Message[] = []
    workers.push(messages)
    const worker: EngineWorker = {
      onmessage: null,
      onerror: null,
      postMessage(value, transfer) {
        messages.push(structuredClone(value, { transfer: transfer ?? [] }) as Message)
      },
      terminate() {},
    }
    queueMicrotask(() => worker.onmessage?.({ data: { result: 'ok' } }))
    return worker
  })
  const fetch = vi.fn(async (_input: RequestInfo | URL) => new Response(null, { status: 404 }))
  vi.stubGlobal('fetch', fetch)
  const bytes = new Uint8Array([37, 80, 82, 69]).buffer
  const engine = new Engine({
    assetBaseUrl: 'https://assets.invalid/',
    texliveUrl: 'https://mirror.invalid/2026/',
    texliveVersion: '2026',
    persistentCache: false,
    warmupCache: {
      files: [
        { format: 11, filename: 'pdftex.map', data: bytes },
        { format: 3, filename: 'same-font', data: new Uint8Array([1]).buffer },
        { format: 33, filename: 'same-font', data: new Uint8Array([2]).buffer },
      ],
      notFound: [{ format: 26, filename: 'absent.sty' }],
      bloomFilter: new Uint8Array([1, 2, 3, 4]).buffer,
    },
  })
  try {
    await engine.init()
    expect(workers).toHaveLength(Engine === WasmTexXetexEngine ? 2 : 1)
    for (const messages of workers) {
      const file = messages.find(
        (message) => message.cmd === 'preloadtexlive' && message.filename === 'pdftex.map',
      )
      expect(file, 'each worker must receive the caller warmup file').toBeDefined()
      expect(new Uint8Array(file!.data!)).toEqual(new Uint8Array([37, 80, 82, 69]))
    }
    for (const messages of workers) {
      expect(
        messages.some(
          (message) =>
            message.cmd === 'preload404' &&
            message.entries?.some((entry) => entry.filename === 'absent.sty'),
        ),
      ).toBe(true)
    }
    expect(fetch.mock.calls.some((args) => String(args[0]).includes('bloom-filter'))).toBe(false)
    expect(
      workers
        .flat()
        .some((message) => message.cmd === 'preloadtexlive' && message.filename === 'same-font'),
    ).toBe(false)
    expect(bytes.byteLength).toBe(4)
    expect(fetch.mock.calls.some((args) => String(args[0]).endsWith('/11/pdftex.map'))).toBe(false)
  } finally {
    engine.terminate()
  }
})

it.each([
  WasmTexXetexEngine,
  WasmTexLuatexEngine,
])('prefetches canonical filenames without materializing extensionless aliases (%s)', async (Engine) => {
  const workers: Message[][] = []
  setWorkerFactory(() => {
    const messages: Message[] = []
    workers.push(messages)
    const worker: EngineWorker = {
      onmessage: null,
      onerror: null,
      postMessage(value) {
        messages.push(value as Message)
      },
      terminate() {},
    }
    queueMicrotask(() => worker.onmessage?.({ data: { result: 'ok' } }))
    return worker
  })
  const bytes = new Uint8Array([79, 84, 84, 79])
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    return url.endsWith('/47/lmroman10-regular.otf')
      ? new Response(bytes)
      : new Response(null, { status: 404 })
  })
  vi.stubGlobal('fetch', fetch)
  const engine = new Engine({
    assetBaseUrl: 'https://assets.invalid/',
    texliveUrl: 'https://mirror.invalid/snapshots/selected/2025/',
    texliveVersion: '2025',
  })
  try {
    await engine.init()
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith('/47/lmroman10-regular'))).toBe(
      false,
    )
    expect(
      fetch.mock.calls.some(
        ([url]) =>
          String(url) ===
          'https://mirror.invalid/snapshots/selected/2025/pdftex/47/lmroman10-regular.otf',
      ),
    ).toBe(true)
    for (const messages of workers) {
      const loaded = messages.find(
        (message) =>
          message.cmd === 'preloadtexlive' &&
          message.format === 47 &&
          message.filename === 'lmroman10-regular.otf',
      )
      expect(
        messages.some(
          (message) => message.cmd === 'preloadtexlive' && message.filename === 'lmroman10-regular',
        ),
      ).toBe(false)
      expect(loaded).toBeDefined()
      expect(new Uint8Array(loaded!.data!)).toEqual(bytes)
      // A failed speculative request is not proof that a runtime lookup is absent.
      expect(
        messages
          .filter((message) => message.cmd === 'preload404')
          .flatMap((message) => message.entries ?? [])
          .some((entry) => entry.filename === 'lmroman10-bold'),
      ).toBe(false)
    }
  } finally {
    engine.terminate()
  }
})
