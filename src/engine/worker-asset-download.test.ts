import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('../../wasm-build/asset-download.js', import.meta.url), 'utf8')
function harness(statuses: Array<number | Error>, type = 'application/octet-stream') {
  const events: Record<string, unknown>[] = []
  const requests: string[] = []
  let receive!: (event: { data: unknown }) => void
  const self = {
    addEventListener(_name: string, listener: typeof receive) {
      receive = listener
    },
    postMessage(event: Record<string, unknown>) {
      events.push(event)
    },
    wasmtexDownloadAsset: undefined as unknown as (
      url: string,
      asset: string,
    ) => { status: number },
  }
  class Xhr {
    status = 0
    response: ArrayBuffer | null = null
    open(_method: string, url: string) {
      requests.push(url)
    }
    send() {
      const next = statuses.shift() ?? 503
      if (next instanceof Error) throw next
      this.status = next
      this.response = new Uint8Array([1, 2]).buffer
    }
    getResponseHeader() {
      return type
    }
  }
  vm.runInNewContext(source, { self, XMLHttpRequest: Xhr })
  return {
    self,
    requests,
    events,
    budget: (assetRetryBudget: number) => receive({ data: { assetRetryBudget } }),
  }
}

describe('synchronous Worker asset recovery', () => {
  it('retries one URL and returns unused host allowance at the terminal reply', () => {
    const h = harness([503, 200])
    h.budget(8)
    expect(h.self.wasmtexDownloadAsset('https://assets.test/file', 'package').status).toBe(200)
    h.self.postMessage({ result: 'ok' })
    expect(h.requests).toEqual(['https://assets.test/file', 'https://assets.test/file'])
    expect(h.events.at(-1)).toEqual({ result: 'ok', assetRetriesRemaining: 7 })
    expect(h.events.filter((event) => event.phase === 'retry')).toHaveLength(1)
    expect(
      h.events.filter((event) => event.cmd === 'assetdownload').every((event) => !('url' in event)),
    ).toBe(true)
    expect(() => h.self.wasmtexDownloadAsset('https://assets.test/next', 'data')).toThrow()
    expect(h.requests).toHaveLength(3)
  })

  it('shares the host allowance across files and caps each file independently', () => {
    const h = harness([503, 503, 503, 503, 503, 503, 503])
    h.budget(4)
    expect(() => h.self.wasmtexDownloadAsset('a', 'font')).toThrow()
    expect(h.requests).toHaveLength(4)
    expect(() => h.self.wasmtexDownloadAsset('b', 'font')).toThrow()
    expect(h.requests).toHaveLength(6)
    h.self.postMessage({ result: 'error' })
    expect(h.events.at(-1)?.assetRetriesRemaining).toBe(0)
  })

  it('returns only genuine absence and refuses permission errors and HTML success', () => {
    const missing = harness([404])
    missing.budget(8)
    expect(missing.self.wasmtexDownloadAsset('a', 'data').status).toBe(404)
    for (const [status, type] of [
      [403, 'text/plain'],
      [200, 'text/html'],
    ] as const) {
      const h = harness([status], type)
      h.budget(8)
      expect(() => h.self.wasmtexDownloadAsset('a', 'data')).toThrow(/TeX asset download failed/)
      expect(h.requests).toHaveLength(1)
    }
  })

  it('has no unreserved retries and reports timeouts without claiming byte progress', () => {
    const error = new Error('timeout')
    error.name = 'TimeoutError'
    const h = harness([error])
    h.budget(0)
    expect(() => h.self.wasmtexDownloadAsset('a', 'data')).toThrow()
    expect(h.requests).toHaveLength(1)
    expect(h.events.at(-1)).toMatchObject({
      phase: 'end',
      failure: 'stalled',
      receivedBytes: 0,
      lastByteAgeMs: null,
    })
  })
})
