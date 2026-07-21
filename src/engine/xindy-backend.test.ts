import { describe, expect, it, vi } from 'vitest'
import { createXindyBackend, type XindyRequest } from './xindy-backend'

describe('createXindyBackend (#117)', () => {
  it('is a server backend for the index stage', () => {
    const backend = createXindyBackend({ endpoint: 'https://x.test/xindy' })
    expect(backend.id).toBe('xindy')
    expect(backend.location).toBe('server')
  })

  it('POSTs the .idx (+ options) and returns the .ind', async () => {
    const fetchImpl = vi.fn(async () => new Response('THE-IND', { status: 200 }))
    const backend = createXindyBackend({
      endpoint: 'https://x.test/xindy',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const req: XindyRequest = { idx: '\\indexentry{alpha}{1}', options: { language: 'english' } }
    expect(await backend.run(req)).toBe('THE-IND')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.test/xindy')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(req)
    expect((init.headers as Record<string, string>)['x-wasmtex-stage']).toBe('index')
  })

  it('rejects on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }))
    const backend = createXindyBackend({
      endpoint: 'https://x.test/xindy',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(backend.run({ idx: '' })).rejects.toThrow(/HTTP 500/)
  })
})
