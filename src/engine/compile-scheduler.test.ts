import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompileResult } from '../types'
import { CompileScheduler } from './compile-scheduler'

function makeResult(overrides?: Partial<CompileResult>): CompileResult {
  return {
    success: true,
    pdf: new Uint8Array([1]),
    log: '',
    errors: [],
    compileTime: 100,
    synctex: null,
    ...overrides,
  }
}

function mockEngine(compileResult?: CompileResult) {
  const result = compileResult ?? makeResult()
  return {
    compile: vi.fn<() => Promise<CompileResult>>().mockResolvedValue(result),
    isReady: vi.fn<() => boolean>().mockReturnValue(true),
  }
}

/** Create a mock engine whose compile() blocks until manually resolved. */
function mockAsyncEngine() {
  let resolveCompile!: (result: CompileResult) => void
  const engine = mockEngine()
  ;(engine.compile as ReturnType<typeof vi.fn>).mockImplementation(
    () =>
      new Promise<CompileResult>((r) => {
        resolveCompile = r
      }),
  )
  return { engine, resolveCompile: (r: CompileResult) => resolveCompile(r) }
}

function setup(opts?: {
  minDebounceMs?: number
  maxDebounceMs?: number
  compileResult?: CompileResult
}) {
  const engine = mockEngine(opts?.compileResult)
  const onResult = vi.fn()
  const onStatus = vi.fn()
  const scheduler = new CompileScheduler(engine, onResult, onStatus, opts)
  return { engine, onResult, onStatus, scheduler }
}

