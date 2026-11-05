import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AssetDownloadError,
  type AssetDownloadEvent,
  AssetDownloadSession,
  isAssetDownloadEvent,
} from './asset-download'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('attempt-scoped asset recovery', () => {
  it('calls the native fetch implementation without binding it to the session', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation')
      return Promise.resolve(new Response('ok'))
    })
    const bytes = await new AssetDownloadSession().read('data:text/plain,ok', { asset: 'data' })
    expect(new TextDecoder().decode(bytes!)).toBe('ok')
  })

  it('keeps overlapping engine sessions distinct when the older session ends', async () => {
    const active = new Set<number>()
    const observe = (event: AssetDownloadEvent) => {
      if (event.phase === 'end') active.delete(event.requestId)
      else active.add(event.requestId)
    }
    let first!: ReadableStreamDefaultController<Uint8Array>
    let second!: ReadableStreamDefaultController<Uint8Array>
    const a = new AssetDownloadSession(
      observe,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              first = controller
            },
          }),
        ),
    )
    const b = new AssetDownloadSession(
      observe,
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              second = controller
            },
          }),
        ),
    )
    const oldDownload = a.read('https://assets.test/a', { asset: 'format' })
    const newDownload = b.read('https://assets.test/b', { asset: 'format' })
    expect(active.size).toBe(2)
    first.enqueue(new Uint8Array([1]))
    first.close()
    await oldDownload
    expect(active.size).toBe(1)
    second.enqueue(new Uint8Array([2]))
    second.close()
    await newDownload
    expect(active.size).toBe(0)
  })

  it('reserves a single allowance across synchronous work and async fetches', async () => {
    vi.useFakeTimers()
    let calls = 0
    const session = new AssetDownloadSession(undefined, async () => {
      calls++
      return new Response('', { status: 503 })
    })
    const worker = session.reserveRetries()
    const concurrent = session.reserveRetries()
    expect(worker.limit).toBe(8)
    expect(concurrent.limit).toBe(0)
    await expect(session.read('https://assets.test/a', { asset: 'font' })).rejects.toBeInstanceOf(
      AssetDownloadError,
    )
    expect(calls).toBe(1)
    concurrent.settle(8) // An invalid reply cannot mint retries.
    worker.settle(2)
    worker.settle(8) // Duplicate terminal replies cannot mint retries either.
    const result = session.read('https://assets.test/b', { asset: 'font' })
    const rejection = expect(result).rejects.toBeInstanceOf(AssetDownloadError)
    await vi.runAllTimersAsync()
    await rejection
    expect(calls).toBe(4)
    expect(session.reserveRetries().limit).toBe(0)
  })

  it('renews a new attempt without accepting a late refund from the previous one', () => {
    const session = new AssetDownloadSession()
    const old = session.reserveRetries()
    session.beginAttempt()
    const current = session.reserveRetries()
    expect(current.limit).toBe(8)
    old.settle(8)
    expect(session.reserveRetries().limit).toBe(0)
    current.settle(3)
    expect(session.reserveRetries().limit).toBe(3)
  })

  it('maps overlapping Worker IDs into distinct host requests and strips extra fields', () => {
    const events: AssetDownloadEvent[] = []
    const session = new AssetDownloadSession((event) => events.push(event))
    const first = {},
      second = {}
    const start = {
      requestId: 1,
      asset: 'font',
      phase: 'start',
      receivedBytes: 0,
      lastByteAgeMs: null,
      retryCount: 0,
    } as const
    session.recordWorkerEvent(first, { ...start, url: 'private' } as AssetDownloadEvent)
    session.recordWorkerEvent(second, start)
    session.recordWorkerEvent(first, { ...start, phase: 'retry', retryCount: 1 })
    session.recordWorkerEvent(first, { ...start, phase: 'end', retryCount: 1 })
    session.recordWorkerEvent(first, { ...start, phase: 'end', retryCount: 1 })
    expect(events).toHaveLength(4)
    expect(events[0]?.requestId).not.toBe(events[1]?.requestId)
    expect(events[2]?.requestId).toBe(events[0]?.requestId)
    expect(events[3]?.requestId).toBe(events[0]?.requestId)
    expect(events.every((event) => !('url' in event))).toBe(true)
    expect(isAssetDownloadEvent(start)).toBe(true)
    for (const extra of [
      { retryCount: 4 },
      { asset: 'url' },
      { receivedBytes: NaN },
      { lastByteAgeMs: -1 },
      { status: 0 },
      { requestId: 0 },
    ]) {
      expect(isAssetDownloadEvent({ ...start, ...extra })).toBe(false)
    }
  })

  it('returns an unused reservation for a legacy Worker reply', () => {
    const session = new AssetDownloadSession()
    const worker = session.reserveRetries()
    worker.settle()
    expect(session.reserveRetries().limit).toBe(8)
  })

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
    const events: AssetDownloadEvent[] = []
    const session = new AssetDownloadSession(
      (e) => events.push(e),
      async () => {
        calls++
        return calls === 1 ? new Response(new ReadableStream()) : new Response('ok')
      },
    )
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
    expect(events.filter((e) => e.asset === 'format' && e.phase === 'end')).toMatchObject([
      { failure: 'cancelled' },
    ])
  })
})
