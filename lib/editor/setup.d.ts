import * as monaco from 'monaco-editor';
/** Register LaTeX and BibTeX languages with Monaco. Safe to call multiple times.
 *  Exported so that host apps using an external editor can register syntax
 *  highlighting before creating their own Monaco instance. */
export declare function ensureLanguagesRegistered(): void;
/** Create a Monaco text model for a project file.
 *
 *  `overwriteOnReuse` controls what happens when a model for this URI already
 *  exists in Monaco's global registry (e.g. a second WasmTex instance, or a
 *  re-create after an incomplete teardown): when true (default) the existing
 *  model's content is synced via `setValue`; when false the existing model is
 *  returned untouched. Pass false under collaboration so an external CRDT binding
 *  stays the single source of truth (WasmTex never calls `setValue` then). */
export declare function createFileModel(content: string, filePath: string, overwriteOnReuse?: boolean): monaco.editor.ITextModel;
/** Create the Monaco editor instance with an existing model. */
export declare function createEditor(container: HTMLElement, model: monaco.editor.ITextModel): monaco.editor.IStandaloneCodeEditor;
export declare function revealLine(editor: monaco.editor.IStandaloneCodeEditor, line: number): void;
