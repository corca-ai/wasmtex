import { describe, expect, it } from 'vitest'
import { BaseWorkerEngine, resolveTexliveUrl } from './base-worker-engine'
import type { EngineWorker } from './worker-host'

/** Minimal concrete subclass with a fake worker, to exercise the request/response
 *  plumbing without spawning a real Worker. */
class TestEngine extends BaseWorkerEngine {
  constructor() {
    super('/engine.js', null)
  }
  attachFakeWorker(
    worker: EngineWorker = {
      postMessage() {},
      terminate() {},
      onmessage: null,
      onerror: null,
    },
  ): void {
    this.worker = worker
    this.status = 'ready'
  }
  request(key: string, transfer?: Transferable[]): Promise<unknown> {
    return this.postMessageWithResponse({ cmd: key }, `cmd:${key}`, transfer)
  }
  deliver(key: string, data: unknown): boolean {
    return this.deliverResponse(`cmd:${key}`, data)
  }
}

describe('BaseWorkerEngine in-flight cancellation (issue #59)', () => {
  it('rejects a pending request with AbortError on terminate()', async () => {
    const engine = new TestEngine()
    engine.attachFakeWorker()
    const pending = engine.request('compile')
    engine.terminate()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects every queued same-key request (no silent drop)', async () => {
    const engine = new TestEngine()
    engine.attachFakeWorker()
    const a = engine.request('compile')
    const b = engine.request('compile')
    engine.terminate()
    await expect(a).rejects.toMatchObject({ name: 'AbortError' })
    await expect(b).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('still resolves normally when a response is delivered', async () => {
    const engine = new TestEngine()
    engine.attachFakeWorker()
    const p = engine.request('writefile')
    expect(engine.deliver('writefile', { result: 'ok' })).toBe(true)
    await expect(p).resolves.toMatchObject({ result: 'ok' })
  })

  it('terminate() with nothing in flight does not throw', () => {
    const engine = new TestEngine()
    engine.attachFakeWorker()
    expect(() => engine.terminate()).not.toThrow()
  })
})

describe('TeX Live mirror year binding', () => {
  it('uses immutable R2 snapshots when no override is provided', () => {
    expect(resolveTexliveUrl(null, '2025')).toBe(
      'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/',
    )
    expect(resolveTexliveUrl(null, '2026')).toBe(
      'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/',
    )
  })

  it('accepts the selected annual mirror and rejects an obvious cross-year mix', () => {
    expect(resolveTexliveUrl('https://texlive.example/snapshots/rev/2026', '2026')).toBe(
      'https://texlive.example/snapshots/rev/2026/',
    )
    expect(() => resolveTexliveUrl('https://texlive.example/2025/', '2026')).toThrow(
      /2026 engine cannot use a 2025 mirror/,
    )
  })
})

describe('Worker send failure and response ordering', () => {
  it.each([
    false,
    true,
  ])('does not consume a retry response after send throws (transfer=%s)', async (transfer) => {
    const engine = new TestEngine()
    const failure = new Error('transport rejected message')
    let rejectSend = true
    engine.attachFakeWorker({
      onmessage: null,
      onerror: null,
      terminate() {},
      postMessage() {
        if (rejectSend) throw failure
      },
    })
    try {
      await expect(
        engine.request('writefile', transfer ? [new ArrayBuffer(1)] : undefined),
      ).rejects.toBe(failure)
      rejectSend = false
      const retry = engine.request('writefile')
      engine.deliver('writefile', { result: 'ok' })
      expect(await Promise.race([retry, Promise.resolve('missing response')])).toEqual({
        result: 'ok',
      })
    } finally {
      engine.terminate()
    }
  })

  it('keeps earlier and later same-key waiters in FIFO order when one send fails', async () => {
    const engine = new TestEngine()
    let sends = 0
    engine.attachFakeWorker({
      onmessage: null,
      onerror: null,
      terminate() {},
      postMessage() {
        if (++sends === 2) throw new Error('second send failed')
      },
    })
    const replies: Record<string, unknown> = {}
    try {
      const first = engine.request('writefile').then(
        (value) => {
          replies.first = value
        },
        () => {},
      )
      await expect(engine.request('writefile')).rejects.toThrow('second send failed')
      const third = engine.request('writefile').then(
        (value) => {
          replies.third = value
        },
        () => {},
      )
      engine.deliver('writefile', 'first')
      engine.deliver('writefile', 'third')
      await Promise.resolve()
      expect(replies).toEqual({ first: 'first', third: 'third' })
      expect(engine.deliver('writefile', 'unexpected')).toBe(false)
      await Promise.all([first, third])
    } finally {
      engine.terminate()
    }
  })
})
