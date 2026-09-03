// kpse-resolve.cjs is plain CommonJS shared with the WASM worker (loaded there
// as a classic worker helper); the .d.cts beside it types these named exports.

import { describe, expect, it } from 'vitest'
import {
  bloomCandidates,
  fetchCandidates,
  retryExtensions,
} from '../../wasm-build/kpse-resolve.cjs'

describe('retryExtensions', () => {
  it('lists the source-file extensions for format 26', () => {
    expect(retryExtensions(26)).toEqual(['.tex', '.sty', '.cls', '.def', '.cfg', '.ltx'])
  })

  it('lists the single extension for tfm/vf/bst formats', () => {
    expect(retryExtensions(3)).toEqual(['.tfm'])
    expect(retryExtensions(33)).toEqual(['.vf'])
    expect(retryExtensions(7)).toEqual(['.bst'])
  })

  it('lists nothing for an unknown format', () => {
    expect(retryExtensions(99)).toEqual([])
  })
})

describe('bloomCandidates', () => {
  it('adds the extension-stripped key for an extensioned request', () => {
    // pdfTeX requests a virtual font as "ptmb7t.vf"; the bucket stores "ptmb7t".
    expect(bloomCandidates(33, 'ptmb7t.vf')).toEqual(['33/ptmb7t.vf', '33/ptmb7t'])
  })

  it('adds each appended-extension key for a bare request', () => {
    // pdfTeX \input requests "xkeyval" bare; the bucket stores "xkeyval.tex".
    expect(bloomCandidates(26, 'xkeyval')).toEqual([
      '26/xkeyval',
      '26/xkeyval.tex',
      '26/xkeyval.sty',
      '26/xkeyval.cls',
      '26/xkeyval.def',
      '26/xkeyval.cfg',
      '26/xkeyval.ltx',
    ])
  })

  it('does not append an extension the request already ends with', () => {
    expect(bloomCandidates(33, 'cmr10.vf')).toEqual(['33/cmr10.vf', '33/cmr10'])
    expect(bloomCandidates(26, 'foo.tex')).not.toContain('26/foo.tex.tex')
  })

  it('includes both the stripped and appended forms for an extensioned 26 request', () => {
    // "main.nav" requested, bucket stores "main.nav.ltx".
    const keys = bloomCandidates(26, 'main.nav')
    expect(keys).toContain('26/main.nav.ltx')
    expect(keys).toContain('26/main')
  })

  it('returns just the exact key for an unknown format', () => {
    expect(bloomCandidates(99, 'whatever')).toEqual(['99/whatever'])
  })
})

describe('fetchCandidates', () => {
  it('keeps every name in kpathsea order without a bloom filter', () => {
    expect(fetchCandidates(33, 'ptmb7t.vf', null)).toEqual(['ptmb7t.vf', 'ptmb7t'])
    expect(fetchCandidates(26, 'natbib.cfg', null)).toEqual([
      'natbib.cfg',
      'natbib',
      'natbib.cfg.tex',
      'natbib.cfg.sty',
      'natbib.cfg.cls',
      'natbib.cfg.def',
      'natbib.cfg.ltx',
    ])
  })

  it('fetches the stored bare name first when the bloom rules out the requested one', () => {
    const stored = new Set(['33/ptmb7t', '3/ptmb7t', '26/xkeyval.tex'])
    const mayExist = (key: string) => stored.has(key)
    expect(fetchCandidates(33, 'ptmb7t.vf', mayExist)).toEqual(['ptmb7t'])
    expect(fetchCandidates(3, 'ptmb7t.tfm', mayExist)).toEqual(['ptmb7t'])
    expect(fetchCandidates(26, 'xkeyval', mayExist)).toEqual(['xkeyval.tex'])
  })

  it('collapses a false-positive cascade to the colliding names only', () => {
    const mayExist = (key: string) => key === '26/rerunfilecheck.cfg.def'
    expect(fetchCandidates(26, 'rerunfilecheck.cfg', mayExist)).toEqual(['rerunfilecheck.cfg.def'])
  })
})
