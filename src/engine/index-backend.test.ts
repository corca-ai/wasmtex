import { describe, expect, it, vi } from 'vitest'
import { BackendRegistry, type ToolBackend } from './backend-registry'
import {
  createMakeindexBackend,
  detectIndexUse,
  INDEX_STAGE,
  type IndexStageRequest,
  runRemoteIndex,
} from './index-backend'

describe('detectIndexUse', () => {
  it('detects \\makeindex + \\printindex', () => {
    expect(detectIndexUse('\\usepackage{makeidx}\\makeindex\ntext\n\\printindex')).toBe(true)
  })

  it('is false without \\printindex (nothing to resolve)', () => {
    expect(detectIndexUse('\\makeindex\n\\index{x}')).toBe(false)
  })

  it('is false without \\makeindex (no .idx emitted)', () => {
    expect(detectIndexUse('\\printindex')).toBe(false)
  })

  it('is false for a plain document', () => {
    expect(detectIndexUse('\\documentclass{article}\\begin{document}hi\\end{document}')).toBe(false)
  })

  it('ignores commented-out directives', () => {
    expect(detectIndexUse('% \\makeindex\n% \\printindex')).toBe(false)
  })

  it('ignores directives in a comment after an escaped backslash (\\\\%)', () => {
    expect(detectIndexUse(`a \\\\% \\makeindex\nb \\\\% \\printindex`)).toBe(false)
  })

  it('keeps detection when the percent is an escaped literal (\\%)', () => {
    expect(detectIndexUse(String.raw`\makeindex 50\% \printindex`)).toBe(true)
  })
})

describe('runRemoteIndex', () => {
  const req: IndexStageRequest = { idx: '\\indexentry{alpha}{1}' }
  const clientBackend = (): ToolBackend<IndexStageRequest, string, typeof INDEX_STAGE> => ({
    id: 'client-makeindex',
    stage: INDEX_STAGE,
    location: 'client',
    run: async () => 'CLIENT',
  })
  const serverBackend = (
    run: () => Promise<string>,
  ): ToolBackend<IndexStageRequest, string, typeof INDEX_STAGE> => ({
    id: 'remote-index',
    stage: INDEX_STAGE,
    location: 'server',
    run,
  })

  it('returns null with no registry — the client makeindex default stays intact', async () => {
    expect(await runRemoteIndex(undefined, req)).toBeNull()
  })

  it('returns null when the resolved backend runs on the client (no offload)', async () => {
    const reg = new BackendRegistry({ [INDEX_STAGE]: clientBackend() })
    expect(await runRemoteIndex(reg, req)).toBeNull()
  })

  it('runs a registered server backend and returns its .ind', async () => {
    const reg = new BackendRegistry()
    reg.register(
      INDEX_STAGE,
      serverBackend(async () => 'REMOTE-IND'),
    )
    expect(await runRemoteIndex(reg, req)).toBe('REMOTE-IND')
  })
})

describe('createMakeindexBackend (#115 / #134)', () => {
  it('is a server backend for the index stage', () => {
    const backend = createMakeindexBackend({ endpoint: 'https://x.test/makeindex' })
    expect(backend.id).toBe('makeindex')
    expect(backend.location).toBe('server')
  })

  it('POSTs the .idx and returns the .ind', async () => {
    const fetchImpl = vi.fn(async () => new Response('THE-IND', { status: 200 }))
    const backend = createMakeindexBackend({
      endpoint: 'https://x.test/makeindex',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const req: IndexStageRequest = { idx: '\\indexentry{alpha}{1}' }
    expect(await backend.run(req)).toBe('THE-IND')

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://x.test/makeindex')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual(req)
    expect((init.headers as Record<string, string>)['x-wasmtex-stage']).toBe('index')
  })

  it('rejects on a non-OK response', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 500 }))
    const backend = createMakeindexBackend({
      endpoint: 'https://x.test/makeindex',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    await expect(backend.run({ idx: '' })).rejects.toThrow(/HTTP 500/)
  })
})
