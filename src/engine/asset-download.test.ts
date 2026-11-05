import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssetDownloadError, type AssetDownloadEvent, AssetDownloadSession } from './asset-download'

afterEach(() => vi.useRealTimers())

describe('attempt-scoped asset recovery', () => {
  it('keeps an unknown-length download alive beyond 180 seconds while bytes arrive', async () => {
    vi.useFakeTimers()
    const events: AssetDownloadEvent[] = []
    let stream!: ReadableStreamDefaultController<Uint8Array>
    const session = new AssetDownloadSession(
      (event) => events.push(event),
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              stream = controller
            },
          }),
        ),
    )
    const result = session.read('https://assets.test/format', { asset: 'format' })
    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(20_000)
      stream.enqueue(new Uint8Array([i]))
      await vi.advanceTimersByTimeAsync(0)
    }
    stream.close()
    expect([...(await result)!]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(events.filter((event) => event.phase === 'bytes')).toHaveLength(10)
    expect(events.some((event) => event.phase === 'retry')).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarts only the failed file on the same URL and reports received bytes at the stall', async () => {
    vi.useFakeTimers()
    const events: AssetDownloadEvent[] = []
    const urls: string[] = []
    let cancelled = false
    const session = new AssetDownloadSession(
      (event) => events.push(event),
      async (input) => {
        urls.push(String(input))
        if (urls.length > 1) return new Response(new Uint8Array([1, 2, 3]))
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array([1]))
            },
            cancel() {
              cancelled = true
            },
          }),
        )
      },
    )
    const result = session.read('https://assets.test/file', { asset: 'package' })
    await vi.advanceTimersByTimeAsync(32_000)
    expect([...(await result)!]).toEqual([1, 2, 3])
    expect(cancelled).toBe(true)
    expect(urls).toEqual(['https://assets.test/file', 'https://assets.test/file'])
    expect(events.find((event) => event.phase === 'retry')).toMatchObject({
      receivedBytes: 1,
      lastByteAgeMs: 30_000,
      retryCount: 1,
      failure: 'stalled',
    })
  })

  it('recovers a live page after a short offline interval without manual Retry', async () => {
    vi.useFakeTimers()
    let online = false
    const session = new AssetDownloadSession(undefined, async () => {
      if (!online) throw new TypeError('network unavailable')
      return new Response(new Uint8Array([7]))
    })
    const result = session.read('https://assets.test/font', { asset: 'font' })
    await vi.advanceTimersByTimeAsync(9_000)
    online = true
    await vi.advanceTimersByTimeAsync(1_000)
    expect([...(await result)!]).toEqual([7])
  })

  it('distinguishes absence, forbidden access and HTML success without retrying them', async () => {
    for (const status of [404, 403, 200]) {
      let calls = 0
      const session = new AssetDownloadSession(undefined, async () => {
        calls++
        return new Response('<html>error</html>', {
          status,
          headers: { 'content-type': 'text/html' },
        })
      })
      const result = session.read('https://assets.test/file', { asset: 'data' })
      if (status === 404) expect(await result).toBeNull()
      else
        await expect(result).rejects.toMatchObject({
          failure: status === 403 ? 'http' : 'invalid',
          status,
        })
      expect(calls).toBe(1)
    }
  })

  it('bounds retries across concurrent files instead of multiplying per-file budgets', async () => {
    vi.useFakeTimers()
    let calls = 0
    const session = new AssetDownloadSession(undefined, async () => {
      calls++
      return new Response('', { status: 503 })
    })
    const results = Promise.allSettled(
      Array.from({ length: 9 }, (_, i) =>
        session.read(`https://assets.test/${i}`, { asset: 'package' }),
      ),
    )
    await vi.runAllTimersAsync()
    expect(
      (await results).every(
        (result) => result.status === 'rejected' && result.reason instanceof AssetDownloadError,
      ),
    ).toBe(true)
    expect(calls).toBe(17)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels a stalled body immediately without retrying or cancelling another consumer', async () => {
    const controller = new AbortController()
    let calls = 0
    const session = new AssetDownloadSession(undefined, async () => {
      calls++
      return calls === 1 ? new Response(new ReadableStream()) : new Response('ok')
    })
    const cancelled = session.read('https://assets.test/a', {
      asset: 'format',
      signal: controller.signal,
    })
    const result = session.read('https://assets.test/b', { asset: 'data' })
    const reason = new Error('project switched')
    controller.abort(reason)
    await expect(cancelled).rejects.toBe(reason)
    expect(new TextDecoder().decode((await result)!)).toBe('ok')
    expect(calls).toBe(2)
  })
})
