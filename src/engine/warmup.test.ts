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
