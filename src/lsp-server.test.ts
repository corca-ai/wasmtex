import { describe, expect, it } from 'vitest'
import {
  InMemoryTexResourceCatalogProvider,
  type TexResourceCatalogIdentity,
} from './lsp/resource-catalog'
import { type JsonRpcMessage, LatexLspServer, pathFromUri, uriFromPath } from './lsp-server'
import type { LatexLanguageServiceOptions } from './lsp-service'

function makeServer(options?: LatexLanguageServiceOptions) {
  const sent: JsonRpcMessage[] = []
  const server = new LatexLspServer((m) => sent.push(m), options)
  return { server, sent }
}

const responseFor = (sent: JsonRpcMessage[], id: number) => sent.find((m) => m.id === id)
// biome-ignore lint/suspicious/noExplicitAny: terse LSP result access in a smoke test
const result = (sent: JsonRpcMessage[], id: number): any => responseFor(sent, id)?.result

const URI = 'file:///main.tex'
const TEXT = [
  '\\newcommand{\\foo}{x}',
  '\\label{sec:intro}',
  'See \\ref{sec:intro} and \\foo.',
].join('\n')

describe('uriFromPath / pathFromUri', () => {
  it('round-trips paths containing %, spaces, separators and URI metachars', () => {
    for (const p of ['main.tex', 'sub/intro.tex', 'a b.tex', 'a%20b.tex', 'a#b?.tex']) {
      expect(pathFromUri(uriFromPath(p))).toBe(p)
    }
  })

  it('percent-encodes the emitted URI so it is a valid file URI', () => {
    expect(uriFromPath('a b.tex')).toBe('file:///a%20b.tex')
    // a literal %20 in the name must survive (encodes to %2520), not decode back to a space
    expect(uriFromPath('a%20b.tex')).toBe('file:///a%2520b.tex')
    // directory separators are preserved (encoded per-segment)
    expect(uriFromPath('sub/intro.tex')).toBe('file:///sub/intro.tex')
  })
})

