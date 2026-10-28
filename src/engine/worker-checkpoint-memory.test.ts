import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { expect, it } from 'vitest'

function worker() {
  const scope = createContext({ performance, importScripts() {}, Uint8Array, Int32Array })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/pdftex-worker.js', import.meta.url), 'utf8'),
    scope,
  )
  scope.wasmMemory = { buffer: new ArrayBuffer(65536) }
  return scope
}

it('shares only identical immutable blocks at the same address and restores changed blocks', () => {
  const scope = worker()
  const live = new Uint8Array(scope.wasmMemory.buffer)
  live[3] = 17
  live[8192] = 29
  const first = runInContext('hcSparseImage()', scope)
  scope._hc.checkpoints.first = { image: first, fs: { files: {} } }
  scope._hc.lastCheckpointId = 'first'
  live[8192] = 31
  const second = runInContext('hcSparseImage()', scope)
  expect(second.pages).toHaveLength(2)
  expect(second.pages[0].data).toBe(first.pages[0].data)
  expect(second.pages[1].data).not.toBe(first.pages[1].data)
  expect(first.pages[1].data[0]).toBe(29)
  // Reversion reuses a surviving older block, not only the most recent image.
  scope._hc.checkpoints.second = { image: second, fs: { files: {} } }
  scope._hc.lastCheckpointId = 'second'
  live[8192] = 29
  const third = runInContext('hcSparseImage()', scope)
  expect(third.pages[1].data).toBe(first.pages[1].data)
  expect(third.bytes).toBe(8192)
  expect(third.length).toBe(65536)
})

it('counts shared image and file allocations once and evicts least recently used proof', () => {
  const scope = worker()
  const shared = new Uint8Array(4096),
    file = new Uint8Array(100)
  const snapshot = (used: number, extra: Uint8Array) => ({
    used,
    image: {
      pages: [
        { at: 0, data: shared },
        { at: 4096, data: extra },
      ],
    },
    fs: { files: { '/work/main.tex': file } },
  })
  scope._hc.checkpoints = {
    old: snapshot(1, new Uint8Array(4096)),
    current: snapshot(3, new Uint8Array(4096)),
  }
  expect(runInContext('hcRetention().bytes', scope)).toBe(4096 * 3 + 100)
  scope._hc.budget = { maxCount: 32, maxBytes: 4096 * 2 + 100 }
  runInContext('hcEnforceBudget()', scope)
  expect(runInContext('hcRetention().ids', scope)).toEqual(['current'])
  expect(runInContext('hcRetention().bytes', scope)).toBe(4096 * 2 + 100)
  scope._hc.budget = { maxCount: 0, maxBytes: 0 }
  runInContext('hcEnforceBudget()', scope)
  expect(runInContext('hcRetention()', scope)).toEqual({ ids: [], bytes: 0 })
})
