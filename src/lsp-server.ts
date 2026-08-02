/**
 * A thin JSON-RPC Language Server over the editor-agnostic core
 * ({@link LatexLanguageService}). It maps a subset of the Language Server
 * Protocol — completion, hover, definition, references, diagnostics, rename — to
 * the neutral provider cores, so wasmtex's intelligence runs in any LSP host
 * (VS Code, Neovim, a browser Web Worker).
 *
 * Transport-agnostic: construct with a `send` callback and feed incoming
 * messages to {@link handle}. Wire `send`/`handle` to stdio (Node), a Web Worker
 * `postMessage`/`onmessage`, or any framing you like.
 */

import type { Diagnostic } from './lsp/diagnostic-provider'
import type {
  CompletionKind,
  NeutralCompletionItem,
  NeutralHover,
  NeutralLocation,
  NeutralRange,
} from './lsp/protocol'
import { LatexLanguageService, type LatexLanguageServiceOptions } from './lsp-service'

export interface JsonRpcMessage {
  jsonrpc?: '2.0'
  id?: number | string | null
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code: number; message: string }
}

export type SendMessage = (message: JsonRpcMessage) => void

// LSP enum values (subset).
const LSP_COMPLETION_KIND: Record<CompletionKind, number> = {
  text: 1,
  command: 3, // Function
  variable: 6,
  module: 9,
  keyword: 14,
  file: 17,
  reference: 18,
}
const LSP_SEVERITY: Record<Diagnostic['severity'], number> = { error: 1, warning: 2, info: 3 }

interface LspPosition {
  line: number
  character: number
}

function toLspPos(line: number, column: number): LspPosition {
  return { line: line - 1, character: column - 1 }
}
function toLspRange(r: NeutralRange): { start: LspPosition; end: LspPosition } {
  return { start: toLspPos(r.startLine, r.startColumn), end: toLspPos(r.endLine, r.endColumn) }
}
export function pathFromUri(uri: string): string {
  const raw = uri.replace(/^file:\/\//, '').replace(/^\//, '')
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw // malformed percent-escape — use the raw path rather than throw
  }
}
export function uriFromPath(path: string): string {
  // Percent-encode each path segment so the URI is the inverse of pathFromUri's decode:
  // a name containing '%', a space, '#' or '?' must round-trip, not corrupt the path.
  return `file:///${path.split('/').map(encodeURIComponent).join('/')}`
}

interface DocPositionParams {
  textDocument: { uri: string }
  position: LspPosition
}

export class LatexLspServer {
  private service: LatexLanguageService

  constructor(
    private send: SendMessage,
    options?: LatexLanguageServiceOptions,
  ) {
    this.service = new LatexLanguageService(options)
  }

  /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
  handle(message: JsonRpcMessage): void {
    if (!message.method) return
    try {
      this.dispatch(message)
    } catch (err) {
      // A malformed request must not crash the dispatch loop — and neither may
      // building the error reply, so read the message defensively (dispatch
      // could throw a non-Error like null/undefined).
      if (message.id != null) {
        const detail = err instanceof Error ? err.message : String(err)
        this.respondError(message.id, -32603, `Internal error: ${detail}`)
      }
    }
  }

  private dispatch(message: JsonRpcMessage): void {
    const { id, method, params } = message
    const pos = params as unknown as DocPositionParams
    switch (method) {
      case 'initialize':
        this.respond(id, { capabilities: serverCapabilities() })
        break
      case 'initialized':
      case 'shutdown':
        this.respond(id, null)
        break
      case 'textDocument/didOpen':
        this.didOpen(params)
        break
      case 'textDocument/didChange':
        this.didChange(params)
        break
      case 'textDocument/completion':
        this.respond(id, this.completion(pos))
        break
      case 'textDocument/hover':
        this.respond(id, this.hover(pos))
        break
      case 'textDocument/definition':
        this.respond(id, this.definition(pos))
        break
      case 'textDocument/references':
        this.respond(id, this.references(pos))
        break
      case 'textDocument/rename':
        this.respond(id, this.rename(params))
        break
      default:
        if (id != null) this.respondError(id, -32601, `Unknown method: ${method}`)
    }
  }

  private respond(id: JsonRpcMessage['id'], result: unknown): void {
    if (id != null) this.send({ jsonrpc: '2.0', id, result })
  }
  private respondError(id: number | string, code: number, msg: string): void {
    this.send({ jsonrpc: '2.0', id, error: { code, message: msg } })
  }

  private didOpen(params: Record<string, unknown> | undefined): void {
    const doc = (params?.textDocument ?? {}) as { uri: string; text: string }
    this.service.updateFile(pathFromUri(doc.uri), doc.text ?? '')
    this.publishAllDiagnostics()
  }

  private didChange(params: Record<string, unknown> | undefined): void {
    const td = (params?.textDocument ?? {}) as { uri: string }
    const changes = (params?.contentChanges ?? []) as Array<{ text: string }>
    // No changes → no-op. Falling back to '' would full-sync-replace the document with empty
    // content, wiping its symbols/diagnostics. A conformant full-sync client always sends the
    // whole text, so an empty array is malformed and must be ignored, not destructive.
    if (!changes.length) return
    this.service.updateFile(pathFromUri(td.uri), changes[changes.length - 1]!.text)
    this.publishAllDiagnostics()
  }

