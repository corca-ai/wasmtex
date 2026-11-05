import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installNodeWorkerHost, type NodeWorkerHostInstallation } from './node-host'
import { createEngineWorker } from './worker-host'

// installNodeWorkerHost replaces globalThis.fetch with a shim that serves
// assetBaseUrl resources from publicDir and passes everything else through.
// The shim is typed `typeof fetch`, so its first parameter legally includes a
// Request — which it must resolve via `.url`, not String(request).
describe('installNodeWorkerHost fetch shim asset routing', () => {
  let host: NodeWorkerHostInstallation | undefined
  let tmp: string
  let publicDir: string
  let realFetch: typeof globalThis.fetch
  const base = 'http://assets.local/'
  const assetPath = 'wasmtex/2025/x.wasm'
  const url = `${base}${assetPath}`
  const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])

  beforeEach(() => {
    realFetch = globalThis.fetch
    tmp = mkdtempSync(join(tmpdir(), 'wasmtex-node-host-'))
    publicDir = join(tmp, 'public')
    mkdirSync(join(publicDir, 'wasmtex', '2025'), { recursive: true })
    writeFileSync(join(publicDir, assetPath), bytes)
  })

  afterEach(() => {
    host?.dispose()
    host = undefined
    globalThis.fetch = realFetch
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
    host = installNodeWorkerHost({ publicDir, assetBaseUrl: base, baseFetch: spy })

    const resp = await globalThis.fetch(makeInput(url))
    expect(await bodyOf(resp)).toEqual(bytes)
    expect(spy).not.toHaveBeenCalled()
  })

  it('passes a non-asset URL through to the base fetch (string/URL/Request)', async () => {
    const cdn = 'https://cdn.example/2025/font.tfm'
    const spy = vi.fn(async () => new Response('cdn', { status: 200 }))
    host = installNodeWorkerHost({ publicDir, assetBaseUrl: base, baseFetch: spy })

    await globalThis.fetch(cdn)
    await globalThis.fetch(new URL(cdn))
    await globalThis.fetch(new Request(cdn))
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('never serves a dot-segment request from outside publicDir', async () => {
    writeFileSync(join(tmp, 'package.json'), 'outside-public-dir')
    const spy = vi.fn(async () => new Response('cdn', { status: 200 }))
    host = installNodeWorkerHost({ publicDir, assetBaseUrl: base, baseFetch: spy })

    const resp = await globalThis.fetch(`${base}../package.json`)
    expect(resp.status).toBe(404)
    expect(await resp.text()).toBe('')
    expect(spy).not.toHaveBeenCalled()
  })

  it('runs budget listeners before the controller and performs exactly one HTTP attempt per retry', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests++
      response.writeHead(requests === 1 ? 503 : 200, { 'content-type': 'application/octet-stream' })
      response.end('asset')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing listener address')
    writeFileSync(
      join(publicDir, 'wasmtex/2025/x.worker.js'),
      readFileSync(new URL('../../wasm-build/asset-download.js', import.meta.url), 'utf8') +
        `
        self.onmessage = function (event) {
          const xhr = self.wasmtexDownloadAsset(event.data.url, 'data')
          self.postMessage({ result: 'ok', status: xhr.status })
        }
      `,
    )
    host = installNodeWorkerHost({ publicDir, assetBaseUrl: base })
    const worker = createEngineWorker(`${base}wasmtex/2025/x.worker.js`)
    try {
      const result = new Promise<unknown>((resolve, reject) => {
        worker.onerror = reject
        worker.onmessage = ({ data }) => {
          if (typeof data === 'object' && data !== null && 'result' in data) resolve(data)
        }
      })
      worker.postMessage({ assetRetryBudget: 8, url: `http://127.0.0.1:${address.port}/file` })
      await expect(result).resolves.toEqual({ result: 'ok', status: 200, assetRetriesRemaining: 7 })
      expect(requests).toBe(2)
    } finally {
      worker.terminate()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('restores the previous global fetch when disposed', () => {
    host = installNodeWorkerHost({ publicDir, assetBaseUrl: base })
    expect(globalThis.fetch).not.toBe(realFetch)

    host.dispose()
    host.dispose()
    expect(globalThis.fetch).toBe(realFetch)
  })
})
