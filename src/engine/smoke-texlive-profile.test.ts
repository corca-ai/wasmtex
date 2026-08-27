import { describe, expect, it } from 'vitest'
import { smokeTexliveProfile } from './smoke-texlive-profile'

describe('smokeTeXLiveProfile', () => {
  it('uses the established 2025 profile when no override is provided', () => {
    expect(smokeTexliveProfile({})).toEqual({
      version: '2025',
      url: 'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/',
    })
  })

  it('accepts an atomic matching annual profile', () => {
    expect(
      smokeTexliveProfile({
        WASMTEX_SMOKE_TEXLIVE_VERSION: '2026',
        WASMTEX_SMOKE_TEXLIVE_URL: 'https://texlive.corca.ai/snapshots/2026-b4f6befbe7732169/2026/',
      }),
    ).toEqual({
      version: '2026',
      url: 'https://texlive.corca.ai/snapshots/2026-b4f6befbe7732169/2026/',
    })
  })

  it('rejects partial and mismatched overrides', () => {
    expect(() => smokeTexliveProfile({ WASMTEX_SMOKE_TEXLIVE_VERSION: '2026' })).toThrow(
      'must be set together',
    )
    expect(() =>
      smokeTexliveProfile({
        WASMTEX_SMOKE_TEXLIVE_VERSION: '2026',
        WASMTEX_SMOKE_TEXLIVE_URL: 'https://example.com/2025/',
      }),
    ).toThrow('for TeX Live 2026')
  })
})