describe('LatexLspServer', () => {
  it('reports capabilities on initialize', () => {
    const { server, sent } = makeServer()
    server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    expect(result(sent, 1).capabilities.hoverProvider).toBe(true)
    expect(result(sent, 1).capabilities.completionProvider.triggerCharacters).toContain('\\')
  })

  it('publishes diagnostics on didOpen', () => {
    const { server, sent } = makeServer()
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: URI, text: 'See \\ref{missing}' } },
    })
    const diag = sent.find((m) => m.method === 'textDocument/publishDiagnostics')
    expect(diag).toBeDefined()
    const codes = (diag!.params as { diagnostics: Array<{ code: string }> }).diagnostics.map(
      (d) => d.code,
    )
    expect(codes).toContain('undefined-ref')
  })

  const diagsFor = (sent: JsonRpcMessage[], uri: string) =>
    sent.filter(
      (m) =>
        m.method === 'textDocument/publishDiagnostics' && (m.params as { uri: string }).uri === uri,
    )
  const codesOf = (m: JsonRpcMessage) =>
    (m.params as { diagnostics: Array<{ code: string }> }).diagnostics.map((d) => d.code)

  it('re-publishes diagnostics for other files when a cross-file change resolves them', () => {
    const { server, sent } = makeServer()
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///main.tex', text: 'See \\ref{sec:intro}' } },
    })
    // main.tex has an undefined-ref before its label is defined elsewhere.
    expect(codesOf(diagsFor(sent, 'file:///main.tex').at(-1)!)).toContain('undefined-ref')

    // Defining the label in another file must clear main.tex's undefined-ref.
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: 'file:///chapter.tex', text: '\\label{sec:intro}' } },
    })
    const last = diagsFor(sent, 'file:///main.tex').at(-1)!
    expect(codesOf(last)).not.toContain('undefined-ref')
  })

  it('answers hover, definition, references, and rename over JSON-RPC', () => {
    const { server, sent } = makeServer()
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri: URI, text: TEXT } },
    })

    // Hover on \ref{sec:intro} (0-based line 2).
    server.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'textDocument/hover',
      params: { textDocument: { uri: URI }, position: { line: 2, character: 6 } },
    })
    expect(result(sent, 2).contents.value).toContain('sec:intro')

    // Definition jumps to the \label on 0-based line 1.
    server.handle({
      jsonrpc: '2.0',
      id: 3,
      method: 'textDocument/definition',
      params: { textDocument: { uri: URI }, position: { line: 2, character: 6 } },
    })
    expect(result(sent, 3).uri).toBe(URI)
    expect(result(sent, 3).range.start.line).toBe(1)

    // References from the \label finds the \ref usage.
    server.handle({
      jsonrpc: '2.0',
      id: 4,
      method: 'textDocument/references',
      params: { textDocument: { uri: URI }, position: { line: 1, character: 8 } },
    })
    expect(result(sent, 4).length).toBeGreaterThan(0)

    // Rename the label → workspace edit on this document.
    server.handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'textDocument/rename',
      params: {
        textDocument: { uri: URI },
        position: { line: 1, character: 8 },
        newName: 'sec:new',
      },
    })
    expect(Object.keys(result(sent, 5).changes)).toContain(URI)
  })

  it('completes a command prefix', () => {
    const { server, sent } = makeServer()
    const uri = 'file:///m.tex'
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: '\\fra' } },
    })
    server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'textDocument/completion',
      params: { textDocument: { uri }, position: { line: 0, character: 4 } },
    })
    const frac = result(sent, 1).items.find((i: { label: string }) => i.label === '\\frac')
    expect(frac).toBeDefined()
    // A textEdit replaces only the typed name (\ stays); range is the 'fra' span.
    expect(frac.textEdit.range.start).toEqual({ line: 0, character: 1 })
    expect(frac.textEdit.range.end).toEqual({ line: 0, character: 4 })
    expect(frac.textEdit.newText).toContain('frac')
  })

  it('returns exact catalog resources over JSON-RPC', () => {
    const identity: TexResourceCatalogIdentity = {
      schemaVersion: 1,
      texliveYear: '2025',
      mirrorRevision: '2025-0123456789abcdef',
    }
    const resourceCatalog = new InMemoryTexResourceCatalogProvider(identity, [
      {
        ...identity,
        kind: 'tex-class',
        resources: [
          {
            name: 'book',
            fileName: 'book.cls',
            extension: 'cls',
            key: 'pdftex/26/book.cls',
            format: 26,
            bytes: 10,
            sha256: 'a'.repeat(64),
            texliveYear: identity.texliveYear,
            mirrorRevision: identity.mirrorRevision,
            sourcePath: 'texmf-dist/tex/latex/base/book.cls',
            texlivePackage: 'latex',
            packageRevision: '42',
            catalogue: 'latex',
          },
        ],
      },
    ])
    const { server, sent } = makeServer({ resourceCatalog })
    const uri = 'file:///m.tex'
    const line = '\\documentclass{bo}'
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: line } },
    })
    server.handle({
      jsonrpc: '2.0',
      id: 12,
      method: 'textDocument/completion',
      params: { textDocument: { uri }, position: { line: 0, character: line.indexOf('}') } },
    })

    expect(result(sent, 12)).toMatchObject({
      isIncomplete: false,
      items: [{ label: 'book' }],
    })
  })

  it('preserves the neutral replacement range for a list item with a suffix', () => {
    const { server, sent } = makeServer()
    const uri = 'file:///m.tex'
    const line = '\\cref{fig:a, fiX:b}'
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: `\\label{fig:b}\n${line}` } },
    })
    const start = line.indexOf('fiX:b')
    server.handle({
      jsonrpc: '2.0',
      id: 11,
      method: 'textDocument/completion',
      params: { textDocument: { uri }, position: { line: 1, character: start + 2 } },
    })

    const item = result(sent, 11).items.find(
      (candidate: { label: string }) => candidate.label === 'fig:b',
    )
    expect(item.textEdit).toEqual({
      range: {
        start: { line: 1, character: start },
        end: { line: 1, character: start + 'fiX:b'.length },
      },
      newText: 'fig:b',
    })
  })

  it('preserves color expression edits and metadata over JSON-RPC', () => {
    const { server, sent } = makeServer()
    const uri = 'file:///colors.tex'
    const lines = [
      '\\usepackage{xcolor}',
      '\\definecolor{blueish}{RGB}{1,2,3}',
      '\\color{red!50!blX}',
    ]
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: lines.join('\n') } },
    })
    server.handle({
      jsonrpc: '2.0',
      id: 13,
      method: 'textDocument/completion',
      params: { textDocument: { uri }, position: { line: 2, character: 16 } },
    })

    const blueish = result(sent, 13).items.find(
      (candidate: { label: string }) => candidate.label === 'blueish',
    )
    expect(blueish.textEdit).toEqual({
      range: {
        start: { line: 2, character: 14 },
        end: { line: 2, character: 17 },
      },
      newText: 'blueish',
    })
    expect(blueish.data).toMatchObject({
      wasmtex: { domain: 'color', color: { css: '#010203' } },
    })
  })

  it('does not erase the document when didChange carries no contentChanges', () => {
    const { server, sent } = makeServer()
    const uri = 'file:///m.tex'
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: '\\newcommand{\\foo}{x}\n\\foo' } },
    })
    // A malformed/no-op change with an empty contentChanges array must be ignored,
    // not full-sync-replaced with '' (which would wipe the document and its symbols).
    server.handle({
      method: 'textDocument/didChange',
      params: { textDocument: { uri }, contentChanges: [] },
    })
    server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'textDocument/completion',
      params: { textDocument: { uri }, position: { line: 1, character: 4 } },
    })
    // \foo is still indexed → the document was not erased.
    const foo = result(sent, 1).items.find((i: { label: string }) => i.label === '\\foo')
    expect(foo).toBeDefined()
  })

  it('resolves definition for a key inside a multi-key \\cite', () => {
    const { server, sent } = makeServer()
    const uri = 'file:///m.tex'
    server.handle({
      method: 'textDocument/didOpen',
      params: { textDocument: { uri, text: '\\cite{a,knuth84}\n\\bibitem{knuth84} X.' } },
    })
    // Cursor on `knuth84` (the 2nd key) → definition jumps to its \bibitem.
    server.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'textDocument/definition',
      params: { textDocument: { uri }, position: { line: 0, character: 10 } },
    })
    expect(result(sent, 1)).not.toBeNull()
    expect(result(sent, 1).range.start.line).toBe(1) // \bibitem is on line 1
  })

  it('replies with an error for an unknown request method', () => {
    const { server, sent } = makeServer()
    server.handle({ jsonrpc: '2.0', id: 9, method: 'textDocument/foo', params: {} })
    expect(responseFor(sent, 9)!.error!.code).toBe(-32601)
  })

  it('does not crash on a malformed request (missing position)', () => {
    const { server, sent } = makeServer()
    expect(() =>
      server.handle({
        jsonrpc: '2.0',
        id: 10,
        method: 'textDocument/hover',
        params: { textDocument: { uri: URI } },
      }),
    ).not.toThrow()
    expect(responseFor(sent, 10)!.error!.code).toBe(-32603)
  })
})
