import * as monaco from 'monaco-editor'
import type { VirtualFS } from '../fs/virtual-fs'
import { modelToDoc } from './monaco-doc'
import { provideCompletions } from './neutral-providers'
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

/** Monaco completion adapter over the editor-neutral {@link provideCompletions}. */
export function createCompletionProvider(
  index: ProjectIndex,
  fs: VirtualFS,
): monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ['\\', '{'],
    provideCompletionItems(model, position) {
      const items = provideCompletions(
        modelToDoc(model),
        { line: position.lineNumber, column: position.column },
        index,
        fs,
      )
      return { suggestions: items.map((item) => toMonacoItem(item, position)) }
    },
  }
}

function toMonacoItem(
  it: NeutralCompletionItem,
  position: monaco.Position,
): monaco.languages.CompletionItem {
  const item: monaco.languages.CompletionItem = {
    label: it.label,
    kind: KIND_MAP[it.kind],
    insertText: it.insertText,
    range: {
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
