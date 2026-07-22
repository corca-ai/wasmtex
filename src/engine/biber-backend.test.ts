import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, BIBER_STAGE, type ToolBackend } from './backend-registry'
import { type BiberRequest, createBiberBackend, runRemoteBiber } from './biber-backend'
import { MemoryCacheStore, withCache } from './content-cache'

describe('createBiberBackend (#116)', () => {
  it('is a server backend for the bibliography stage', () => {
    const backend = createBiberBackend({ endpoint: 'https://x.test/biber' })
    expect(backend.id).toBe('biber')
    expect(backend.location).toBe('server')
  })

  it('POSTs the .bcf + .bib to the endpoint and returns the .bbl', async () => {
    const fetchImpl = vi.fn(async () => new Response('THE-BBL-CONTENT', { status: 200 }))
    const backend = createBiberBackend({
      endpoint: 'https://x.test/biber',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cacheKey: (r) => `k:${Object.keys(r.bibFiles).length}`,
    })

    const req: BiberRequest = {
      bcf: '<bcf>…</bcf>',
      bibFiles: { 'refs.bib': '@book{a, title={T}}' },
    }
    const bbl = await backend.run(req)
    expect(bbl).toBe('THE-BBL-CONTENT')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.test/biber')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(req)
    const headers = init.headers as Record<string, string>
    expect(headers['x-wasmtex-stage']).toBe(BIBER_STAGE)
    expect(headers['x-wasmtex-cache-key']).toBe('k:1')
  })

  it('rejects on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('no biber here', { status: 502 }))
    const backend = createBiberBackend({
      endpoint: 'https://x.test/biber',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(backend.run({ bcf: '', bibFiles: {} })).rejects.toThrow(/HTTP 502/)
  })
})

describe('runRemoteBiber', () => {
  const req: BiberRequest = {
    bcf: '<bcf:citekey order="1">knuth84</bcf:citekey>',
    bibFiles: { 'refs.bib': '@book{knuth84, title={Literate Programming}}' },
  }
  const clientBackend = (): ToolBackend<BiberRequest, string, typeof BIBER_STAGE> => ({
    id: 'client-biblatex-lite',
    stage: BIBER_STAGE,
    location: 'client',
    run: async () => 'CLIENT',
  })
  const serverBackend = (
    run: () => Promise<string>,
  ): ToolBackend<BiberRequest, string, typeof BIBER_STAGE> => ({
    id: 'remote-biber',
    stage: BIBER_STAGE,
    location: 'server',
    run,
  })

  it('returns null with no registry — the biblatex-lite default stays intact', async () => {
    expect(await runRemoteBiber(undefined, req)).toBeNull()
  })

  it('returns null when the resolved backend runs on the client (no offload)', async () => {
    const reg = new BackendRegistry({ [BIBER_STAGE]: clientBackend() })
    expect(await runRemoteBiber(reg, req)).toBeNull()
  })

  it('runs a registered server Biber backend on the .bcf request and returns its .bbl', async () => {
    let seen: BiberRequest | null = null
    const reg = new BackendRegistry()
    reg.register(
      BIBER_STAGE,
      serverBackend(async () => {
        seen = req
        return 'REMOTE-BBL'
      }),
    )
    expect(await runRemoteBiber(reg, req)).toBe('REMOTE-BBL')
    expect(seen).toEqual(req)
  })

  it('a content-cached Biber backend runs once for identical {bcf, bibFiles} requests', async () => {
    let calls = 0
    const reg = new BackendRegistry()
    reg.register(
      BIBER_STAGE,
      withCache(
        serverBackend(async () => {
          calls++
          return 'BBL'
        }),
        new MemoryCacheStore(),
      ),
    )
    expect(await runRemoteBiber(reg, req)).toBe('BBL')
    expect(await runRemoteBiber(reg, req)).toBe('BBL')
    expect(calls).toBe(1)
  })
})
