import { describe, expect, it } from 'vitest'
import { engineFormatUrl, engineWorkerUrl } from './engine-assets'

describe('engine asset URLs', () => {
  it('keeps the TeX Live version and engine in one predictable namespace', () => {
    expect(engineWorkerUrl('/assets/', '2025', 'pdftex')).toBe(
      '/assets/wasmtex/2025/wasmtex-pdftex.worker.js',
    )
    expect(engineWorkerUrl('/assets/', '2025', 'dvipdfm')).toBe(
      '/assets/wasmtex/2025/wasmtex-dvipdfm.worker.js',
    )
    expect(engineFormatUrl('/assets/', '2025', 'luatex')).toBe(
      '/assets/wasmtex/2025/wasmtex-luatex.fmt',
    )
  })
})
