import { Diagnostic } from '../lsp/diagnostic-provider';
import { TexError } from '../types';
import type * as Monaco from 'monaco-editor';
/** Minimal model surface needed to build a marker (line count + per-line max column).
 *  Lets {@link errorToMarker} be unit-tested without the live `monaco.editor` global. */
export interface MarkerModel {
    getLineCount(): number;
    getLineMaxColumn(line: number): number;
}
/** Build a single Monaco marker for a TeX compile error. Pure: depends only on the error
 *  and a minimal model surface, so it can be tested directly. */
export declare function errorToMarker(e: TexError, model: MarkerModel): Monaco.editor.IMarkerData;
/** Update Monaco editor markers from TeX compile errors, routed to each of `models`. */
export declare function setErrorMarkers(errors: TexError[], models: Iterable<Monaco.editor.ITextModel>): void;
/** Update Monaco markers from static analysis diagnostics, routed to each of `models`. */
export declare function setDiagnosticMarkers(diagnostics: Diagnostic[], models: Iterable<Monaco.editor.ITextModel>): void;
