import { describe, expect, it } from 'vitest'
import { createCompletionSnapshot } from './engine/completion-snapshot'
import { type JsonRpcMessage, LatexLspServer } from './lsp-server'
import { LatexLanguageService } from './lsp-service'

function fixture() {
  const service = new LatexLanguageService()
  const sent: JsonRpcMessage[] = []
  return { service, sent, server: new LatexLspServer((message) => sent.push(message), service) }
}

function positionRequest(id: number | string, method = 'textDocument/completion'): JsonRpcMessage {
  return {
    id,
    method,
    params: {
      textDocument: { uri: 'file:///main.tex' },
      position: { line: 0, character: 0 },
    },
  }
}

describe('LSP request lifetimes', () => {
  it.each([
    false,
    true,
  ])('ignores cancellation of inactive IDs (previous request: %s)', (previous) => {
    const { server, sent } = fixture()
    if (previous) server.handle({ id: 7, method: 'initialize' })
    server.handle({ method: '$/cancelRequest', params: { id: 7 } })
    server.handle({ id: 7, method: 'initialize' })
    expect(sent).toHaveLength(previous ? 2 : 1)
    expect(sent.at(-1)?.result).toHaveProperty('capabilities')
  })

  it.each([
    'resolve',
    'reject',
  ] as const)('settles a cancelled async %s and permits ID reuse', async (outcome) => {
    const { service, server, sent } = fixture()
    let resolve!: (value: ReturnType<typeof service.getCompletionResult>) => void
    let reject!: (error: Error) => void
    const promise = new Promise<ReturnType<typeof service.getCompletionResult>>((yes, no) => {
      resolve = yes
      reject = no
    })
    service.getCompletionResult = () => ({ items: [], isIncomplete: true })
    service.getCompletionResultAsync = () => promise
    const pending = server.handle(positionRequest('request'))
    server.handle({ method: '$/cancelRequest', params: { id: 'request' } })
    if (outcome === 'resolve') resolve({ items: [], isIncomplete: false })
    else reject(new Error('catalog failed'))
    await pending
    expect(sent).toEqual([
      {
        jsonrpc: '2.0',
        id: 'request',
        error: {
          code: -32800,
          message: 'Request cancelled',
        },
      },
    ])
    server.handle({ id: 'request', method: 'initialize' })
    expect(sent).toHaveLength(2)
    expect(sent[1]?.result).toHaveProperty('capabilities')
  })

  it.each([
    {},
    { textDocument: { uri: 42 }, position: { line: 0, character: 0 } },
    { textDocument: { uri: 'file:///main.tex' }, position: { line: -1, character: 0 } },
    { textDocument: { uri: 'file:///main.tex' }, position: { line: 0, character: 0.5 } },
  ])('rejects malformed positions as invalid params', (params) => {
    const { server, sent } = fixture()
    server.handle({ id: 1, method: 'textDocument/hover', params })
    expect(sent[0]?.error?.code).toBe(-32602)
  })

  it.each([
    { contentChanges: [{ text: 42 }] },
    { contentChanges: [{ text: 'valid' }, { text: null }, { text: 'also valid' }] },
  ])('ignores malformed change lists atomically: %j', ({ contentChanges }) => {
    const { service, server, sent } = fixture()
    server.handle({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///main.tex',
          text: 'original',
          version: 1,
        },
      },
    })
    server.handle({
      method: 'textDocument/didChange',
      params: {
        textDocument: { uri: 'file:///main.tex', version: 2 },
        contentChanges,
      },
    })
    expect(service.getFile('main.tex')).toBe('original')
    expect(sent.filter((message) => message.id != null)).toHaveLength(0)
  })
})

