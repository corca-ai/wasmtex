import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WasmTexLuatexEngine } from './luatex-engine'
import { WasmTexXetexEngine } from './xetex-engine'

// The Unicode engine constructors are side-effect-free (no Worker is spawned
// until init(), like WasmTexPdftexEngine), so we can assert the persistentCache
// option → durable-cache wiring directly. isIndexedDbSupported() checks for a
// global `indexedDB`, absent in Node — stub it so the durable cache is allowed
// to construct (PersistentCache defers all IndexedDB access until load/save).
describe('WasmTexXetexEngine persistent cache wiring', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('enables the durable cache when persistentCache is set (parity with LuaTeX)', () => {
    const xe = new WasmTexXetexEngine({ assetBaseUrl: '/', persistentCache: true })
    const lua = new WasmTexLuatexEngine({ assetBaseUrl: '/', persistentCache: true })
    expect(lua.isPersistentCacheEnabled()).toBe(true) // baseline
    expect(xe.isPersistentCacheEnabled()).toBe(true) // the fix
  })

  it('leaves the durable cache disabled when persistentCache is not set', () => {
    const xe = new WasmTexXetexEngine({ assetBaseUrl: '/' })
    const xeFalse = new WasmTexXetexEngine({ assetBaseUrl: '/', persistentCache: false })
    expect(xe.isPersistentCacheEnabled()).toBe(false)
    expect(xeFalse.isPersistentCacheEnabled()).toBe(false)
  })
})
