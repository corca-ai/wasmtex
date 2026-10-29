import { afterEach, describe, expect, it, vi } from 'vitest'
import { declaredTexFiles, prefetchTexliveResponses } from './transport-prefetch'

afterEach(() => vi.unstubAllGlobals())

describe('transport prefetch', () => {
  it('extracts only literal declarations, including included preambles and package dependencies', () => {
    expect(
      declaredTexFiles(String.raw`
      % \usepackage{ignored}
      \documentclass[12pt]{article}
      \RequirePackage{amsmath, hyperref}
      \LoadClassWithOptions{book}
      \input{driver.def}
      \usepackage{\dynamic,../outside,https://example.com/a,valid-name}
    `).map((file) => file.filename),
    ).toEqual([
      'article.cls',
      'amsmath.sty',
      'hyperref.sty',
      'book.cls',
      'valid-name.sty',
      'driver.def',
    ])
  })

  it('deduplicates dependency cycles and preserves exact response names and file IDs', async () => {
    const fetcher = vi.fn(async (url: string) => {
      const body = url.endsWith('/a.sty')
        ? String.raw`\RequirePackage{b}`
        : String.raw`\RequirePackage{a}`
      return new Response(body, { headers: { fileid: 'actual.sty' } })
    })
    vi.stubGlobal('fetch', fetcher)
    const files = await prefetchTexliveResponses(
      [String.raw`\usepackage{a,a}`],
      'https://mirror/',
      new AbortController().signal,
    )
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/a.sty'))).toHaveLength(1)
    expect(files.find((file) => file.filename === 'a.sty')).toMatchObject({
      format: 26,
      fileId: 'actual.sty',
    })
    expect(files.some((file) => file.filename === 'b.sty')).toBe(true)
  })

  it('limits concurrency and total requests, and does not publish failed or oversized responses', async () => {
    let active = 0
    let peak = 0
    const fetcher = vi.fn(async (url: string) => {
      active++
      peak = Math.max(peak, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active--
      if (url.endsWith('/missing.sty')) return new Response('', { status: 404 })
      if (url.endsWith('/large.sty')) return new Response(new Uint8Array(1024 * 1024 + 1))
      if (url.endsWith('/failed.sty')) throw Error('offline')
      return new Response('package')
    })
    vi.stubGlobal('fetch', fetcher)
    const names = ['missing', 'large', 'failed', ...Array.from({ length: 200 }, (_, i) => `p${i}`)]
    const files = await prefetchTexliveResponses(
      [`\\usepackage{${names.join(',')}}`],
      'https://mirror/',
      new AbortController().signal,
    )
    expect(peak).toBe(8)
    expect(fetcher).toHaveBeenCalledTimes(128)
    expect(files).toHaveLength(125)
  })

  it('avoids math/font speculation for a plain document and skips already resolved files', async () => {
    const fetcher = vi.fn(async () => new Response('plain'))
    vi.stubGlobal('fetch', fetcher)
    const files = await prefetchTexliveResponses(
      [String.raw`\documentclass{article}`],
      'https://mirror/',
      new AbortController().signal,
      new Set(['26/article.cls']),
    )
    expect(files).toEqual([])
  })

  it('bounds retained response bytes even when multiple fetches finish together', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(1024 * 1024))),
    )
    const files = await prefetchTexliveResponses(
      [String.raw`\usepackage{amsmath}`],
      'https://mirror/',
      new AbortController().signal,
    )
    expect(files.reduce((sum, file) => sum + file.data.byteLength, 0)).toBe(8 * 1024 * 1024)
  })

  it('does no work after cancellation', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const controller = new AbortController()
    controller.abort()
    expect(
      await prefetchTexliveResponses(
        [String.raw`\usepackage{amsmath}`],
        'https://mirror/',
        controller.signal,
      ),
    ).toEqual([])
    expect(fetcher).not.toHaveBeenCalled()
  })
})
