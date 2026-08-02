import * as monaco from 'monaco-editor'
import type { VirtualFS } from '../fs/virtual-fs'
import type { CompletionResolverRegistry } from './completion-registry'
import { modelToDoc } from './monaco-doc'
import { provideCompletionResult } from './neutral-providers'
import type { ProjectIndex } from './project-index'
import type { CompletionKind, NeutralCompletionItem } from './protocol'

const Kind = monaco.languages.CompletionItemKind

const KIND_MAP: Record<CompletionKind, monaco.languages.CompletionItemKind> = {
  command: Kind.Function,
  reference: Kind.Reference,
  module: Kind.Module,
  file: Kind.File,
  keyword: Kind.Keyword,
  text: Kind.Text,
  variable: Kind.Variable,
}

/** Monaco completion adapter over the editor-neutral completion result. */
export function createCompletionProvider(
  index: ProjectIndex,
  fs: VirtualFS,
  registry?: CompletionResolverRegistry,
): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['\\', '{', '[', ',', '='],
    provideCompletionItems(model, position, _context, cancellationToken) {
      if (cancellationToken?.isCancellationRequested) return { suggestions: [] }
      const result = provideCompletionResult(
        modelToDoc(model),
        { line: position.lineNumber, column: position.column },
        index,
        fs,
        {
          ...(cancellationToken ? { cancellationToken } : {}),
          ...(registry ? { registry } : {}),
        },
      )
      return {
        suggestions: result.items.map((item) => toMonacoItem(item, position)),
        incomplete: result.isIncomplete,
      }
    },
  }
}

function toMonacoItem(
  it: NeutralCompletionItem,
  position: monaco.Position,
): monaco.languages.CompletionItem {
  const replacementRange = it.replacementRange
  const item: monaco.languages.CompletionItem = {
    label: it.label,
    kind: KIND_MAP[it.kind],
    insertText: it.insertText,
    range: replacementRange
      ? {
          startLineNumber: replacementRange.startLine,
          startColumn: replacementRange.startColumn,
          endLineNumber: replacementRange.endLine,
          endColumn: replacementRange.endColumn,
        }
      : {
          startLineNumber: position.lineNumber,
          startColumn: position.column - it.replaceLength,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
  }
  if (it.snippet) {
    item.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  }
  if (it.detail) item.detail = it.detail
  if (it.documentation) item.documentation = { value: it.documentation }
  if (it.sortText) item.sortText = it.sortText
  return item
}
