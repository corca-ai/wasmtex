import * as monaco from 'monaco-editor'
import { modelToDoc } from './monaco-doc'
import { provideHover } from './neutral-providers'
import type { ProjectIndex } from './project-index'

/** Monaco hover adapter over the editor-neutral {@link provideHover}. */
export function createHoverProvider(index: ProjectIndex): monaco.languages.HoverProvider {
  return {
    provideHover(model, position): monaco.languages.Hover | null {
      const hover = provideHover(
        modelToDoc(model),
        { line: position.lineNumber, column: position.column },
        index,
      )
      if (!hover) return null
      return {
        contents: hover.contents.map((value) => ({ value })),
        range: new monaco.Range(
          hover.range.startLine,
          hover.range.startColumn,
          hover.range.endLine,
          hover.range.endColumn,
        ),
      }
    },
  }
}
