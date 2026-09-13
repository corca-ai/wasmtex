import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installNodeWorkerHost, type NodeWorkerHostInstallation } from './node-host'
import { createEngineWorker, type EngineWorker, setWorkerFactory } from './worker-host'

describe('Node host installation ownership', () => {
  let publicDir: string
  let originalFetch: typeof fetch
  const hosts: NodeWorkerHostInstallation[] = []
  const cleanups: Array<() => void> = []
  const assetBaseUrl = 'http://host.test/'
  function install() {
    const host = installNodeWorkerHost({ publicDir, assetBaseUrl })
    hosts.push(host)
    return host
  }
  beforeEach(() => {
    originalFetch = globalThis.fetch
    publicDir = mkdtempSync(join(tmpdir(), 'wasmtex-host-lifetime-'))
    writeFileSync(
      join(publicDir, 'probe.worker.js'),
      'self.onmessage = e => self.postMessage(e.data)',
    )
    writeFileSync(join(publicDir, 'probe.wasm'), new Uint8Array())
    writeFileSync(join(publicDir, 'asset.txt'), 'local asset')
  })
  afterEach(() => {
    for (const host of hosts.splice(0).reverse()) host.dispose()
    for (const cleanup of cleanups.splice(0).reverse()) cleanup()
    globalThis.fetch = originalFetch
    rmSync(publicDir, { recursive: true, force: true })
  })
  async function echo(): Promise<unknown> {
    const worker = createEngineWorker(`${assetBaseUrl}probe.worker.js`)
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = (event) => resolve(event.data)
        worker.onerror = reject
        worker.postMessage('live worker')
      })
    } finally {
      worker.terminate()
    }
  }

  it('rejects a second host without changing the first fetch or real worker', async () => {
    install()
    const activeFetch = globalThis.fetch
    expect(() => install()).toThrow(/already installed/i)
    expect(globalThis.fetch).toBe(activeFetch)
    expect(await (await fetch(`${assetBaseUrl}asset.txt`)).text()).toBe('local asset')
    expect(await echo()).toBe('live worker')
  })

  it('allows reinstall after disposal and an old handle cannot release the new host', async () => {
    const a = install()
    a.dispose()
    expect(globalThis.fetch).toBe(originalFetch)
    const b = install()
    const activeFetch = globalThis.fetch
    a.dispose()
    expect(globalThis.fetch).toBe(activeFetch)
    expect(await echo()).toBe('live worker')
    b.dispose()
    b.dispose()
    expect(globalThis.fetch).toBe(originalFetch)
  })

  it('preserves newer fetch and factory replacements without resurrecting the disposed host', () => {
    const baseline: EngineWorker = {
      postMessage() {},
      terminate() {},
      onmessage: null,
      onerror: null,
    }
    cleanups.push(setWorkerFactory(() => baseline))
    const host = install()
    const replacement: EngineWorker = { ...baseline }
    const restoreReplacement = setWorkerFactory(() => replacement)
    cleanups.push(restoreReplacement)
    const replacementFetch: typeof fetch = async () => new Response('replacement')
    globalThis.fetch = replacementFetch
    host.dispose()
    expect(globalThis.fetch).toBe(replacementFetch)
    expect(createEngineWorker('unused')).toBe(replacement)
    restoreReplacement()
    expect(createEngineWorker('unused')).toBe(baseline)
  })

  it('a failed installation leaves globals and the next installation available', async () => {
    expect(() => installNodeWorkerHost({ publicDir, assetBaseUrl: 'invalid' })).toThrow()
    expect(globalThis.fetch).toBe(originalFetch)
    install()
    expect(await echo()).toBe('live worker')
  })

  it('rolls back the factory if installing the fetch shim throws', async () => {
    const baseline: EngineWorker = {
      postMessage() {},
      terminate() {},
      onmessage: null,
      onerror: null,
    }
    cleanups.push(setWorkerFactory(() => baseline))
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch')!
    Object.defineProperty(globalThis, 'fetch', { ...descriptor, writable: false })
    try {
      expect(() => install()).toThrow(TypeError)
      expect(createEngineWorker('unused')).toBe(baseline)
      expect(globalThis.fetch).toBe(originalFetch)
    } finally {
      Object.defineProperty(globalThis, 'fetch', descriptor)
    }
    install()
    expect(await echo()).toBe('live worker')
  })
})
