import { describe, expect, it } from 'vitest'
import { BaseWorkerEngine, resolveTexliveUrl } from './base-worker-engine'
import type { EngineWorker } from './worker-host'

/** Minimal concrete subclass with a fake worker, to exercise the request/response
 *  plumbing without spawning a real Worker. */
class TestEngine extends BaseWorkerEngine {
  constructor() {
    super('/engine.js', null)
  }
  attachFakeWorker(): void {
    this.worker = { postMessage() {}, terminate() {} } as unknown as EngineWorker
    this.status = 'ready'
  }
  request(key: string): Promise<unknown> {
    return this.postMessageWithResponse({ cmd: key }, `cmd:${key}`)
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
  it('accepts the selected annual mirror and rejects an obvious cross-year mix', () => {
    expect(resolveTexliveUrl('https://texlive.example/snapshots/rev/2026', '2026')).toBe(
      'https://texlive.example/snapshots/rev/2026/',
    )
    expect(() => resolveTexliveUrl('https://texlive.example/2025/', '2026')).toThrow(
      /2026 engine cannot use a 2025 mirror/,
    )
  })
})