  private completion(params: DocPositionParams): { isIncomplete: boolean; items: object[] } {
    const { path, line, column } = locate(params)
    const result = this.service.getCompletionResult(path, line, column)
    return {
      isIncomplete: result.isIncomplete,
      items: result.items.map((it) => toLspCompletionItem(it, params.position)),
    }
  }

  private hover(params: DocPositionParams): object | null {
    const { path, line, column } = locate(params)
    const hover = this.service.getHover(path, line, column)
    return hover ? toLspHover(hover) : null
  }

  private definition(params: DocPositionParams): object | null {
    const { path, line, column } = locate(params)
    const def = this.service.getDefinition(path, line, column)
    return def ? toLspLocation(def) : null
  }

  private references(params: DocPositionParams): object[] {
    const { path, line, column } = locate(params)
    return this.service.getReferences(path, line, column).map(toLspLocation)
  }

  private rename(params: Record<string, unknown> | undefined): object | null {
    const td = (params?.textDocument ?? {}) as { uri: string }
    const pos = (params?.position ?? { line: 0, character: 0 }) as LspPosition
    const newName = String(params?.newName ?? '')
    const edit = this.service.getRenameEdits(
      pathFromUri(td.uri),
      pos.line + 1,
      pos.character + 1,
      newName,
    )
    if (!edit) return null
    const changes: Record<string, object[]> = {}
    for (const e of edit.edits) {
      const uri = uriFromPath(e.file)
      const list = changes[uri] ?? []
      changes[uri] = list
      list.push({
        range: {
          start: toLspPos(e.range.startLineNumber, e.range.startColumn),
          end: toLspPos(e.range.endLineNumber, e.range.endColumn),
        },
        newText: e.newText,
      })
    }
    return { changes }
  }

  /** URIs that currently carry diagnostics — so the next publish can clear them. */
  private publishedUris = new Set<string>()

  /**
   * Publish diagnostics project-wide. Diagnostics are computed across the whole
   * project, so a change in one file can fix (or introduce) markers in another;
   * publishing only the changed file would leave stale cross-file diagnostics.
   * Files that previously had diagnostics but no longer do are sent an empty array
   * so their markers clear.
   */
  private publishAllDiagnostics(): void {
    const byUri = new Map<string, object[]>()
    for (const d of this.service.getDiagnostics()) {
      const uri = uriFromPath(d.file)
      const list = byUri.get(uri) ?? []
      list.push(toLspDiagnostic(d))
      byUri.set(uri, list)
    }
    // Notify every file that has diagnostics now, plus any previously published
    // (to clear markers that a cross-file change resolved).
    const targets = new Set<string>(this.publishedUris)
    for (const uri of byUri.keys()) targets.add(uri)
    this.publishedUris = new Set(byUri.keys())
    for (const uri of targets) {
      this.send({
        jsonrpc: '2.0',
        method: 'textDocument/publishDiagnostics',
        params: { uri, diagnostics: byUri.get(uri) ?? [] },
      })
    }
  }
}

function locate(params: DocPositionParams): { path: string; line: number; column: number } {
  return {
    path: pathFromUri(params.textDocument.uri),
    line: params.position.line + 1,
    column: params.position.character + 1,
  }
}

function toLspCompletionItem(it: NeutralCompletionItem, pos: LspPosition): object {
  // Emit an explicit textEdit so the replaced range is exact. Command items
  // strip the leading backslash from insertText, so without this the client's
  // own word pattern could delete the `\`.
  const range = it.replacementRange
    ? toLspRange(it.replacementRange)
    : {
        start: { line: pos.line, character: Math.max(0, pos.character - it.replaceLength) },
        end: pos,
      }
  const item: Record<string, unknown> = {
    label: it.label,
    kind: LSP_COMPLETION_KIND[it.kind],
    insertTextFormat: it.snippet ? 2 : 1, // 2 = snippet
    textEdit: {
      range,
      newText: it.insertText,
    },
  }
  if (it.detail) item.detail = it.detail
  if (it.documentation) item.documentation = it.documentation
  if (it.sortText) item.sortText = it.sortText
  if (it.data) item.data = it.data
  return item
}

function toLspHover(hover: NeutralHover): object {
  return {
    contents: { kind: 'markdown', value: hover.contents.join('\n\n') },
    range: toLspRange(hover.range),
  }
}

function toLspLocation(loc: NeutralLocation): object {
  return { uri: uriFromPath(loc.file), range: toLspRange(loc.range) }
}

function toLspDiagnostic(d: Diagnostic): object {
  return {
    range: {
      start: toLspPos(d.line, d.column),
      end: toLspPos(d.line, d.endColumn),
    },
    severity: LSP_SEVERITY[d.severity],
    code: d.code,
    message: d.message,
    source: 'wasmtex',
  }
}

function serverCapabilities(): object {
  return {
    textDocumentSync: 1, // full
    completionProvider: { triggerCharacters: ['\\', '{', '[', ',', '=', '@'] },
    hoverProvider: true,
    definitionProvider: true,
    referencesProvider: true,
    renameProvider: true,
  }
}
