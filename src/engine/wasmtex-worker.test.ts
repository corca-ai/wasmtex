import { afterEach, describe, expect, it } from 'vitest'
import { CompileWorkerDriver, type WasmTexWorkerMsg } from './wasmtex-worker'
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

describe('CompileWorkerDriver resolver evidence', () => {
  afterEach(() => {
    setWorkerFactory(() => {
      throw new Error('worker factory not installed')
    })
  })

  it('refuses a retained output from a fatal status-1 pass but preserves warning output', async () => {
    let log = '!  ==> Fatal error occurred, no output PDF file produced!'
    const pdf = Uint8Array.of(1, 2).buffer
    class Driver extends CompileWorkerDriver {
      prepare() {
        this.status = 'ready'
        this.worker = {
          postMessage: () =>
            this.deliverResponse('cmd:compile', {
              cmd: 'compile',
              result: 'ok',
              status: 1,
              log,
              pdf,
            }),
        } as unknown as EngineWorker
      }
    }
    const driver = new Driver('/engine.js', '/tl/', '2026')
    driver.prepare()
    expect(await driver.run('compilelatex')).toMatchObject({ success: false, out: null, log })
    log = 'LaTeX Warning: Reference undefined.\nOutput written on main.pdf (1 page).'
    expect(await driver.run('compilelatex')).toMatchObject({
      success: true,
      out: new Uint8Array(pdf),
      log,
    })
  })

  it('collects worker resolver messages into the command result', async () => {
    let onmessage: ((ev: { data: unknown }) => void) | null = null
    setWorkerFactory(
      () =>
        ({
          postMessage(message: { cmd?: string }) {
            if (message.cmd === 'settexliveurl') return
            if (message.cmd === 'compilelatex') {
              queueMicrotask(() => {
                onmessage?.({
                  data: {
                    cmd: 'resolver',
                    evidence: {
                      requestedName: 'article.cls',
                      format: 26,
                      outcome: 'resolved',
                      attempts: [{ source: 'network', outcome: 'hit', status: 200 }],
                    },
                  },
                })
                onmessage?.({ data: { cmd: 'compile', result: 'ok', status: 0, log: '' } })
              })
            }
          },
          terminate() {},
          get onmessage() {
            return onmessage
          },
          set onmessage(fn: ((ev: { data: unknown }) => void) | null) {
            onmessage = fn
            if (fn) {
              queueMicrotask(() => {
                fn({ data: { cmd: 'resolverready', schemaVersion: 1 } })
                fn({ data: { result: 'ok', heapCheckpoints: true } })
              })
            }
          },
          onerror: null,
        }) as unknown as EngineWorker,
    )
    const profile = {
      id: '2026-latest@rev',
      texliveYear: '2026' as const,
      mirrorRevision: 'rev',
    }
    const driver = new CompileWorkerDriver('/engine.js', '/tl/', '2026', 'luatex', profile)
    await driver.init()
    expect(driver.supportsHeapCheckpoints).toBe(true)

    const result = await driver.run('compilelatex')
    expect(result.resolver).toMatchObject({
      profile,
      entries: [{ stage: 'luatex', requestedName: 'article.cls', outcome: 'resolved' }],
    })
  })
})

describe('CompileWorkerDriver heap checkpoints', () => {
  class Driver extends CompileWorkerDriver {
    readonly posted: Array<Record<string, unknown>> = []
    prepare(ready: WasmTexWorkerMsg) {
      this.capabilities = ready
      this.status = 'ready'
      this.worker = {
        postMessage: (message: Record<string, unknown>) => {
          this.posted.push(message)
          if (message.cmd === 'compilelatex')
            this.deliverResponse('cmd:compile', {
              cmd: 'compile',
              result: 'ok',
              status: 0,
              log: '',
              pdf: Uint8Array.of(1).buffer,
              heapCheckpoints: [{ id: 'a', line: 3, bytes: 4096, ms: 1 }],
            })
          if (message.cmd === 'dropheapcheckpoints')
            this.deliverResponse('cmd:dropheapcheckpoints', { cmd: 'dropheapcheckpoints' })
        },
      } as unknown as EngineWorker
    }
  }

  it('reports the loaded build and forwards checkpoint fields', async () => {
    const driver = new Driver('/engine.js', '/tl/', '2026', 'luatex')
    driver.prepare({
      result: 'ok',
      heapCheckpoints: true,
      lineCheckpoints: true,
      pagePreview: true,
    })
    expect(driver.supportsHeapCheckpoints).toBe(true)
    expect(driver.supportsLineCheckpoints).toBe(true)
    expect(driver.supportsFileCheckpoints).toBe(false)
    expect(driver.supportsPagePreview).toBe(true)
    const arms = [{ id: 'a', line: 3 }]
    const run = await driver.run('compilelatex', { checkpoints: arms })
    expect(driver.posted.at(-1)).toEqual({ cmd: 'compilelatex', checkpoints: arms })
    expect(run.message?.heapCheckpoints).toEqual([{ id: 'a', line: 3, bytes: 4096, ms: 1 }])
    await driver.dropHeapCheckpoints(['a'])
    expect(driver.posted.at(-1)).toEqual({ cmd: 'dropheapcheckpoints', ids: ['a'] })
  })

  it('sends no checkpoint commands to a plain build', async () => {
    const driver = new Driver('/engine.js', '/tl/', '2026', 'luatex')
    driver.prepare({ result: 'ok' })
    expect(driver.supportsHeapCheckpoints).toBe(false)
    expect(driver.supportsResumeRecorder).toBe(false)
    await driver.dropHeapCheckpoints()
    expect(driver.posted).toEqual([])
  })
})
