/**
 * Monaco bindings for the editor-neutral language features in
 * `language-features.ts`. Each provider reads the model text, calls the pure
 * core, and converts the result to Monaco types.
 */
import * as monaco from 'monaco-editor'
import type { VirtualFS } from '../fs/virtual-fs'
import { CompletionResolverRegistry } from './completion-registry'
import { ENVIRONMENT_NAME_PATTERN, linkedEnvironmentRanges } from './environment-pairs'
import {
  type CodeAction,
  getCodeActions,
  getDocumentHighlights,
  getDocumentLinks,
  getFoldingRanges,
  getInlayHints,
  getSemanticTokens,
  getSignatureHelp,
  type LFRange,
} from './language-features'
import { projectCommandMetadata } from './project-command-metadata'
import type { ProjectIndex } from './project-index'
import { getStructuralSelectionIndex, structuralSelectionRanges } from './structural-selection'

function toRange(r: LFRange): monaco.Range {
  return new monaco.Range(r.startLine, r.startColumn, r.endLine, r.endColumn)
}

export function createSignatureHelpProvider(
  index?: ProjectIndex,
  registry = new CompletionResolverRegistry(),
): monaco.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ['{', '[', ','],
    signatureHelpRetriggerCharacters: ['}', ']'],
    provideSignatureHelp(model, position) {
      const metadata = index
        ? projectCommandMetadata(index, model.uri.path.replace(/^\//, ''), registry)
        : registry
      const help = getSignatureHelp(
        model.getValue(),
        position.lineNumber,
        position.column,
        metadata,
      )
      if (!help) return null
      return {
        value: {
          signatures: [
            {
              label: help.label,
              parameters: help.parameters.map((p) => ({ label: p })),
            },
          ],
          activeSignature: 0,
          activeParameter: help.activeParameter,
        },
        dispose() {},
      }
    },
  }
}

export function createFoldingRangeProvider(): monaco.languages.FoldingRangeProvider {
  return {
    provideFoldingRanges(model) {
      return getFoldingRanges(model.getValue()).map((r) => {
        const range: monaco.languages.FoldingRange = { start: r.startLine, end: r.endLine }
        if (r.kind === 'region') range.kind = monaco.languages.FoldingRangeKind.Region
        else if (r.kind === 'comment') range.kind = monaco.languages.FoldingRangeKind.Comment
        return range
      })
    },
  }
}

export function createDocumentHighlightProvider(
  index: ProjectIndex,
): monaco.languages.DocumentHighlightProvider {
  return {
    provideDocumentHighlights(model, position) {
      const file = model.uri.path.replace(/^\//, '')
      return getDocumentHighlights(file, position.lineNumber, position.column, index).map((r) => ({
        range: toRange(r),
        kind: monaco.languages.DocumentHighlightKind.Text,
      }))
    },
  }
}

export function createInlayHintsProvider(index: ProjectIndex): monaco.languages.InlayHintsProvider {
  return {
    provideInlayHints(model) {
      const hints = getInlayHints(model.getValue(), index).map((h) => ({
        position: { lineNumber: h.line, column: h.column },
        label: h.label,
        kind: monaco.languages.InlayHintKind.Type,
        paddingLeft: true,
      }))
      return { hints, dispose() {} }
    },
  }
}

export function createLinkProvider(): monaco.languages.LinkProvider {
  return {
    provideLinks(model) {
      const links = getDocumentLinks(model.getValue()).map((l) => {
        const range = toRange(l.range)
        if (l.kind === 'url') return { range, url: l.target }
        // File links resolve relative to the current document. Only append `.tex` to an
        // EXTENSIONLESS target — `\input{macros.sty}`/`\input{foo.txt}` load that exact
        // file, so suffixing `.tex` would point the link at a non-existent `*.tex`.
        const dir = model.uri.path.replace(/[^/]*$/, '')
        const hasExt = /\.[^./]+$/.test(l.target)
        const path = hasExt ? l.target : `${l.target}.tex`
        return { range, url: monaco.Uri.file(`${dir}${path}`) }
      })
      return { links }
    },
  }
}

const SEMANTIC_LEGEND: monaco.languages.SemanticTokensLegend = {
  tokenTypes: ['macro', 'comment', 'string', 'operator'],
  tokenModifiers: [],
}
const SEMANTIC_TYPE_INDEX: Record<string, number> = {
  command: 0,
  comment: 1,
  verbatim: 2,
  math: 3,
}

export function createSemanticTokensProvider(): monaco.languages.DocumentSemanticTokensProvider {
  return {
    getLegend: () => SEMANTIC_LEGEND,
    provideDocumentSemanticTokens(model) {
      const tokens = getSemanticTokens(model.getValue())
      const data: number[] = []
      let prevLine = 0
      let prevCol = 0
      for (const t of tokens) {
        const line = t.line - 1
        const col = t.startColumn - 1
        const deltaLine = line - prevLine
        const deltaCol = deltaLine === 0 ? col - prevCol : col
        data.push(deltaLine, deltaCol, t.length, SEMANTIC_TYPE_INDEX[t.type] ?? 0, 0)
        prevLine = line
        prevCol = col
      }
      return { data: new Uint32Array(data) }
    },
    releaseDocumentSemanticTokens() {},
  }
}

/** Code-action provider. Applies workspace edits through `onWorkspaceEdit` if provided. */
export function createCodeActionProvider(index: ProjectIndex): monaco.languages.CodeActionProvider {
  return {
    provideCodeActions(model, range) {
      const file = model.uri.path.replace(/^\//, '')
      const actions = getCodeActions(model.getValue(), file, range.startLineNumber, index)
      return {
        actions: actions.map((a) => toMonacoCodeAction(a)),
        dispose() {},
      }
    },
  }
}

function toMonacoCodeAction(action: CodeAction): monaco.languages.CodeAction {
  return {
    title: action.title,
    kind: 'quickfix',
    edit: {
      edits: action.edits.map((e) => ({
        resource: monaco.Uri.file(`/${e.file}`),
        textEdit: { range: toRange(e.edit.range), text: e.edit.newText },
        versionId: undefined,
      })),
    },
  }
}

export function createLinkedEditingRangeProvider(
  index: ProjectIndex,
  fs: VirtualFS,
): monaco.languages.LinkedEditingRangeProvider {
  return {
    provideLinkedEditingRanges(model, position, token) {
      const path = model.uri.path.replace(/^\//, '')
      if (token.isCancellationRequested || fs.readFile(path) !== model.getValue()) return null
      const ranges = linkedEnvironmentRanges(
        index.getFileSymbols(path)?.environmentNamePairs ?? [],
        position.lineNumber,
        position.column,
      )
      return ranges
        ? { ranges: ranges.map(toRange), wordPattern: new RegExp(ENVIRONMENT_NAME_PATTERN) }
        : null
    },
  }
}

export function createSelectionRangeProvider(
  index: ProjectIndex,
  fs: VirtualFS,
  registry = new CompletionResolverRegistry(),
): monaco.languages.SelectionRangeProvider {
  return {
    provideSelectionRanges(model, positions, token) {
      const path = model.uri.path.replace(/^\//, '')
      if (token.isCancellationRequested || fs.readFile(path) !== model.getValue())
        return positions.map(() => [])
      const metadata = projectCommandMetadata(index, path, registry)
      const structure = getStructuralSelectionIndex(index.getFileSymbols(path))
      return positions.map((position) =>
        structuralSelectionRanges(
          structure,
          position.lineNumber,
          position.column,
          metadata,
          token,
        ).map((range) => ({ range: toRange(range) })),
      )
    },
  }
}
