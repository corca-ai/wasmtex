import { describe, expect, it } from 'vitest'
import { createEngineWorker, type EngineWorker, setWorkerFactory } from './worker-host'

function fakeWorker(): EngineWorker {
  return { postMessage() {}, onmessage: null, onerror: null, terminate() {} }
}

// vitest isolates modules per test file, so mutating the module-level factory here does
// not leak into the engine tests.
describe('worker-host seam (#109)', () => {
  it('createEngineWorker delegates to the installed factory with the engine path', () => {
    const paths: string[] = []
    const worker = fakeWorker()
    setWorkerFactory((path) => {
      paths.push(path)
      return worker
    })
    const created = createEngineWorker('/engines/pdftex.js')
    expect(paths).toEqual(['/engines/pdftex.js'])
    expect(created).toBe(worker)
  })

  it('setWorkerFactory swaps the host adapter', () => {
    const a = fakeWorker()
    const b = fakeWorker()
    setWorkerFactory(() => a)
    expect(createEngineWorker('x')).toBe(a)
    setWorkerFactory(() => b)
    expect(createEngineWorker('x')).toBe(b)
  })
})
