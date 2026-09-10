import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

function harness() {
  const source = readFileSync('wasm-build/dvipdfm-worker.js', 'utf8')
  const begin = source.indexOf('function observeConversionInputs(')
  const end = source.indexOf('function compilePDFRoutine()', begin)
  if (begin < 0 || end < 0) throw new Error('Missing conversion observation boundary')
  const evidence = vi.fn()
  const failure = new Error('missing')
  const fs = {
    open(path: string, flags = 0) {
      if (path === '/missing') throw failure
      return { path, flags, node: { mode: 1 } }
    },
    isFile: (mode: number) => mode === 1,
  }
  const original = fs.open
  const observe = new Function(
    'FS',
    'self',
    'WORKROOT',
    'TEXCACHEROOT',
    'runEngine',
    'texliveFileKeys',
    'texlive200Source',
    `${source.slice(begin, end)};return observeConversionInputs`,
  )(
    fs,
    { wasmtexResolverEvidence: evidence },
    '/work',
    '/tex',
    (fn: () => number) => fn(),
    { '/tex/shared.otf': '47/shared.otf', '/tex/unused.otf': '47/unused.otf' },
    { '47/shared.otf': 'warmup-cache' },
  ) as (fn: () => number) => { status: number; inputFiles: string[]; inputFilesComplete: boolean }
  return { fs, original, observe, evidence, failure }
}

it('observes actual read opens and native cache hits without including unused cache entries', () => {
  const h = harness()
  const result = h.observe(() => {
    h.fs.open('/work/figure.pdf')
    h.fs.open('/tex/shared.otf')
    h.fs.open('/tex/shared.otf')
    h.fs.open('/work/main.pdf', 1)
    h.fs.open('/tmp/internal')
    expect(() => h.fs.open('/missing')).toThrow(h.failure)
    return 0
  })
  expect(result).toEqual({
    status: 0,
    inputFiles: ['/tex/shared.otf', '/work/figure.pdf'],
    inputFilesComplete: false,
  })
  expect(h.evidence.mock.calls).toEqual([
    [
      'shared.otf',
      47,
      'resolved',
      [{ source: 'warmup-cache', outcome: 'hit', candidate: 'shared.otf' }],
    ],
  ])
  expect(h.fs.open).toBe(h.original)
  expect(h.observe(() => 0).inputFiles).toEqual([])
})

it('restores the original open on a trap and preserves its error', () => {
  const h = harness()
  expect(() =>
    h.observe(() => {
      throw h.failure
    }),
  ).toThrow(h.failure)
  expect(h.fs.open).toBe(h.original)
})

it('bounds paths and retains incomplete evidence on overflow', () => {
  const h = harness()
  const result = h.observe(() => {
    h.fs.open(`/work/${'x'.repeat(4096)}`)
    for (let i = 0; i < 4200; i++) h.fs.open(`/work/${i}`)
    return 0
  })
  expect(result.inputFiles).toHaveLength(4096)
  expect(result.inputFilesComplete).toBe(false)
})
