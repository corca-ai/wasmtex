import { afterEach, describe, expect, it, vi } from 'vitest'
import { WasmTexPdftexEngine } from './wasmtex-engine'
import { type EngineWorker, setWorkerFactory } from './worker-host'

function boot() {
  const commands: string[] = []
  const worker: EngineWorker = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    postMessage(value) {
      const message = value as { cmd: string; msgId?: string }
      commands.push(message.cmd)
      worker.onmessage?.({
        data: {
          ...message,
          cmd: message.cmd === 'compilelatex' ? 'compile' : message.cmd,
          result: 'ok',
          status: 0,
        },
      })
    },
  }
  const restore = setWorkerFactory(() => worker)
  return { worker, restore, commands }
}

afterEach(() => vi.unstubAllGlobals())

describe('pdfTeX startup scheduling', () => {
  it('downloads format, map and bloom while WASM boots, but installs only after ready', async () => {
    const host = boot()
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    vi.stubGlobal('fetch', fetcher)
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    try {
      const initializing = engine.init()
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3))
      expect(host.commands).toEqual([])
      host.worker.onmessage?.({ data: { result: 'ok' } })
      await initializing
      expect(host.commands).toEqual(['settexliveurl', 'loadbloom', 'loadformat', 'preloadtexlive'])
    } finally {
      engine.terminate()
      host.restore()
    }
  })

  it('keeps caller warmup precedence and the format opt-out without redundant downloads', async () => {
    const host = boot()
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const engine = new WasmTexPdftexEngine({
      assetBaseUrl: '/',
      skipFormatPreload: true,
      warmupCache: {
        files: [{ format: 11, filename: 'pdftex.map', data: new ArrayBuffer(3) }],
        notFound: [],
        bloomFilter: new ArrayBuffer(9),
      },
    })
    try {
      const initializing = engine.init()
      host.worker.onmessage?.({ data: { result: 'ok' } })
      await initializing
      expect(fetcher).not.toHaveBeenCalled()
      expect(host.commands.filter((command) => command === 'preloadtexlive')).toHaveLength(1)
    } finally {
      engine.terminate()
      host.restore()
    }
  })

  it('allows demand loading when startup downloads fail', async () => {
    const host = boot()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    try {
      const initializing = engine.init()
      host.worker.onmessage?.({ data: { result: 'ok' } })
      await expect(initializing).resolves.toBeUndefined()
      expect(host.commands).toEqual(['settexliveurl'])
    } finally {
      engine.terminate()
      host.restore()
    }
  })
})

describe('pdfTeX speculative preparation lifetime', () => {
  it('rejects overlap and disposal during transport preparation without sending late work', async () => {
    const host = boot()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1]))),
    )
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    try {
      const initializing = engine.init()
      host.worker.onmessage?.({ data: { result: 'ok', transportPrefetch: true } })
      await initializing
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener(
                'abort',
                () => reject(new DOMException('Aborted', 'AbortError')),
                { once: true },
              )
            }),
        ),
      )
      const compiling = engine.compile()
      const rejected = expect(compiling).rejects.toMatchObject({ name: 'AbortError' })
      await expect(engine.compile()).rejects.toThrow(/not ready/i)
      engine.terminate()
      await rejected
      expect(host.commands).not.toContain('preloadtransport')
      expect(host.commands).not.toContain('compilelatex')
    } finally {
      engine.terminate()
      host.restore()
    }
  })

  it('prepares only the first compile and keeps repeated compiles free of speculative fetches', async () => {
    const host = boot()
    const fetcher = vi.fn(async () => new Response('plain'))
    vi.stubGlobal('fetch', fetcher)
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: '/' })
    try {
      const initializing = engine.init()
      host.worker.onmessage?.({ data: { result: 'ok', transportPrefetch: true } })
      await initializing
      await engine.compile()
      const calls = fetcher.mock.calls.length
      await engine.compile()
      expect(fetcher).toHaveBeenCalledTimes(calls)
      expect(host.commands.filter((command) => command === 'preloadtransport')).toHaveLength(1)
      expect(host.commands.filter((command) => command === 'compilelatex')).toHaveLength(2)
    } finally {
      engine.terminate()
      host.restore()
    }
  })
})
