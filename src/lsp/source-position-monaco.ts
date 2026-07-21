import * as monaco from 'monaco-editor'
import type { NeutralLocation } from './protocol'
import type { SourceLocation } from './types'

/** Convert a SourceLocation to a Monaco Location (uri + range).
 *  Monaco-only — kept out of `latex-patterns.ts` so the pure parser (and the headless
 *  core that uses it) carries no `monaco-editor` dependency (#108 boundary). */
export function sourceLocationToMonaco(loc: SourceLocation): monaco.languages.Location {
  const path = loc.file.startsWith('/') ? loc.file : `/${loc.file}`
  const uri = monaco.Uri.file(path)
  return {
    uri,
    range: new monaco.Range(loc.line, loc.column, loc.line, loc.column),
  }
}

/** Convert an editor-neutral {@link NeutralLocation} (file + range) to a Monaco Location,
 *  so Monaco adapters can delegate to the neutral provider cores without re-implementing
 *  their logic. */
export function neutralLocationToMonaco(loc: NeutralLocation): monaco.languages.Location {
  const path = loc.file.startsWith('/') ? loc.file : `/${loc.file}`
  return {
    uri: monaco.Uri.file(path),
    range: new monaco.Range(
      loc.range.startLine,
      loc.range.startColumn,
      loc.range.endLine,
      loc.range.endColumn,
    ),
  }
}
