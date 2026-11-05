import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AssetDownloadEvent } from './asset-download'
import { warmup } from './warmup'

describe('warmup cancellation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects with AbortError when the signal is aborted', async () => {
    // Every fetch failure (incl. the AbortError from the aborted in-flight fetch) is
    // swallowed for graceful degradation, so the abort must surface via an explicit check.
    vi.stubGlobal('fetch', () =>
      Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
    )
    const ctrl = new AbortController()
    ctrl.abort()
    await expect(
      warmup({ signal: ctrl.signal, concurrency: 1, texliveUrl: 'https://example.test/' }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })

  it.each([
    { status: 200, contentType: 'Text/HTML' },
    { status: 206, contentType: 'application/octet-stream' },
  ])('does not install invalid success $status/$contentType', async ({ status, contentType }) => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('<html>error</html>', { status, headers: { 'content-type': contentType } }),
    )
    const result = await warmup({ concurrency: 2, texliveUrl: 'https://example.test/' })
    expect(result.files).toEqual([])
  })

  it('resolves normally (does not over-throw) when not aborted', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })))
    const result = await warmup({ concurrency: 2, texliveUrl: 'https://example.test/' })
    expect(Array.isArray(result.files)).toBe(true)
    expect(Array.isArray(result.notFound)).toBe(true)
  })
})

describe('warmup dependency-set replay', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const dependencies = {
    schemaVersion: 1 as const,
    texliveVersion: '2025' as const,
    profile: { id: 'p', texliveYear: '2025' as const, mirrorRevision: 'r1' },
    files: [
      { format: 33, filename: 'ptmr7t.vf', candidate: 'ptmr7t' },
      { format: 26, filename: 'IEEEtran.cls' },
    ],
    notFound: [{ format: 33, filename: 'ptmb7t.vf' }],
    complete: true,
  }

  it('fetches the set on top of the built-in manifest, candidates under request names', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    })
    const cache = await warmup({ dependencies, concurrency: 2, texliveUrl: 'https://m.test/' })
    const mirror = urls.filter((u) => u.includes('/pdftex/'))
    expect(mirror).toContain('https://m.test/pdftex/26/IEEEtran.cls')
    expect(mirror).toContain('https://m.test/pdftex/33/ptmr7t')
    expect(mirror).toContain('https://m.test/pdftex/26/article.cls')
    expect(mirror).not.toContain('https://m.test/pdftex/33/ptmr7t.vf')
    expect(new Set(mirror).size).toBe(mirror.length)
    const names = cache.files.map((f) => `${f.format}/${f.filename}`)
    expect(names).toContain('26/IEEEtran.cls')
    expect(names).toContain('33/ptmr7t.vf')
    expect(names).toContain('26/article.cls')
    expect(cache.notFound).toContainEqual({ format: 33, filename: 'ptmb7t.vf' })
  })

  it('drops a built-in negative entry that the set resolved', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 404 })))
    const resolvedNegative = { format: 26, filename: 'graphicx.cfg' }
    const cache = await warmup({
      dependencies: { ...dependencies, files: [resolvedNegative], notFound: [] },
      concurrency: 4,
      texliveUrl: 'https://m.test/',
    })
    expect(cache.notFound).not.toContainEqual(resolvedNegative)
  })

  it('ignores a dependency set recorded against another TeX Live year', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    await warmup({
      dependencies,
      texliveVersion: '2026',
      concurrency: 4,
      texliveUrl: 'https://m.test/',
    })
    expect(urls.some((u) => u.endsWith('/pdftex/26/IEEEtran.cls'))).toBe(false)
    expect(urls.some((u) => u.endsWith('/pdftex/26/article.cls'))).toBe(true)
  })

  it('lets explicit files/notFound override everything', async () => {
    const urls: string[] = []
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url)
      return Promise.resolve(new Response(null, { status: 404 }))
    })
    const cache = await warmup({
      dependencies,
      files: [{ format: 26, filename: 'only.sty' }],
      notFound: [],
      texliveUrl: 'https://m.test/',
    })
    expect(urls.filter((u) => u.includes('/pdftex/'))).toEqual([
      'https://m.test/pdftex/26/only.sty',
    ])
    expect(cache.notFound).toEqual([])
  })
})

describe('warmup byte progress', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps a slow unknown-length replay alive beyond the compile timeout', async () => {
    vi.useFakeTimers()
    const events: AssetDownloadEvent[] = []
    let stream!: ReadableStreamDefaultController<Uint8Array>
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('/pdftex/')
        ? new Response(
            new ReadableStream<Uint8Array>({
              start(c) {
                stream = c
              },
            }),
          )
        : new Response(null, { status: 404 }),
    )
    const result = warmup({
      files: [{ format: 26, filename: 'slow.sty' }],
      onAssetDownload: (e) => events.push(e),
      texliveUrl: 'https://m.test/',
    })
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(20_000)
      stream.enqueue(new Uint8Array([i]))
    }
    stream.close()
    expect((await result).files[0]?.data.byteLength).toBe(10)
    expect(events.filter((e) => e.asset === 'package' && e.phase === 'bytes')).toHaveLength(10)
    expect(events.some((e) => e.phase === 'retry')).toBe(false)
  })

  it('abandons a stalled speculative file without retries or negative cache entries', async () => {
    vi.useFakeTimers()
    const events: AssetDownloadEvent[] = []
    const fetcher = vi.fn(async (url: string) =>
      url.includes('/pdftex/')
        ? new Response(new ReadableStream<Uint8Array>())
        : new Response(null, { status: 404 }),
    )
    vi.stubGlobal('fetch', fetcher)
    const result = warmup({
      files: [{ format: 26, filename: 'stalled.sty' }],
      notFound: [],
      onAssetDownload: (e) => events.push(e),
      texliveUrl: 'https://m.test/',
    })
    await vi.advanceTimersByTimeAsync(30_001)
    expect(await result).toMatchObject({ files: [], notFound: [] })
    expect(fetcher.mock.calls.filter(([url]) => url.includes('/pdftex/'))).toHaveLength(1)
    expect(events.find((e) => e.asset === 'package' && e.phase === 'end')).toMatchObject({
      failure: 'stalled',
      retryCount: 0,
    })
  })
})
