import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNodeWorkerHost } from './node-host'
import { setWorkerFactory } from './worker-host'

// installNodeWorkerHost replaces globalThis.fetch with a shim that serves
// assetBaseUrl resources from publicDir and passes everything else through.
// The shim is typed `typeof fetch`, so its first parameter legally includes a
// Request — which it must resolve via `.url`, not String(request).
describe('installNodeWorkerHost fetch shim asset routing', () => {
  let tmp: string
  let realFetch: typeof globalThis.fetch
  const base = 'http://assets.local/'
  const assetPath = 'wasmtex/2025/x.wasm'
  const url = `${base}${assetPath}`
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])

  beforeEach(() => {
    realFetch = globalThis.fetch
    tmp = mkdtempSync(join(tmpdir(), 'wasmtex-node-host-'))
    mkdirSync(join(tmp, 'wasmtex', '2025'), { recursive: true })
    writeFileSync(join(tmp, assetPath), bytes)
  })

  afterEach(() => {
    globalThis.fetch = realFetch
    setWorkerFactory(() => {
      throw new Error('worker factory not installed')
    })
    rmSync(tmp, { recursive: true, force: true })
  })

  async function bodyOf(resp: Response): Promise<Uint8Array> {
    return new Uint8Array(await resp.arrayBuffer())
  }

  // Every documented fetch-input type must route to disk. The Request case is the
  // regression: a Request stringifies to '[object Request]', so a String()-based
  // shim mis-routes it to the CDN passthrough — the shim must read request.url.
  it.each([
    ['a string URL', (u: string): RequestInfo | URL => u],
    ['a URL object', (u: string): RequestInfo | URL => new URL(u)],
    ['a Request object', (u: string): RequestInfo | URL => new Request(u)],
  ])('serves %s from disk without hitting the passthrough fetch', async (_name, makeInput) => {
    const spy = vi.fn(async () => new Response('cdn', { status: 200 }))
    installNodeWorkerHost({ publicDir: tmp, assetBaseUrl: base, baseFetch: spy })

    const resp = await globalThis.fetch(makeInput(url))
    expect(await bodyOf(resp)).toEqual(bytes)
    expect(spy).not.toHaveBeenCalled()
  })

  it('passes a non-asset URL through to the base fetch (string/URL/Request)', async () => {
    const cdn = 'https://cdn.example/2025/font.tfm'
    const spy = vi.fn(async () => new Response('cdn', { status: 200 }))
    installNodeWorkerHost({ publicDir: tmp, assetBaseUrl: base, baseFetch: spy })

    await globalThis.fetch(cdn)
    await globalThis.fetch(new URL(cdn))
    await globalThis.fetch(new Request(cdn))
    expect(spy).toHaveBeenCalledTimes(3)
  })
})
