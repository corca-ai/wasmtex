import { afterEach, describe, expect, it, vi } from 'vitest'
import { WasmTexCompiler } from '../headless'
import type { AssetDownloadEvent } from './asset-download'
import { WasmTexLuatexEngine } from './luatex-engine'
import { setWorkerFactory } from './worker-host'
import { WasmTexXetexEngine } from './xetex-engine'

describe('prebuilt format failure classification', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it.each([
    403, 200,
  ])('refuses a failed gzip representation (%s) without a raw-format fallback', async (status) => {
    installStubWorkerFactory()
    const requested: string[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      requested.push(url)
      return url.endsWith('.fmt.gz')
        ? new Response('<html>not a format</html>', {
            status,
            headers: { 'content-type': 'text/html' },
          })
        : new Response(null, { status: 404 })
    })
    const engine = new WasmTexLuatexEngine({ assetBaseUrl: 'https://x/', texliveVersion: '2025' })
    try {
      await expect(engine.init()).rejects.toMatchObject({
        failure: status === 403 ? 'http' : 'invalid',
      })
      expect(requested.filter((url) => url.endsWith('.fmt.gz'))).toHaveLength(1)
      expect(requested.some((url) => url.endsWith('.fmt'))).toBe(false)
    } finally {
      engine.terminate()
    }
  })

  it.each([
    'raw',
    'gzip',
  ])('reports corrupt %s bytes as one classified terminal failure through headless init', async (representation) => {
    installStubWorkerFactory()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = String(input)
      if (representation === 'raw' && url.endsWith('.fmt'))
        return new Response(new Uint8Array([1, 2, 3]))
      if (representation === 'gzip' && url.endsWith('.fmt.gz'))
        return new Response(new Uint8Array([0x1f, 0x8b, 0]))
      return new Response(null, { status: 404 })
    })
    const events: AssetDownloadEvent[] = []
    const compiler = new WasmTexCompiler({
      engine: 'lualatex',
      assetBaseUrl: 'https://x/',
      texliveVersion: '2025',
      files: { 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}' },
      onAssetDownload: (event) => events.push(event),
    })
    try {
      await expect(compiler.init()).rejects.toMatchObject({ failure: 'invalid' })
      const failure = events.find((event) => event.phase === 'end' && event.failure === 'invalid')
      expect(failure).toBeDefined()
      expect(
        events.filter((event) => event.requestId === failure?.requestId && event.phase === 'end'),
      ).toEqual([failure])
      expect(events.some((event) => event.phase === 'retry')).toBe(false)
    } finally {
      compiler.dispose()
    }
  })

  it('reports byte progress to its compiler even when the format has no Content-Length', async () => {
    installStubWorkerFactory()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('.fmt')) return new Response(null, { status: 404 })
      const response = streamingFormatResponse(131072)
      response.headers.delete('content-length')
      return response
    })
    const events: AssetDownloadEvent[] = []
    const engine = new WasmTexLuatexEngine({ assetBaseUrl: 'https://x/', texliveVersion: '2025' })
    engine.onAssetDownload = (event) => events.push(event)
    try {
      await engine.init()
      expect(
        events.filter((event) => event.phase === 'bytes').map((event) => event.receivedBytes),
      ).toEqual([32768, 65536, 98304, 131072])
      expect(events.every((event) => !('url' in event) && !('file' in event))).toBe(true)
    } finally {
      engine.terminate()
    }
  })
})

// Stub worker: as soon as the driver assigns `onmessage`, deliver the WASM
// postRun `{ result: 'ok' }` so init() resolves. postMessage is a no-op.
function installStubWorkerFactory(): void {
  setWorkerFactory(() => {
    let onmessage: ((ev: { data: unknown }) => void) | null = null
    return {
      postMessage() {},
      terminate() {},
      get onmessage() {
        return onmessage
      },
      set onmessage(fn: ((ev: { data: unknown }) => void) | null) {
        onmessage = fn
        if (fn) queueMicrotask(() => fn({ data: { result: 'ok' } }))
      },
      onerror: null,
    }
  })
}

