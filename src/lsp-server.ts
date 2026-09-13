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

import { CompletionSnapshotValidationError } from './engine/completion-snapshot'
import type { Diagnostic } from './lsp/diagnostic-provider'
import type {
  CompletionKind,
  NeutralCompletionItem,
  NeutralHover,
  NeutralLocation,
  NeutralRange,
} from './lsp/protocol'
import {
  changeParams,
  documentParams,
  openParams,
  positionParams,
  RpcError,
  text,
} from './lsp/server-params'
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
  private readonly activeRequests = new Map<number | string, { cancelled: boolean }>()

  constructor(
    private send: SendMessage,
    options?: LatexLanguageServiceOptions | LatexLanguageService,
  ) {
    this.service =
      options instanceof LatexLanguageService ? options : new LatexLanguageService(options)
  }

  /** Feed one incoming JSON-RPC message. Responses/notifications go to `send`. */
  handle(message: JsonRpcMessage): void | Promise<void> {
    if (!message.method) return
    const id = message.id
    if (id != null && this.activeRequests.has(id)) {
      this.send({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Request ID is already active' },
      })
      return
    }
    const request = { cancelled: false }
    if (id != null) this.activeRequests.set(id, request)
    const finish = (response: Pick<JsonRpcMessage, 'result' | 'error'>) => {
      if (id == null || this.activeRequests.get(id) !== request) return
      this.activeRequests.delete(id)
      this.send({
        jsonrpc: '2.0',
        id,
        ...(request.cancelled
          ? { error: { code: -32800, message: 'Request cancelled' } }
          : response),
      })
    }
    const fail = (err: unknown) =>
      finish({
        error: {
          code:
            err instanceof RpcError
              ? err.code
              : err instanceof CompletionSnapshotValidationError
                ? -32602
                : -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      })
    try {
      const result = this.dispatch(message)
      if (result instanceof Promise) {
        return result.then((value) => finish({ result: value ?? null }), fail)
      }
      finish({ result: result ?? null })
    } catch (err) {
      fail(err)
    }
  }

  private dispatch(message: JsonRpcMessage): unknown {
    const { method, params } = message
    if (message.id != null && method?.startsWith('$/')) {
      throw new RpcError(-32601, `Unknown request method: ${method}`)
    }
    switch (method) {
      case 'initialize':
        return { capabilities: serverCapabilities() }
      case 'initialized':
      case 'exit':
      case 'shutdown':
        return null
      case '$/cancelRequest': {
        const requestId = params?.id
        if (typeof requestId === 'number' || typeof requestId === 'string') {
          const request = this.activeRequests.get(requestId)
          if (request) request.cancelled = true
        }
        return null
      }
      case 'textDocument/didOpen':
        return this.didOpen(params)
      case 'textDocument/didChange':
        return this.didChange(params)
      case 'textDocument/didClose':
        return this.didClose(params)
      case 'textDocument/completion':
        return this.completion(positionParams(params))
      case 'textDocument/hover':
        return this.hover(positionParams(params))
      case 'textDocument/definition':
        return this.definition(positionParams(params))
      case 'textDocument/references':
        return this.references(positionParams(params))
      case 'textDocument/selectionRange': {
        if (!Array.isArray(params?.positions))
          throw new RpcError(-32602, 'positions must be an array')
        return params.positions.map((position) => {
          const parsed = positionParams({ ...params, position })
          const ranges = this.service.getSelectionRanges(
            pathFromUri(parsed.textDocument.uri),
            parsed.position.line + 1,
            parsed.position.character + 1,
          )
          return lspSelectionRange(ranges, parsed.position)
        })
      }
      case 'textDocument/linkedEditingRange': {
        const { textDocument, position } = positionParams(params)
        const result = this.service.getLinkedEditingRanges(
          pathFromUri(textDocument.uri),
          position.line + 1,
          position.character + 1,
        )
        return result
          ? { ranges: result.ranges.map(toLspRange), wordPattern: result.wordPattern }
          : null
      }
      case 'textDocument/rename':
        return this.rename(params)
      case 'wasmtex/updateCompletionSnapshot':
        return this.service.updateCompletionSnapshot(params?.snapshot)
      case 'wasmtex/setMainFile':
        this.service.setMainFile(text(params?.path, 'path'))
        return null
      case 'wasmtex/completionSnapshotState':
        return this.service.getCompletionSnapshotState()
      default:
        throw new RpcError(-32601, `Unknown method: ${method}`)
    }
  }

  private didOpen(params: Record<string, unknown> | undefined): void {
    const doc = openParams(params)
    this.service.updateDocument({
      fileId: doc.uri,
      path: pathFromUri(doc.uri),
      content: doc.text,
      documentVersion: doc.version,
      language: doc.languageId === 'markdown' ? 'markdown' : 'latex',
    })
    this.publishAllDiagnostics()
  }

  private didChange(params: Record<string, unknown> | undefined): void {
    const doc = changeParams(params)
    if (doc.content === undefined) return
    const path = pathFromUri(doc.uri)
    this.service.updateDocument({
      fileId: doc.uri,
      path,
      content: doc.content,
      documentVersion: doc.version,
      language: /\.md$/i.test(path) ? 'markdown' : 'latex',
    })
    this.publishAllDiagnostics()
  }

  private didClose(params: Record<string, unknown> | undefined): void {
    this.service.removeDocument(documentParams(params).uri)
    this.publishAllDiagnostics()
  }

  private completion(
    params: DocPositionParams,
  ):
    | { isIncomplete: boolean; items: object[] }
    | Promise<{ isIncomplete: boolean; items: object[] }> {
    const { path, line, column } = locate(params)
    const initial = this.service.getCompletionResult(path, line, column)
    const mapResult = (result: typeof initial) => ({
      isIncomplete: result.isIncomplete,
      items: result.items.map((it) => toLspCompletionItem(it, params.position)),
    })
    if (!initial.isIncomplete) return mapResult(initial)
    return this.service.getCompletionResultAsync(path, line, column).then(mapResult)
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
    const { path, line, column } = locate(positionParams(params))
    const newName = text(params?.newName, 'newName')
    const edit = this.service.getRenameEdits(path, line, column, newName)
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
  if (it.filterText) item.filterText = it.filterText
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
    linkedEditingRangeProvider: true,
    selectionRangeProvider: true,
  }
}

interface LspSelectionRange {
  range: ReturnType<typeof toLspRange>
  parent?: LspSelectionRange
}

function lspSelectionRange(ranges: NeutralRange[], position: LspPosition): LspSelectionRange {
  let parent: LspSelectionRange | undefined
  for (let index = ranges.length - 1; index >= 0; index--) {
    parent = { range: toLspRange(ranges[index]!), ...(parent ? { parent } : {}) }
  }
  return parent ?? { range: { start: { ...position }, end: { ...position } } }
}
