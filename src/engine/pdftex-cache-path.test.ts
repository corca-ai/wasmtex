import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const controller = readFileSync(
  new URL('../../wasm-build/pdftex-worker.js', import.meta.url),
  'utf8',
)

function cacheFileName(): (format: number, name: string) => string {
  const start = controller.indexOf('function cacheFileName(format, name)')
  const end = controller.indexOf('\nfunction kpse_find_file_impl', start)
  if (start < 0 || end < 0) throw new Error('cacheFileName helper not found')
  return new Function(`${controller.slice(start, end)}\nreturn cacheFileName`)() as (
    format: number,
    name: string,
  ) => string
}

describe('pdfTeX worker TeX Live cache paths', () => {
  const name = cacheFileName()

  it('keeps a TFM and a same-named VF on distinct paths in the flat cache dir', () => {
    // Times (psnfss) fonts: kpathsea asks for the TFM and the VF under the same
    // bare name `ptmr7t`. Both must survive a warmup/persistent-cache preload.
    expect(name(3, 'ptmr7t')).toBe('ptmr7t.tfm')
    expect(name(33, 'ptmr7t')).toBe('ptmr7t')
    expect(name(3, 'ptmr7t')).not.toBe(name(33, 'ptmr7t'))
  })

  it('normalizes only the formats the fetch path always normalized', () => {
    expect(name(3, 'cmr10.tfm')).toBe('cmr10.tfm')
    expect(name(6, 'refs')).toBe('refs.bib')
    expect(name(7, 'plain')).toBe('plain.bst')
    expect(name(10, 'pdflatex')).toBe('pdflatex.fmt')
    expect(name(26, 'article.cls')).toBe('article.cls')
    expect(name(32, 'utmr8a.pfb')).toBe('utmr8a.pfb')
  })

  it('applies the same naming to on-demand fetches and host preloads', () => {
    const fetchPath = controller.indexOf('TEXCACHEROOT + "/" + cacheFileName(format, fileid)')
    const preloadPath = controller.indexOf('TEXCACHEROOT + "/" + cacheFileName(format, filename)')
    expect(fetchPath).toBeGreaterThan(0)
    expect(preloadPath).toBeGreaterThan(0)
  })
})
