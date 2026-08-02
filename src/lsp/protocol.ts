/**
 * Editor-neutral provider types. These mirror the LSP/Monaco concepts without
 * depending on either, so the same provider cores back the Monaco adapter
 * (`register-providers.ts`) and the standalone LSP server (`lsp-server.ts`).
 */

/** 1-based position. */
export interface NeutralPosition {
  line: number
  column: number
}

/** 1-based, end-exclusive range. */
export interface NeutralRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export interface NeutralLocation {
  /** Project-relative file path. */
  file: string
  range: NeutralRange
}

export type CompletionKind =
  | 'command'
  | 'reference'
  | 'module'
  | 'file'
  | 'keyword'
  | 'text'
  | 'variable'

export interface NeutralCompletionItem {
  label: string
  kind: CompletionKind
  insertText: string
  /** True when `insertText` is a snippet (with `$1`/`${1:x}` placeholders). */
  snippet?: boolean
  detail?: string
  documentation?: string
  sortText?: string
  /** Prefix length to replace (so adapters can compute the edit range). */
  replaceLength: number
  /** Exact replacement range. New adapters prefer this over the legacy same-line length. */
  replacementRange?: NeutralRange
  /** Host-neutral structured metadata that adapters preserve verbatim. */
  data?: Record<string, unknown>
}

export interface NeutralCompletionList {
  items: NeutralCompletionItem[]
  /** More candidates may become available after lazy metadata finishes loading. */
  isIncomplete: boolean
}

export interface NeutralHover {
  contents: string[]
  range: NeutralRange
}

/** A minimal read-only text document the provider cores operate on. */
export interface NeutralDocument {
  /** Project-relative path (used to attribute symbols). */
  path: string
  /** Full text. */
  getText(): string
  /** 1-based line content. */
  lineAt(line: number): string
}
