// --- WasmTex component (UI) API ---
//
// These types belong to the `WasmTex` browser component (src/wasmtex.ts), NOT the
// headless core. They live outside `types.ts` so the headless core (engine/lsp/fs and
// the wasmtex/headless + wasmtex/lsp entries) carries zero monaco-editor / UI
// coupling — enforced by the headless-boundary guard test (execution-model principle 4).

import type { AppStatus, CompileResult, TexError, TexliveVersion, WarmupCache } from './types'

export interface WasmTexOptions {
  /** External Monaco editor instance. WasmTex will use it instead of creating one.
   *  WasmTex will NOT dispose this editor on cleanup. */
  editor?: import('monaco-editor').editor.IStandaloneCodeEditor
  /** TeX Live version to use. Defaults to '2025'. */
  texliveVersion?: TexliveVersion
  /** TexLive server endpoint URL. Defaults to auto-detected from BASE_URL. */
  texliveUrl?: string
  /** Main TeX file name. Defaults to 'main.tex'. */
  mainFile?: string
  /** Initial project files. Keys are file paths, values are content. */
  files?: Record<string, string | Uint8Array>
  /** Register a service worker for texlive package caching. Defaults to true. */
  serviceWorker?: boolean
  /** Base URL for WASM/static assets. Defaults to `import.meta.env.BASE_URL`. */
  assetBaseUrl?: string
  /** If true, do not attempt to preload the base .fmt file from the server. */
  skipFormatPreload?: boolean
  /** If true, disable precompiled preamble snapshots and always run a full
   *  compile. An escape hatch for documents incompatible with preamble
   *  precompilation. Defaults to false (snapshots enabled). */
  disablePreambleSnapshot?: boolean
  /** Enable incremental compilation in the interactive loop (#99, pdfLaTeX only).
   *  A body edit after a page break re-typesets only the tail and splices it (PDF **and**
   *  SyncTeX) onto the cached head for an immediate, exact "fast paint" — for a `final` edit
   *  that's the final result, no background reconcile needed. Multi-file `\include` documents
   *  are handled: each chapter splices at its own file-relative lines. Speculatively
   *  pre-builds the checkpoint near the cursor so the first edit is fast too. Opt-in; defaults
   *  to false. Falls back to a full compile for XeLaTeX/LuaLaTeX, preamble edits, edits before
   *  the first page break, label/citation edits, and documents with a table of contents /
   *  bibliography / list-of / index (which the isolated checkpoint compile can't reproduce). */
  incremental?: boolean
  /** Enable the built-in persistent (IndexedDB) cache of fetched TeX Live assets.
   *  Return visits become near-instant and work offline. Silently no-ops where
   *  IndexedDB is unavailable. Defaults to false. See `clearCache()`. */
  persistentCache?: boolean
  /** Optional class name(s) to add to the editor container. */
  editorContainerClassName?: string
  /** Optional class name(s) to add to the preview container. */
  previewContainerClassName?: string
  /** Attribute used to scope runtime styles. Defaults to `data-wasmtex-runtime`. */
  runtimeScopeAttribute?: string
  /** Enable collaborative editing mode.
   *  When true, WasmTex will never call `model.setValue()` on Monaco models,
   *  leaving content ownership to an external CRDT / OT system (e.g. Yjs).
   *  Listen for `modelCreate` / `modelDispose` events to bind your collaboration
   *  provider to each model. */
  collaboration?: boolean
  /** Pre-fetched TeX Live files from `warmup()`. Eliminates sync XHR during first compile. */
  warmupCache?: WarmupCache
  /** Show or hide the PDF viewer toolbar (zoom, page info, download).
   *  Defaults to `true`. Set to `false` to hide the toolbar entirely. */
  toolbar?: boolean
  /** Static linter (ChkTeX-style style/correctness warnings). `false` disables
   *  it; an object overrides per-rule enabled/severity. Defaults to on. */
  lint?: boolean | import('./lsp/linter').LintConfig | Partial<import('./lsp/linter').LintConfig>
  /** Which TeX engine to use. `'auto'` (default) detects the engine from the main
   *  file (a `% !TEX program` comment, or fontspec/unicode-math/CJK/lua packages),
   *  falling back to pdfLaTeX. A document that needs XeLaTeX/LuaLaTeX is reported
   *  with an actionable error until those engine artifacts ship. Set an explicit
   *  engine to override detection. */
  engine?: import('./engine/engine-select').EngineOption
}

export interface WasmTexStatusEvent {
  /** Normalized editor lifecycle status. */
  status: AppStatus
  /** Human-readable status text. */
  message?: string
  /** True when the engine reused a cached `.fmt` preamble this cycle. */
  preambleSnapshot?: boolean
  /** True when this `ready` reflects an incremental *fast paint* (#99) — a checkpoint-spliced
   *  preview. For a `final` edit (single- or multi-file) its SyncTeX is spliced exact and it IS
   *  the final result; otherwise a background full reconcile follows. Absent/false on a full compile. */
  incremental?: boolean
}

export interface WasmTexEventMap {
  /** Triggered when a compilation finishes */
  compile: { result: CompileResult }
  /** Triggered when file content changes */
  filechange: { path: string; content: string | Uint8Array }
  /** Triggered when editor status changes */
  status: WasmTexStatusEvent
  /** Triggered when the set of files in the project changes (created/deleted) */
  filesUpdate: { files: string[] }
  /** Triggered when the document outline (sections) is updated */
  outlineUpdate: { sections: import('./lsp/types').SectionDef[] }
  /** Triggered when cursor position changes */
  cursorChange: { path: string; line: number; column: number }
  /** Triggered when LSP diagnostics (errors/warnings) are updated */
  diagnostics: { diagnostics: TexError[] }
  /** Triggered when a Monaco model is created for a project file.
   *  Use this to attach collaborative bindings (e.g. y-monaco). */
  modelCreate: { path: string; model: import('monaco-editor').editor.ITextModel }
  /** Triggered just before a Monaco model is disposed.
   *  Use this to clean up collaborative bindings. */
  modelDispose: { path: string }
  /** Triggered when the active file changes in the editor (via openFile, go-to-definition, etc.). */
  fileOpen: { path: string }
  /** Triggered when a workspace-wide edit (e.g. rename) is applied across files. */
  workspaceEdit: {
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
}