/** A Response whose body streams `byteLength` bytes in 4 chunks, with a matching
 *  Content-Length, a first byte != 0x3c, and length > 65536 (looksLikeFormat). */
function streamingFormatResponse(byteLength: number): Response {
  const body = new Uint8Array(byteLength).fill(0x41) // 'A', not '<'
  let pos = 0
  const chunkSize = Math.ceil(byteLength / 4)
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pos >= body.length) {
        controller.close()
        return
      }
      const end = Math.min(pos + chunkSize, body.length)
      controller.enqueue(body.slice(pos, end))
      pos = end
    },
  })
  return new Response(stream, { headers: { 'Content-Length': String(byteLength) } })
}

/** Route fetches: the plain `.fmt` streams a valid format; everything else 404s
 *  (the `.gz` variant and the bloom/warmup prefetches). */
function installFetchStub(byteLength: number): void {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('.fmt')) return Promise.resolve(streamingFormatResponse(byteLength))
    return Promise.resolve(new Response(null, { status: 404 }))
  })
}

/** `.gz` returns a raw gzip-magic body (>65536, no Content-Encoding); the plain `.fmt`
 *  returns a distinct valid format; everything else 404s. */
function installRawGzFetchStub(byteLength: number): void {
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.endsWith('.fmt.gz')) {
      const gz = new Uint8Array(byteLength)
      gz[0] = 0x1f // gzip magic, served raw
      gz[1] = 0x8b
      return Promise.resolve(
        new Response(gz, { headers: { 'Content-Length': String(byteLength) } }),
      )
    }
    if (url.endsWith('.fmt')) return Promise.resolve(streamingFormatResponse(byteLength))
    return Promise.resolve(new Response(null, { status: 404 }))
  })
}

describe('BaseTexFmtEngine format preload without DecompressionStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setWorkerFactory(() => {
      throw new Error('worker factory not installed')
    })
  })

  const SIZE = 65536 * 2
  const opts = { assetBaseUrl: 'https://x/', texliveVersion: '2025' } as const

  it('does not accept raw-gzipped bytes as the format when DecompressionStream is absent', async () => {
    installStubWorkerFactory()
    installRawGzFetchStub(SIZE)
    vi.stubGlobal('DecompressionStream', undefined) // host lacks the API; server serves .gz raw

    const engine = new WasmTexLuatexEngine(opts)
    await engine.init()

    const fmtBytes = (engine as unknown as { fmtBytes: Uint8Array | null }).fmtBytes
    // The gz path must be skipped → the plain .fmt fallback wins (first byte 0x41 'A'),
    // never the still-compressed gzip-magic blob (0x1f) that would boot a garbage format.
    expect(fmtBytes).not.toBeNull()
    expect(fmtBytes![0]).toBe(0x41)
    expect(fmtBytes![0]).not.toBe(0x1f)
  })
})

describe('BaseTexFmtEngine onProgress during format preload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setWorkerFactory(() => {
      throw new Error('worker factory not installed')
    })
  })

  const SIZE = 65536 * 4 // > looksLikeFormat threshold; 4 stream chunks
  const opts = { assetBaseUrl: 'https://x/', texliveVersion: '2025' } as const

  it.each([
    ['LuaLaTeX', () => new WasmTexLuatexEngine(opts)],
    ['XeLaTeX', () => new WasmTexXetexEngine(opts)],
  ] as const)('reports streamed format-download progress for %s (ending at 100)', async (_name, makeEngine) => {
    installStubWorkerFactory()
    installFetchStub(SIZE)
    const engine = makeEngine()
    const calls: number[] = []
    engine.onProgress = (p) => calls.push(p)

    await engine.init()

    expect(calls.length).toBeGreaterThan(0)
    expect(calls.at(-1)).toBe(100)
  })
})
