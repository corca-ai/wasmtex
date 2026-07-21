import type * as monaco from 'monaco-editor'
import { modelToDoc } from './monaco-doc'
import { provideReferences } from './neutral-providers'
import type { ProjectIndex } from './project-index'
import { neutralLocationToMonaco } from './source-position-monaco'

/** Monaco find-all-references adapter over the editor-neutral {@link provideReferences}.
 *  Delegating (rather than re-implementing the `\label`/`\ref` matching) keeps a single
 *  source of truth — the two used to drift, which is how the label-trim bug crept in. */
export function createReferenceProvider(index: ProjectIndex): monaco.languages.ReferenceProvider {
  return {
    provideReferences(
      model: monaco.editor.ITextModel,
      position: monaco.Position,
    ): monaco.languages.Location[] {
      return provideReferences(
        modelToDoc(model),
        { line: position.lineNumber, column: position.column },
        index,
      ).map(neutralLocationToMonaco)
    },
  }
}
