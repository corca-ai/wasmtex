import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

interface ResolverHarness {
  resolve(name: string, format: number): number
  seedPositive(name: string, format: number, source: string): void
  seedNegative(name: string, format: number, source: string): void
  evidence: ReturnType<typeof vi.fn>
  xhrCount: () => number
}

function harness(responses: Array<number | 'transport'>): ResolverHarness {
  const controller = readFileSync(resolve('wasm-build/luatex-worker.js'), 'utf8')
  const start = controller.indexOf('const texlive404 = {}')
  const end = controller.indexOf('// Font-by-name goes through', start)
  if (start < 0 || end < 0) throw new Error('LuaTeX resolver source boundary changed')
  const evidence = vi.fn()
  const scope = {
    texlive_endpoint: 'https://mirror/',
    wasmtexResolverEvidence: evidence,
    postMessage: vi.fn(),
  }
  let xhrCount = 0
  class FakeXhr {
    status = 0
    response: ArrayBuffer | null = null
    open(): void {}
    set responseType(_value: string) {}
    send(): void {
      const response = responses[xhrCount++] ?? 'transport'
      if (response === 'transport') throw new Error('network reset')
      this.status = response
      if (response === 200) this.response = Uint8Array.of(1, 2, 3).buffer
    }
  }
  const api = new Function(
    'self',
    'FS',
    'XMLHttpRequest',
    'UTF8ToString',
    '_allocate',
    'intArrayFromString',
    'TEXCACHEROOT',
    `${controller.slice(start, end)}
     return {
       resolve: kpse_find_file_impl,
       seedPositive(name, format, source) {
         const key = format + '/' + name
         texlive200[key] = '/tex/' + name
         texlive200Source[key] = source
       },
       seedNegative(name, format, source) {
         const key = format + '/' + name
         texlive404[key] = 1
         texlive404Source[key] = source
       }
     }`,
  )(
    scope,
    { writeFile: vi.fn() },
    FakeXhr,
    (value: string) => value,
    () => 1,
    (value: string) => value,
    '/tex',
  ) as Omit<ResolverHarness, 'evidence' | 'xhrCount'>
  return { ...api, evidence, xhrCount: () => xhrCount }
}

describe('LuaTeX resolver controller evidence', () => {
  it('distinguishes a network fetch from its later session-cache hit', () => {
    const worker = harness([200])
    expect(worker.resolve('article.cls', 26)).toBe(1)
    expect(worker.resolve('article.cls', 26)).toBe(1)
    expect(worker.evidence.mock.calls).toMatchObject([
      ['article.cls', 26, 'resolved', [{ source: 'network', outcome: 'hit', status: 200 }]],
      ['article.cls', 26, 'resolved', [{ source: 'session-cache', outcome: 'hit' }]],
    ])
  })

  it('reports immutable-mirror absence and reuses its negative state', () => {
    const worker = harness([404])
    expect(worker.resolve('missing.sty', 26)).toBe(0)
    expect(worker.resolve('missing.sty', 26)).toBe(0)
    expect(worker.xhrCount()).toBe(1)
    expect(worker.evidence.mock.calls.map((call) => call[2])).toEqual([
      'mirror-absent',
      'mirror-absent',
    ])
  })

  it('does not poison the negative cache after a transient transport failure', () => {
    const worker = harness(['transport', 200])
    expect(worker.resolve('retry.sty', 26)).toBe(0)
    expect(worker.resolve('retry.sty', 26)).toBe(1)
    expect(worker.xhrCount()).toBe(2)
    expect(worker.evidence.mock.calls.map((call) => call[2])).toEqual([
      'transport-error',
      'resolved',
    ])
  })

  it('preserves warmup, persistent, and durable-negative cache origins', () => {
    const worker = harness([])
    worker.seedPositive('warm.sty', 26, 'warmup-cache')
    worker.seedPositive('persist.sty', 26, 'persistent-cache')
    worker.seedNegative('absent.sty', 26, 'durable-negative')
    worker.resolve('warm.sty', 26)
    worker.resolve('persist.sty', 26)
    worker.resolve('absent.sty', 26)
    expect(worker.evidence.mock.calls.map((call) => call[3][0].source)).toEqual([
      'warmup-cache',
      'persistent-cache',
      'durable-negative',
    ])
  })
})