describe('CompileScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces compile calls', () => {
    const { engine, scheduler } = setup({ minDebounceMs: 300 })

    scheduler.schedule()
    scheduler.schedule()
    scheduler.schedule()

    expect(engine.compile).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(engine.compile).toHaveBeenCalledTimes(1)
  })

  it('calls onResult after compile', async () => {
    const result = makeResult()
    const { engine, onResult, scheduler } = setup({ minDebounceMs: 50, compileResult: result })

    scheduler.schedule()
    vi.advanceTimersByTime(50)
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.compile).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledWith(result)
  })

  it('calls onStatusChange when compiling', () => {
    const { onStatus, scheduler } = setup({ minDebounceMs: 50 })

    scheduler.schedule()
    vi.advanceTimersByTime(50)

    expect(onStatus).toHaveBeenCalledWith('compiling')
  })

  it('queues a pending compile if already compiling', async () => {
    const { engine, resolveCompile } = mockAsyncEngine()
    const onResult = vi.fn()
    const onStatus = vi.fn()
    const scheduler = new CompileScheduler(engine, onResult, onStatus, { minDebounceMs: 0 })

    scheduler.schedule()
    vi.advanceTimersByTime(0)
    expect(engine.compile).toHaveBeenCalledTimes(1)

    scheduler.schedule()
    vi.advanceTimersByTime(0)

    resolveCompile(makeResult())
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.compile).toHaveBeenCalledTimes(2)
  })

  it('cancel stops pending debounce', () => {
    const { engine, scheduler } = setup({ minDebounceMs: 300 })

    scheduler.schedule()
    scheduler.cancel()
    vi.advanceTimersByTime(300)

    expect(engine.compile).not.toHaveBeenCalled()
  })

  it('does not compile when engine is not ready', () => {
    const { engine, scheduler } = setup({ minDebounceMs: 0 })
    ;(engine.isReady as ReturnType<typeof vi.fn>).mockReturnValue(false)

    scheduler.schedule()
    vi.advanceTimersByTime(0)

    expect(engine.compile).not.toHaveBeenCalled()
  })

  it('retries (without a new schedule) a compile deferred because the engine was not ready', async () => {
    // A schedule() landing while the engine is still loading / hot-swapping must not be
    // silently dropped: once the engine becomes ready, the pending compile should run.
    const { engine, scheduler } = setup({ minDebounceMs: 0 })
    const isReady = engine.isReady as ReturnType<typeof vi.fn>
    isReady.mockReturnValue(false)

    scheduler.schedule()
    vi.advanceTimersByTime(0)
    expect(engine.compile).not.toHaveBeenCalled()

    // Engine finishes loading. No further schedule() call.
    isReady.mockReturnValue(true)
    await vi.advanceTimersByTimeAsync(100)

    expect(engine.compile).toHaveBeenCalledTimes(1)
  })

  it('gives up after a bounded number of ready-retries instead of polling forever', async () => {
    // A permanently-not-ready engine (e.g. it errored out during the debounce window) must
    // not be polled every 50ms indefinitely while the compile is silently never reported.
    const { engine, onResult, scheduler } = setup({ minDebounceMs: 0 })
    const isReady = engine.isReady as ReturnType<typeof vi.fn>
    isReady.mockReturnValue(false)

    scheduler.schedule()
    await vi.advanceTimersByTimeAsync(0)
    // Poll well past the retry cap (40 * 50ms = 2s).
    await vi.advanceTimersByTimeAsync(50 * 60)

    expect(engine.compile).not.toHaveBeenCalled()
    expect(onResult).toHaveBeenCalledTimes(1)
    expect((onResult.mock.calls[0]![0] as CompileResult).success).toBe(false)

    // Polling has stopped: further timer advances no longer probe isReady().
    const callsBefore = isReady.mock.calls.length
    await vi.advanceTimersByTimeAsync(50 * 20)
    expect(isReady.mock.calls.length).toBe(callsBefore)
  })

  it('handles compile errors gracefully', async () => {
    const { engine, onResult, scheduler } = setup({ minDebounceMs: 0 })
    ;(engine.compile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('WASM crash'))

    scheduler.schedule()
    vi.advanceTimersByTime(0)
    await vi.advanceTimersByTimeAsync(0)

    expect(onResult).toHaveBeenCalledTimes(1)
    const result = onResult.mock.calls[0]![0] as CompileResult
    expect(result.success).toBe(false)
    expect(result.errors).toHaveLength(1)
  })

  // --- Generation counter tests ---

  it('discards stale compile results when generation advances', async () => {
    const { engine, resolveCompile } = mockAsyncEngine()
    const onResult = vi.fn()
    const scheduler = new CompileScheduler(engine, onResult, vi.fn(), { minDebounceMs: 0 })

    // Start first compile (generation 1)
    scheduler.schedule()
    vi.advanceTimersByTime(0)

    // User types again → generation advances to 2, sets pendingCompile
    scheduler.schedule()
    vi.advanceTimersByTime(0)

    // First compile finishes with stale generation
    resolveCompile(makeResult({ compileTime: 500 }))
    await vi.advanceTimersByTimeAsync(0)

    // Stale result should NOT be delivered
    expect(onResult).not.toHaveBeenCalled()

    // Second compile runs (from pendingCompile), resolve it
    resolveCompile(makeResult({ compileTime: 200 }))
    await vi.advanceTimersByTimeAsync(0)

    // This result IS current generation
    expect(onResult).toHaveBeenCalledTimes(1)
  })

  // --- Adaptive debounce tests ---

  it('starts with minDebounceMs when no compile history', () => {
    const { scheduler } = setup({ minDebounceMs: 200 })
    expect(scheduler.getDebounceMs()).toBe(200)
  })

  it('adapts debounce based on compile time', async () => {
    const { onResult, scheduler } = setup({
      minDebounceMs: 150,
      maxDebounceMs: 1000,
      compileResult: makeResult({ compileTime: 600 }),
    })

    // First compile: compileTime=600 → debounce should become 300 (600*0.5)
    scheduler.schedule()
    vi.advanceTimersByTime(150)
    await vi.advanceTimersByTimeAsync(0)

    expect(onResult).toHaveBeenCalledTimes(1)
    expect(scheduler.getDebounceMs()).toBe(300)
  })

  it.each([
    { compileTime: 100, expected: 150, label: 'min (100*0.5=50, clamped to 150)' },
    { compileTime: 5000, expected: 1000, label: 'max (5000*0.5=2500, clamped to 1000)' },
  ])('clamps debounce to $label', async ({ compileTime, expected }) => {
    const { scheduler } = setup({
      minDebounceMs: 150,
      maxDebounceMs: 1000,
      compileResult: makeResult({ compileTime }),
    })

    scheduler.schedule()
    vi.advanceTimersByTime(150)
    await vi.advanceTimersByTimeAsync(0)

    expect(scheduler.getDebounceMs()).toBe(expected)
  })

  it('flush immediately fires pending debounce', async () => {
    const { engine, onResult, scheduler } = setup({ minDebounceMs: 5000 })

    scheduler.schedule()
    expect(engine.compile).not.toHaveBeenCalled()

    scheduler.flush()
    await vi.advanceTimersByTimeAsync(0)

    expect(engine.compile).toHaveBeenCalledTimes(1)
    expect(onResult).toHaveBeenCalledTimes(1)
  })

  it('flush does nothing if no pending debounce', () => {
    const { engine, scheduler } = setup()

    scheduler.flush()
    expect(engine.compile).not.toHaveBeenCalled()
  })
})