describe('LSP parameter and failure boundaries', () => {
  it.each([
    [
      'textDocument/rename',
      {
        textDocument: { uri: 'file:///main.tex' },
        position: { line: 0, character: 0 },
        newName: 42,
      },
    ],
    ['wasmtex/setMainFile', { path: null }],
    ['wasmtex/updateCompletionSnapshot', { snapshot: {} }],
    ['textDocument/didOpen', { textDocument: { uri: 'file:///main.tex', text: null } }],
    [
      'textDocument/didChange',
      {
        textDocument: { uri: 'file:///main.tex' },
        contentChanges: [{ text: 'partial', range: {} }],
      },
    ],
    ['textDocument/didChange', { textDocument: { uri: 'file:///main.tex' }, contentChanges: {} }],
    ['textDocument/didOpen', { textDocument: { uri: '', text: 'x' } }],
    [
      'textDocument/didOpen',
      { textDocument: { uri: 'file:///main.tex', text: 'x', version: 0.5 } },
    ],
  ])('validates %s before mutation', async (method, params) => {
    const { server, sent, service } = fixture()
    await server.handle({
      id: 1,
      method: method as string,
      params: params as Record<string, unknown>,
    })
    expect(sent[0]?.error?.code).toBe(-32602)
    expect(service.getFile('main.tex')).toBeNull()
  })

  it('settles an internal failure without poisoning a reused ID', () => {
    const { server, service, sent } = fixture()
    service.getHover = () => {
      throw new Error('unexpected service failure')
    }
    server.handle(positionRequest(1, 'textDocument/hover'))
    expect(sent[0]?.error).toEqual({ code: -32603, message: 'unexpected service failure' })
    server.handle({ method: '$/cancelRequest', params: { id: 1 } })
    server.handle({ id: 1, method: 'initialize' })
    expect(sent[1]?.result).toHaveProperty('capabilities')
  })

  it('keeps the original owner when an active ID is reused', async () => {
    const { server, service, sent } = fixture()
    let finish!: (value: ReturnType<typeof service.getCompletionResult>) => void
    service.getCompletionResult = () => ({ items: [], isIncomplete: true })
    service.getCompletionResultAsync = () =>
      new Promise((resolve) => {
        finish = resolve
      })
    const pending = server.handle(positionRequest(1))
    server.handle({ id: 1, method: 'initialize' })
    expect(sent[0]?.error?.code).toBe(-32600)
    finish({ items: [], isIncomplete: false })
    await pending
    expect(sent[1]?.result).toEqual({ items: [], isIncomplete: false })
  })

  it('releases ownership before calling the response transport', () => {
    const sent: JsonRpcMessage[] = []
    const server = new LatexLspServer((message) => {
      sent.push(message)
      if (sent.length === 1) server.handle({ id: 1, method: 'shutdown' })
    })
    server.handle({ id: 1, method: 'initialize' })
    expect(sent[1]).toEqual({ jsonrpc: '2.0', id: 1, result: null })
  })
})

describe('LSP async settlement and document atomicity', () => {
  it.each([
    'resolve',
    'reject',
  ] as const)('cleans up ordinary async %s before ID reuse', async (outcome) => {
    const { service, server, sent } = fixture()
    service.getCompletionResult = () => ({ items: [], isIncomplete: true })
    service.getCompletionResultAsync = async () => {
      if (outcome === 'reject') throw new Error('catalog unavailable')
      return { items: [], isIncomplete: false }
    }
    await server.handle(positionRequest(1))
    if (outcome === 'reject') expect(sent[0]?.error?.code).toBe(-32603)
    else expect(sent[0]?.result).toEqual({ items: [], isIncomplete: false })
    server.handle({ method: '$/cancelRequest', params: { id: 1 } })
    server.handle({ id: 1, method: 'initialize' })
    expect(sent[1]?.result).toHaveProperty('capabilities')
  })

  it('rejects blank main paths as input errors', () => {
    const { server, sent } = fixture()
    server.handle({ id: 1, method: 'wasmtex/setMainFile', params: { path: '   ' } })
    expect(sent[0]?.error?.code).toBe(-32602)
  })
})

it('classifies valid-shape snapshots for the wrong profile as invalid params', async () => {
  const profile = { id: 'expected', texliveYear: '2025' as const, mirrorRevision: 'rev-1' }
  const snapshot = await createCompletionSnapshot({
    engine: 'pdflatex',
    root: 'main.tex',
    profile: { ...profile, id: 'other' },
    projectFiles: [{ path: 'main.tex', content: 'Hello' }],
  })
  const sent: JsonRpcMessage[] = []
  const server = new LatexLspServer((message) => sent.push(message), {
    files: { 'main.tex': 'Hello' },
    completionProfile: profile,
  })
  await server.handle({ id: 1, method: 'wasmtex/updateCompletionSnapshot', params: { snapshot } })
  expect(sent[0]?.error?.code).toBe(-32602)
  expect(sent[0]?.error?.message).toContain('selected completion profile')
  server.handle({ id: 2, method: 'wasmtex/completionSnapshotState' })
  expect(sent[1]?.result).toEqual({ status: 'absent' })
})
