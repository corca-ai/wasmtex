import type * as Monaco from 'monaco-editor'
import * as monaco from 'monaco-editor'
import type { Diagnostic } from '../lsp/diagnostic-provider'
import type { TexError } from '../types'
import { clampMarkerRange } from './marker-range'

/** Group items by file, then set markers on each of THIS instance's models. Iterating the
 *  caller's own models (not the process-global `monaco.editor.getModels()`) keeps a compile
 *  /diagnostics pass from clearing a sibling WasmTex instance's markers for files it does
 *  not own — the empty-list-clears semantics would otherwise wipe them under the shared owner. */
function applyMarkers<T>(
  items: T[],
  getFile: (item: T) => string | undefined,
  owner: string,
  models: Iterable<Monaco.editor.ITextModel>,
  toMarker: (item: T, model: Monaco.editor.ITextModel) => Monaco.editor.IMarkerData,
): void {
  const byFile = new Map<string, T[]>()
  for (const item of items) {
    const file = getFile(item)
    if (!file) continue
    const list = byFile.get(file) ?? []
    list.push(item)
    byFile.set(file, list)
  }

  for (const model of models) {
    const filePath = model.uri.path.startsWith('/') ? model.uri.path.slice(1) : model.uri.path
    const fileItems = byFile.get(filePath) ?? []
    const markers = fileItems.map((item) => toMarker(item, model))
    monaco.editor.setModelMarkers(model, owner, markers)
  }
}

/** Minimal model surface needed to build a marker (line count + per-line max column).
 *  Lets {@link errorToMarker} be unit-tested without the live `monaco.editor` global. */
export interface MarkerModel {
  getLineCount(): number
  getLineMaxColumn(line: number): number
}

/** Build a single Monaco marker for a TeX compile error. Pure: depends only on the error
 *  and a minimal model surface, so it can be tested directly. */
export function errorToMarker(e: TexError, model: MarkerModel): Monaco.editor.IMarkerData {
  return {
    severity: e.severity === 'error' ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
    // Whole-line highlight (col 1 → line end), clamped to a valid range via the same
    // helper as the diagnostics path.
    ...clampMarkerRange(e.line, 1, Number.POSITIVE_INFINITY, model.getLineCount(), (l) =>
      model.getLineMaxColumn(l),
    ),
    message: e.message,
    source: 'TeX',
    // Propagate the machine-readable classification (e.g. 'missing-package') so a host
    // reading getModelMarkers() can branch on marker.code, mirroring setDiagnosticMarkers.
    // Only when present, to avoid an explicit `code: undefined` on generic errors.
    ...(e.code ? { code: e.code } : {}),
  }
}

/** Update Monaco editor markers from TeX compile errors, routed to each of `models`. */
export function setErrorMarkers(
  errors: TexError[],
  models: Iterable<Monaco.editor.ITextModel>,
): void {
  applyMarkers(
    errors,
    (e) => (e.file && e.line > 0 ? e.file : undefined),
    'tex',
    models,
    (e, model) => errorToMarker(e, model),
  )
}

const DIAG_SEVERITY: Record<Diagnostic['severity'], Monaco.MarkerSeverity> = {
  error: monaco.MarkerSeverity.Error,
  warning: monaco.MarkerSeverity.Warning,
  info: monaco.MarkerSeverity.Info,
}

/** Update Monaco markers from static analysis diagnostics, routed to each of `models`. */
export function setDiagnosticMarkers(
  diagnostics: Diagnostic[],
  models: Iterable<Monaco.editor.ITextModel>,
): void {
  applyMarkers(
    diagnostics,
    (d) => d.file,
    'latex-diagnostics',
    models,
    (d, model) => ({
      severity: DIAG_SEVERITY[d.severity],
      // Clamp into a valid, non-inverted range — a stale diagnostic can point past the
      // current (shorter) document, and an unclamped startColumn would exceed endColumn.
      ...clampMarkerRange(d.line, d.column, d.endColumn, model.getLineCount(), (l) =>
        model.getLineMaxColumn(l),
      ),
      message: d.message,
      source: 'LaTeX',
      code: d.code,
    }),
  )
}
