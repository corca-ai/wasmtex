import { describe, expect, it } from 'vitest'
import { wasmSimdSupported } from './wasm-features'

describe('wasmSimdSupported', () => {
  it('returns a boolean and never throws', () => {
    expect(typeof wasmSimdSupported()).toBe('boolean')
  })

  it('detects SIMD support on a modern runtime (Node 24)', () => {
    expect(wasmSimdSupported()).toBe(true)
  })
})
