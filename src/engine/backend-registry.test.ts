import { describe, expect, it, vi } from 'vitest'
import {
  BackendRegistry,
  type BackendStageContract,
  createRemoteBackend,
  type ToolBackend,
} from './backend-registry'

interface TestStages {
  bibliography: BackendStageContract<string, string>
  index: BackendStageContract<string, string>
}

function clientBackend<Stage extends keyof TestStages>(
  stage: Stage,
  id: string,
): ToolBackend<string, string, Stage> {
  return { id, stage, location: 'client', run: async (req) => `${id}:${req}` }
}

describe('BackendRegistry (#110)', () => {
  it('resolves the default (client) backend when no override is registered', () => {
    const reg = new BackendRegistry<TestStages>({
      bibliography: clientBackend('bibliography', 'biblatex-lite'),
    })
    expect(reg.resolve('bibliography')?.id).toBe('biblatex-lite')
    expect(reg.isRemote('bibliography')).toBe(false)
  })

  it('returns null for an unknown stage with no default', () => {
    const reg = new BackendRegistry<TestStages>()
    expect(reg.resolve('index')).toBeNull()
  })

  it('an override replaces the default for that stage only', () => {
    const reg = new BackendRegistry<TestStages>({
      bibliography: clientBackend('bibliography', 'biblatex-lite'),
      index: clientBackend('index', 'makeindex'),
    })
    const remote: ToolBackend<string, string, 'bibliography'> = {
      id: 'biber-remote',
      stage: 'bibliography',
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

  it('rejects a backend whose runtime stage metadata does not match its slot', () => {
    const reg = new BackendRegistry<TestStages>()
    const backend = clientBackend('bibliography', 'wrong-stage')
    Object.defineProperty(backend, 'stage', { value: 'index' })

    expect(() => reg.register('bibliography', backend)).toThrow(
      /declares stage "index" but was registered for "bibliography"/,
    )
  })

  it('rejects mismatched default metadata when an untyped caller resolves it', () => {
    const backend = clientBackend('bibliography', 'wrong-default')
    const reg = new BackendRegistry<TestStages>({ bibliography: backend })
    Object.defineProperty(backend, 'stage', { value: 'index' })

    expect(() => reg.resolve('bibliography')).toThrow(
      /declares stage "index" but was resolved for "bibliography"/,
    )
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
    expect(backend.stage).toBe('bibliography')
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
