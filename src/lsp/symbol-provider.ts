import * as monaco from 'monaco-editor'
import type { ProjectIndex } from './project-index'
import type { FileSymbols, SectionLevel } from './types'

const SymbolKind = monaco.languages.SymbolKind
type DocumentSymbol = monaco.languages.DocumentSymbol

const SECTION_DEPTH: Record<SectionLevel, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
}

type Entry =
  | { line: number; type: 'section'; level: SectionLevel; title: string }
  | { line: number; type: 'other'; sym: DocumentSymbol }

function makeSymbol(
  name: string,
  detail: string,
  kind: monaco.languages.SymbolKind,
  line: number,
): DocumentSymbol {
  return {
    name,
    detail,
    kind,
    range: new monaco.Range(line, 1, line, 1),
    selectionRange: new monaco.Range(line, 1, line, 1),
    tags: [],
    children: [],
  }
}

function collectEntries(symbols: FileSymbols): Entry[] {
  const entries: Entry[] = []
  for (const sec of symbols.sections) {
    entries.push({
      line: sec.location.line,
      type: 'section',
      level: sec.level,
      title: sec.title,
    })
  }
  for (const label of symbols.labels) {
    entries.push({
      line: label.location.line,
      type: 'other',
      sym: makeSymbol(`\\label{${label.name}}`, 'label', SymbolKind.Key, label.location.line),
    })
  }
  for (const cmd of symbols.commands) {
    entries.push({
      line: cmd.location.line,
      type: 'other',
      sym: makeSymbol(`\\${cmd.name}`, 'command', SymbolKind.Function, cmd.location.line),
    })
  }
  for (const env of symbols.environments) {
    entries.push({
      line: env.location.line,
      type: 'other',
      sym: makeSymbol(env.name, 'environment', SymbolKind.Struct, env.location.line),
    })
  }
  entries.sort((a, b) => a.line - b.line)
  return entries
}

function pushToParentOrRoot(
  sym: DocumentSymbol,
  stack: { sym: DocumentSymbol; depth: number }[],
  root: DocumentSymbol[],
): void {
  if (stack.length > 0) {
    stack[stack.length - 1]!.sym.children!.push(sym)
  } else {
    root.push(sym)
  }
}

function buildTree(entries: Entry[]): DocumentSymbol[] {
  const root: DocumentSymbol[] = []
  const stack: { sym: DocumentSymbol; depth: number }[] = []

  for (const entry of entries) {
    if (entry.type === 'section') {
      const depth = SECTION_DEPTH[entry.level]
      const sym = makeSymbol(entry.title, entry.level, SymbolKind.Module, entry.line)
      while (stack.length > 0 && stack[stack.length - 1]!.depth >= depth) {
        stack.pop()
      }
      pushToParentOrRoot(sym, stack, root)
      stack.push({ sym, depth })
    } else {
      pushToParentOrRoot(entry.sym, stack, root)
    }
  }

  return root
}

export function createDocumentSymbolProvider(
  index: ProjectIndex,
): monaco.languages.DocumentSymbolProvider {
  return {
    provideDocumentSymbols(model: monaco.editor.ITextModel): DocumentSymbol[] {
      const filePath = model.uri.path.startsWith('/') ? model.uri.path.slice(1) : model.uri.path
      const symbols = index.getFileSymbols(filePath)
      if (!symbols) return []
      return buildTree(collectEntries(symbols))
    },
  }
}
