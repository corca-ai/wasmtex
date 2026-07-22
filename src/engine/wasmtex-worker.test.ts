import { afterEach, describe, expect, it } from 'vitest'
import { CompileWorkerDriver } from './wasmtex-worker'
import { type EngineWorker, setWorkerFactory } from './worker-host'

describe('WasmTexWorker init failure recovery', () => {
  afterEach(() => {
    setWorkerFactory(() => {
      throw new Error('worker factory not installed')
    })
  })

  it('recreates the worker on a retried init instead of silently resolving a dead one', async () => {
    let created = 0
    setWorkerFactory(() => {
      created++
      const fail = created === 1 // only the first worker crashes during init
      let onmessage: ((ev: { data: unknown }) => void) | null = null
      let onerror: ((err: unknown) => void) | null = null
      return {
        postMessage() {},
        terminate() {},
        get onmessage() {
          return onmessage
        },
        set onmessage(fn: ((ev: { data: unknown }) => void) | null) {
          onmessage = fn
          if (fn && !fail) queueMicrotask(() => fn({ data: { result: 'ok' } }))
        },
        get onerror() {
          return onerror
        },
        set onerror(fn: ((err: unknown) => void) | null) {
          onerror = fn
          if (fn && fail) queueMicrotask(() => fn?.(new Error('init boom')))
        },
      } as unknown as EngineWorker
    })

    const driver = new CompileWorkerDriver('/engine.js', '/tl/', '2025')

    // First init fails: the worker errored. Status must reflect the failure.
    await expect(driver.init()).rejects.toThrow()
    expect(driver.getStatus()).toBe('error')

    // A retry must build a FRESH worker and recover — the old `if (this.worker) return`
    // guard short-circuited to a resolved state while the engine was still 'error'.
    await driver.init()
    expect(created).toBe(2)
    expect(driver.getStatus()).toBe('ready')
  })

  it('preserves a browser ErrorEvent message and source location', async () => {
    setWorkerFactory(() => {
      let onerror: ((err: unknown) => void) | null = null
      return {
        postMessage() {},
        terminate() {},
        onmessage: null,
        get onerror() {
          return onerror
        },
        set onerror(fn: ((err: unknown) => void) | null) {
          onerror = fn
          if (fn) {
            queueMicrotask(() =>
              fn({
                message: 'Uncaught RangeError: allocation failed',
                filename: 'engine.js',
                lineno: 42,
                colno: 7,
              }),
            )
          }
        },
      } as unknown as EngineWorker
    })

    const driver = new CompileWorkerDriver('/engine.js', '/tl/', '2025')
    await expect(driver.init()).rejects.toThrow(
      'Uncaught RangeError: allocation failed (engine.js:42:7)',
    )
  })

  it('preserves an Error from a foreign worker realm', async () => {
    setWorkerFactory(() => {
      let onerror: ((err: unknown) => void) | null = null
      return {
        postMessage() {},
        terminate() {},
        onmessage: null,
        get onerror() {
          return onerror
        },
        set onerror(fn: ((err: unknown) => void) | null) {
          onerror = fn
          if (fn) {
            queueMicrotask(() =>
              fn({
                error: {
                  name: 'RuntimeError',
                  message: 'memory access out of bounds',
                  stack:
                    'RuntimeError: memory access out of bounds\n    at wasm-function[123]:0xabc',
                },
              }),
            )
          }
        },
      } as unknown as EngineWorker
    })

    const driver = new CompileWorkerDriver('/engine.js', '/tl/', '2025')
    await expect(driver.init()).rejects.toMatchObject({
      name: 'RuntimeError',
      stack: expect.stringContaining('wasm-function[123]'),
    })
  })
})
