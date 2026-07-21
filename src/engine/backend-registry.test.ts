import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, createRemoteBackend, type ToolBackend } from './backend-registry'

function clientBackend(id: string): ToolBackend<string, string> {
  return { id, location: 'client', run: async (req) => `${id}:${req}` }
}

describe('BackendRegistry (#110)', () => {
  it('resolves the default (client) backend when no override is registered', () => {
    const reg = new BackendRegistry({ bibliography: clientBackend('biblatex-lite') })
    expect(reg.resolve('bibliography')?.id).toBe('biblatex-lite')
    expect(reg.isRemote('bibliography')).toBe(false)
  })

  it('returns null for an unknown stage with no default', () => {
    const reg = new BackendRegistry({})
    expect(reg.resolve('index')).toBeNull()
  })

  it('an override replaces the default for that stage only', () => {
    const reg = new BackendRegistry({
      bibliography: clientBackend('biblatex-lite'),
      index: clientBackend('makeindex'),
    })
    const remote: ToolBackend<string, string> = {
      id: 'biber-remote',
      location: 'server',
      run: async () => 'bbl',
    }
    reg.register('bibliography', remote)
    expect(reg.resolve('bibliography')?.id).toBe('biber-remote')
    expect(reg.isRemote('bibliography')).toBe(true)
    // other stages keep their client default
    expect(reg.resolve('index')?.id).toBe('makeindex')
    expect(reg.isRemote('index')).toBe(false)
  })
})

describe('createRemoteBackend (#110)', () => {
  it('POSTs the encoded request with stage + cache-key headers and decodes the response', async () => {
    const fetchImpl = vi.fn(async () => new Response('THE-BBL', { status: 200 }))
    const backend = createRemoteBackend<{ key: string; bib: string }, string>({
      id: 'biber-remote',
      stage: 'bibliography',
      endpoint: 'https://example.test/compile',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      encodeRequest: (r) => r.bib,
      decodeResponse: (res) => res.text(),
      cacheKey: (r) => r.key,
    })

    expect(backend.location).toBe('server')
    const out = await backend.run({ key: 'hash123', bib: '@article{a}' })
    expect(out).toBe('THE-BBL')

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://example.test/compile')
    expect(init.method).toBe('POST')
    expect(init.body).toBe('@article{a}')
    const headers = init.headers as Record<string, string>
    expect(headers['x-wasmtex-stage']).toBe('bibliography')
    expect(headers['x-wasmtex-cache-key']).toBe('hash123')
  })

  it('throws on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 500 }))
    const backend = createRemoteBackend<string, string>({
      id: 'r',
      stage: 'bibliography',
      endpoint: 'https://example.test/compile',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      encodeRequest: (r) => r,
      decodeResponse: (res) => res.text(),
    })
    await expect(backend.run('x')).rejects.toThrow(/HTTP 500/)
  })
})
