import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEngineWorker,
  type EngineWorker,
  setWorkerFactory,
  type WorkerFactory,
} from './worker-host'

function fakeWorker(): EngineWorker {
  return { postMessage() {}, onmessage: null, onerror: null, terminate() {} }
}

const registrations: Array<() => void> = []
function installFactory(factory: WorkerFactory): () => void {
  const dispose = setWorkerFactory(factory)
  registrations.push(dispose)
  return dispose
}
afterEach(() => {
  for (const dispose of registrations.splice(0).reverse()) dispose()
  vi.unstubAllGlobals()
})

describe('worker-host seam (#109)', () => {
  it('createEngineWorker delegates to the installed factory with the engine path', () => {
    const paths: string[] = []
    const worker = fakeWorker()
    installFactory((path) => {
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
    installFactory(() => a)
    expect(createEngineWorker('x')).toBe(a)
    installFactory(() => b)
    expect(createEngineWorker('x')).toBe(b)
  })

  it('restores the previous adapter without clobbering a newer replacement', () => {
    const a = fakeWorker()
    const b = fakeWorker()
    const c = fakeWorker()
    installFactory(() => a)
    const restoreA = installFactory(() => b)
    expect(createEngineWorker('x')).toBe(b)

    restoreA()
    expect(createEngineWorker('x')).toBe(a)

    const restoreB = installFactory(() => b)
    installFactory(() => c)
    restoreB()
    expect(createEngineWorker('x')).toBe(c)
  })
})

describe('worker factory registration lifetimes', () => {
  function install(worker: EngineWorker) {
    const dispose = installFactory(() => worker)
    return dispose
  }

  it.each(['oldest-first', 'newest-first'])('restores only live factories: %s', (order) => {
    const baseline = fakeWorker()
    const a = fakeWorker()
    const b = fakeWorker()
    install(baseline)
    const disposeA = install(a)
    const disposeB = install(b)
    expect(createEngineWorker('unused')).toBe(b)
    if (order === 'oldest-first') {
      disposeA()
      expect(createEngineWorker('unused')).toBe(b)
      disposeB()
    } else {
      disposeB()
      expect(createEngineWorker('unused')).toBe(a)
      disposeA()
    }
    expect(createEngineWorker('unused')).toBe(baseline)
    disposeA()
    disposeB()
    expect(createEngineWorker('unused')).toBe(baseline)
  })

  it('identifies registrations separately when they use the same function', () => {
    const baseline = fakeWorker()
    const shared = fakeWorker()
    install(baseline)
    const factory = () => shared
    const disposeA = installFactory(factory)
    const disposeB = installFactory(factory)
    disposeA()
    expect(createEngineWorker('unused')).toBe(shared)
    disposeB()
    expect(createEngineWorker('unused')).toBe(baseline)
  })
})

it('returns to the browser factory after the last host registration is disposed', () => {
  const paths: string[] = []
  class BrowserWorker {
    constructor(path: string) {
      paths.push(path)
    }
    postMessage() {}
    terminate() {}
    onmessage = null
    onerror = null
  }
  vi.stubGlobal('Worker', BrowserWorker)
  const adapterWorker = fakeWorker()
  const dispose = installFactory(() => adapterWorker)
  expect(createEngineWorker('/adapter.js')).toBe(adapterWorker)
  expect(paths).toEqual([])
  dispose()
  expect(createEngineWorker('/browser.js')).toBeInstanceOf(BrowserWorker)
  expect(paths).toEqual(['/browser.js'])
})
