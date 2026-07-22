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

  it('restores the previous adapter without clobbering a newer replacement', () => {
    const a = fakeWorker()
    const b = fakeWorker()
    const c = fakeWorker()
    setWorkerFactory(() => a)
    const restoreA = setWorkerFactory(() => b)
    expect(createEngineWorker('x')).toBe(b)

    restoreA()
    expect(createEngineWorker('x')).toBe(a)

    const restoreB = setWorkerFactory(() => b)
    setWorkerFactory(() => c)
    restoreB()
    expect(createEngineWorker('x')).toBe(c)
  })
})
