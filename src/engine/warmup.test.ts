import { afterEach, describe, expect, it, vi } from 'vitest'
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
