import type * as Monaco from 'monaco-editor'
import type { ProjectIndex } from './project-index'

export interface WorkspaceEditInfo {
  edits: Array<{
    file: string
    range: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
    }
    newText: string
  }>
}

export function createRenameProvider(
  projectIndex: ProjectIndex,
  onWorkspaceEdit?: (info: WorkspaceEditInfo) => void,
): Monaco.languages.RenameProvider {
  return {
    provideRenameEdits: (model, position, newName) => {
      const filePath = model.uri.path.substring(1) // Remove leading slash
      const symbol = projectIndex.findSymbolAt(filePath, position.lineNumber, position.column)

      if (!symbol) return undefined

      const occurrences = projectIndex.findAllOccurrences(symbol.name, symbol.type)
      const edits: Monaco.languages.IWorkspaceTextEdit[] = occurrences.map((occ) => ({
        resource: model.uri.with({ path: `/${occ.filePath}` }),
        versionId: undefined,
        textEdit: {
          range: {
            startLineNumber: occ.line,
            startColumn: occ.column,
            endLineNumber: occ.line,
            endColumn: occ.column + occ.length,
          },
          text: newName,
        },
      }))

      if (onWorkspaceEdit && edits.length > 0) {
        onWorkspaceEdit({
          edits: edits.map((e) => ({
            file: (e as Monaco.languages.IWorkspaceTextEdit).resource.path.substring(1),
            range: (e as Monaco.languages.IWorkspaceTextEdit).textEdit.range,
            newText: (e as Monaco.languages.IWorkspaceTextEdit).textEdit.text,
          })),
        })
      }

      return { edits }
    },
    resolveRenameLocation: (model, position) => {
      const filePath = model.uri.path.substring(1)
      const symbol = projectIndex.findSymbolAt(filePath, position.lineNumber, position.column)

      if (!symbol) {
        return Promise.reject('You cannot rename this element.')
      }

      // Find the exact occurrence to get its column
      const occurrences = projectIndex.findAllOccurrences(symbol.name, symbol.type)
      const thisOcc = occurrences.find(
        (o) =>
          o.filePath === filePath &&
          o.line === position.lineNumber &&
          position.column >= o.column &&
          position.column <= o.column + o.length,
      )

      return {
        range: {
          startLineNumber: position.lineNumber,
          startColumn: thisOcc ? thisOcc.column : position.column,
          endLineNumber: position.lineNumber,
          endColumn: thisOcc ? thisOcc.column + thisOcc.length : position.column,
        },
        text: symbol.name,
      }
    },
  }
}
