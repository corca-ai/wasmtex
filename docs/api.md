# API Reference

Entry-point index and reference for the browser `WasmTex` component. Its compile
engine is pdfLaTeX; use the [headless compiler API](compiler-api.md) for multi-engine
compilation. Separate references cover [language features](language-api.md), [syntax snapshots](syntax-api.md) and [SyncTeX](synctex-api.md).

For a running example, follow [browser setup](howto.md). On this page: [options](#options), [methods](#methods), [events](#events) and [viewer controls](#pdfviewer-api).

## Entry Points

| Import | Purpose |
|--------|---------|
| `wasmtex` | Full editor + PDF preview SDK. |
| `wasmtex/headless` | DOM-free compiler API. No Monaco or PDF.js runtime imports. |
| `wasmtex/node` | Node (server) entry. `installNodeWorkerHost` + the headless compiler, to run the same engine under `worker_threads`. |
| `wasmtex/lsp` | Monaco-free LaTeX language service core. |
| `wasmtex/lsp/monaco` | Monaco provider adapter for the language service. |
| `wasmtex/lsp/server` | Transport-agnostic JSON-RPC language server. |
| `wasmtex/warmup` | Dependency-light preload and learned dependency-set helpers. |
| `wasmtex/syntax` | Stable, versioned syntax snapshots shared by language and semantic services. |
| `wasmtex/synctex` | SyncTeX parser + PDF↔source mapping (`SynctexParser`, `TextMapper`). |
| `wasmtex/style.css` | Optional built-in UI/viewer styles. |

<a id="node-host-installation"></a>
The [Node host installation contract](compiler-api.md#node-host-installation)
explains global ownership and disposal.

## Constructor

```typescript
new WasmTex(
  editorContainer: HTMLElement | string,
  previewContainer: HTMLElement | string,
  options?: WasmTexOptions,
)
```

## Styling

`WasmTex` does not inject its stylesheet from the JavaScript entry.
When you use built-in editor/viewer containers (preview panel, binary overlays, loading bar, controls), import:

```ts
import 'wasmtex/style.css'
```

### Split-container mode

Pass both an editor container and a preview container to render the editor (Monaco)
and the PDF viewer in any layout you want. Each container can be an `HTMLElement`
or a CSS selector string.

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `editor` | `IStandaloneCodeEditor` | - | External Monaco editor instance. WasmTex will use it instead of creating one and will **not** dispose it on cleanup. |
| `engine` | `'auto' \| 'pdflatex' \| 'xelatex' \| 'lualatex'` | `'auto'` | TeX engine. `'auto'` detects it from the main file — a `% !TEX program = …` magic comment, or `fontspec`/`unicode-math`/CJK (`xeCJK`)/`\directlua` in the preamble — falling back to pdfLaTeX. The component reports an actionable error for Unicode engines; use [headless](headless.md#engine-selection-xelatex--cjk) to compile them. |
| `texliveVersion` | `'2025' \| '2026'` | `'2025'` | Exact TeX Live engine/assets year. The selected year namespaces engine files, formats, caches, and mirror requests together. |
| `texliveUrl` | `string` | Immutable R2 snapshot for the selected year | Exact profile mirror endpoint. A 2026 engine must receive a 2026 mirror URL and matching completion profile. |
| `resourceCatalog` | `TexResourceCatalogProvider` | - | Exact completion catalog for the selected compile profile. Custom `texliveUrl` hosts should inject their matching provider; without one, resource completion is project-local only. |
| `semanticCatalog` | `TexSemanticCatalogProvider` | - | Versioned class/package options, key families, and typed command/environment metadata for the same compile profile. |
| `completionProfile` | `{ id: string; mirrorRevision: string \| null }` | derived | Stable identity attached to compile-observed completion snapshots. Catalog-backed hosts should use the catalog's exact mirror revision. |
| `mainFile` | `string` | `'main.tex'` | Main TeX file name |
| `files` | `Record<string, string \| Uint8Array>` | bundled sample project | Initial project files (path → content). Pass `{}` to start empty. |
| `serviceWorker`| `boolean`| `true` | Cache texlive packages via SW |
| `assetBaseUrl` | `string` | `auto` | Base URL for WASM/Worker assets |
| `skipFormatPreload` | `boolean` | `false` | Skip initial `.fmt` preload during engine bootstrap |
| `disablePreambleSnapshot` | `boolean` | `false` | Disable [precompiled preamble snapshots](engine.md#preamble-snapshots) and always run a full compile. Escape hatch for documents incompatible with preamble precompilation. |
| `incremental` | `boolean` | `false` | Enable [incremental compilation](compiler-api.md#incremental-compilation) in the interactive loop (pdfLaTeX only). A body edit after a page break re-typesets only the tail and splices it (PDF **and** SyncTeX) onto the cached head for an immediate, **exact** **fast paint** — no reconcile needed for a single-file `final` edit. The `status` event's `incremental` flag marks a fast paint. Falls back to a full compile for XeLaTeX/LuaLaTeX, preamble/early edits, and label/citation edits, and to a background reconcile when exact SyncTeX cannot be spliced (including a changed head). Opt-in. |
| `persistentCache` | `boolean` | `false` | Enable the [built-in persistent cache](engine.md#persistent-cache) (IndexedDB) of fetched TeX Live assets. Reuses cached resources on return visits; [offline prerequisites](warmup.md#persistent-cache) still apply. No-ops without IndexedDB. See `clearCache()`. |
| `persistentPreambleCache` | `boolean` | `false` | Persist [pdfLaTeX preamble snapshots](engine.md#durable-preamble-snapshots) in a bounded IndexedDB cache across compiler sessions. Requires `completionProfile.mirrorRevision`; otherwise reuse fails closed. |
| `editorContainerClassName` | `string` | `''` | Extra class name(s) for the editor container |
| `previewContainerClassName` | `string` | `''` | Extra class name(s) for the preview container |
| `runtimeScopeAttribute` | `string` | `data-wasmtex-runtime` | Attribute used to scope runtime UI styles |
| `collaboration` | `boolean` | `false` | Enable collaborative editing. When `true`, WasmTex never calls `model.setValue()` on Monaco models, leaving content ownership to an external CRDT/OT system (e.g. Yjs). Listen for `modelCreate`/`modelDispose` events to bind your provider. |
| `warmupCache` | `WarmupCache` | - | Pre-fetched TeX Live files from `warmup()`. Preloads the supplied file set; unresolved resources can still require blocking worker requests. See [Warmup](warmup.md). |
| `toolbar` | `boolean` | `true` | Show or hide the PDF viewer toolbar (zoom controls, page info, download button). Set to `false` to hide the toolbar entirely from initialization. |
| `lint` | `boolean \| Partial<LintConfig>` | `true` | [Static linter](language-api.md#static-linter-chktex-style) (ChkTeX-style). `false` disables it; an object overrides per-rule `enabled`/`severity`. |

## Standalone Functions

### `warmup(options?): Promise<WarmupCache>`

Pre-fetch TeX Live files needed for first compilation. Call as early as possible, then pass the result as `warmupCache` to the constructor.

```ts
import { warmup, WasmTex } from 'wasmtex'

const cache = warmup() // start immediately
const editor = new WasmTex('#editor', '#preview', { warmupCache: await cache })
```

See [Warmup](warmup.md) for full options and details.

### `clearTexliveCache(options?): Promise<void>`

Clear the [built-in persistent cache](engine.md#persistent-cache) (IndexedDB) of
TeX Live assets for a given TeX Live year (`options.version`, default `'2025'`).
No-op where IndexedDB is unavailable. Useful for a "clear cache" action without
an editor/compiler instance.

```ts
import { clearTexliveCache } from 'wasmtex'

await clearTexliveCache({ version: '2025' })
```

## Additional Exports

The `wasmtex` barrel also exports these helpers for advanced/host-driven setups.
Use the dedicated `headless`, `warmup`, `syntax` and `lsp` entries when you need
a runtime import boundary without Monaco/PDF.js; the root entry also exports the UI.

### Capability detection

| Export | Signature | Purpose |
|--------|-----------|---------|
| `wasmSimdSupported` | `(): boolean` | Whether the runtime supports WASM SIMD (used to gate a future SIMD engine build). |
| `isIndexedDbSupported` | `(): boolean` | Whether the persistent cache can be used in this environment. |

### Persistent cache

| Export | Purpose |
|--------|---------|
| `PersistentCache` | Class wrapping the IndexedDB cache of fetched TeX Live assets. |
| `PersistentCacheOptions` | Constructor options type (`version`, etc.). |
| `clearTexliveCache` | Standalone cache clear (documented above). |

See [Persistent cache](engine.md#persistent-cache).

### Bibliography backends

`biblatexLiteBackend`, `selectBiblatexBackend`, `generateBiblatexBbl`,
`detectBibliographyMode`, `detectBiblatexBackend`, `runRemoteBibliography`, the
`BIBTEX_STAGE` / `BIBER_STAGE` constants, and the types `BibliographyBackend`,
`BibliographyMode`, `BblInput`, `BibliographyStageRequest`. These let a host
generate a biblatex `.bbl` or route either typed bibliography stage to a server backend.
Full guide: **[Bibliography backends](bibliography.md)**.

### Per-stage backends

The toolkit behind the [`backends`](compiler-api.md#server-backends) option, also re-exported
from `wasmtex/headless`:

| Export | Purpose |
|--------|---------|
| `BackendRegistry` | Typed per-stage registry. `register(stage, backend)` checks the stage's request/response contract; unregistered stages keep the client default. |
| `ToolBackend` | A stage backend (`id`, required `stage`, `location: 'client' \| 'server'`, `run(request)`). |
| `createRemoteBackend` / `RemoteBackendOptions` | Build a **server** backend that POSTs a stage request to an integrator endpoint running the same engine. |
| `createJsonTextBackend` | `createRemoteBackend` specialized to a JSON request / text response (the shape every text-artifact stage shares). |
| `createBiberBackend` / `BiberRequest` / `BiberBackendOptions` | Server Biber backend for the `.bcf`-typed `BIBER_STAGE`. |
| `createMakeindexBackend` / `IndexStageRequest` / `MakeindexBackendOptions` | Server makeindex backend for the `index` stage (`.idx` → `.ind`). The client default needs no backend. |
| `createXindyBackend` / `XindyRequest` / `XindyBackendOptions` | Server xindy backend for the `index` stage (multilingual / complex indexing). |
| `detectIndexUse` / `runRemoteIndex` / `INDEX_STAGE` | Index-stage detection + registry routing (mirrors the bibliography seam). |
| `withCache` / `MemoryCacheStore` / `backendCacheKey` / `contentKey` / `CacheStore` | Wrap a backend with a shared cache namespaced by stage, backend id/version, options, and request content. |

See [Execution model](execution-model.md) for the client/server boundary.

### Linter

`lintSource(content, path, config?)`, `DEFAULT_LINT_CONFIG`, and the types
`LintConfig`, `LintRuleConfig`, `LintRuleId`. See [Static linter](language-api.md#static-linter-chktex-style)

## Methods

- `init(): Promise<void>` — Initializes the engine and runs the first compilation. Initialization failures are reported through `status: error` rather than rejecting this promise; inspect compile results for TeX errors.
- `loadProject(files: Record<string, string | Uint8Array>): void` — Replaces the entire project with new files.
- `saveProject(): Record<string, string | Uint8Array>` — Returns a snapshot of every project file (the inverse of `loadProject`); flushes the active editor buffer into the VFS first.
- `setFile(path: string, content: string | Uint8Array): void` — Adds or updates a single file.
- `getFile(path: string): string | Uint8Array | null` — Reads a file's content from the virtual filesystem.
- `openFile(path: string): void` — Opens a specific file in the editor.
- `getActiveFile(): string` — Returns the path of the file currently open in the editor.
- `deleteFile(path: string): boolean` — Deletes a file from the virtual filesystem.
- `createFolder(path: string): void` — Creates an empty folder (via a `.gitkeep` placeholder) — mainly for the built-in file-tree UI.
- `listFiles(): string[]` — Returns a list of all files in the project.
- `compile(): void` — Triggers an immediate compilation (bypassing the auto-compile debounce).
- `getPdf(): Uint8Array | null` — Returns the last successfully generated PDF.
- `getCompletionSnapshotState(): CompletionSnapshotState` — Returns the runtime completion snapshot state from the latest full compile.
- `revealLine(line: number, file?: string): void` — Navigates the editor to a specific line/file.
- `clearCache(): Promise<void>` — Clears the [persistent TeX Live cache](engine.md#persistent-cache) (IndexedDB) for the active TeX Live mirror namespace; use `clearTexliveCache({ version })` to clear every mirror for a year.
- `dispose(): void` — Cleans up the editor, workers, and DOM.

## Escape Hatches

These methods expose the underlying Monaco editor and PDF viewer for advanced use cases (custom keybindings, viewer manipulation, collaboration bindings, etc.).

- `getMonacoEditor(): IStandaloneCodeEditor` — Returns the raw Monaco editor instance.
- `getModel(path: string): ITextModel | undefined` — Returns the Monaco model for a project file. Useful for attaching external bindings (e.g. y-monaco).
- `getViewer(): PdfViewer | undefined` — Returns the built-in PDF viewer instance. See [PdfViewer API](#pdfviewer-api) below.

## Events

Use `editor.on(event, handler)` / `editor.off(event, handler)` to subscribe/unsubscribe.

| Event | Payload | Description |
|-------|---------|-------------|
| `compile` | `{ result: CompileResult }` | A compilation cycle finished. `result.telemetry` carries machine-readable diagnostics, geometry, and the dependency graph — see [Compile telemetry](compiler-api.md#compile-telemetry). |
| `status` | `{ status: string, message?: string, preambleSnapshot?: boolean, incremental?: boolean }` | Editor lifecycle state changed (e.g. `'compiling'`, `'ready'`, `'error'`). `message` provides human-readable progress text; `preambleSnapshot` is `true` when a cached `.fmt` was reused; `incremental` is `true` when a `'ready'` reflects an [incremental](compiler-api.md#incremental-compilation) fast paint (exact when SyncTeX was spliced; a background reconcile follows only when it couldn't be). Compile results also expose `preambleRebuilt` when the preamble `.fmt` cache was rebuilt. |
| `filechange` | `{ path: string, content: string \| Uint8Array }` | File content was modified. |
| `filesUpdate` | `{ files: string[] }` | Files were added or deleted. `files` is the full list of current paths. |
| `cursorChange` | `{ path: string, line: number, column: number }` | Cursor moved in the editor. |
| `diagnostics` | `{ diagnostics: TexError[] }` | LSP diagnostics (errors/warnings) were updated. A `TexError` may carry an optional `code` for machine-readable classification — e.g. `'missing-package'` when a `.sty`/`.cls` isn't on the bundled mirror — so a host can branch instead of matching the message string. |
| `outlineUpdate` | `{ sections: SectionDef[] }` | Document structure (sections/subsections) changed. |
| `modelCreate` | `{ path: string, model: ITextModel }` | A Monaco model was created for a project file. Use this to attach collaboration bindings. |
| `modelDispose` | `{ path: string }` | A Monaco model is about to be disposed. Use this to clean up collaboration bindings. |
| `fileOpen` | `{ path: string }` | The active file changed in the editor. Fired on `openFile()`, go-to-definition navigation, inverse search, and `loadProject()`. |
| `workspaceEdit` | `{ edits: Array<{ file, range, newText }> }` | A workspace-wide edit (e.g. rename) was applied across one or more files. |

### Example: forwarding diagnostics to an external panel

```ts
const editor = new WasmTex('#editor', '#preview')
editor.on('diagnostics', ({ diagnostics }) => {
  for (const d of diagnostics) {
    console.log(`[${d.severity}] line ${d.line}: ${d.message}`)
  }
  // render into your own UI…
  renderDiagnosticsPanel(diagnostics)
})
await editor.init()
```

## PdfViewer API

Accessed via `editor.getViewer()`. These methods let you control the PDF preview programmatically.

| Method | Description |
|--------|-------------|
| `setScale(scale: number): void` | Set the absolute zoom level (clamped to 0.25–5). |
| `fitToWidth(): void` | Zoom so the page fills the container width. |
| `setToolbarVisible(visible: boolean): void` | Show or hide the toolbar (zoom controls, page info, download button). The setting persists across re-renders. |
| `setInverseSearchHandler(handler): void` | Register a callback for inverse search (Ctrl/Cmd+click on PDF → source location). |
| `setSourceContent(file, content): void` | Provide source text for text-based inverse search fallback. |
| `setSynctexData(data): void` | Provide parsed SyncTeX data for precise PDF↔source sync. |
| `getLastPdf(): Uint8Array \| null` | Get the last rendered PDF bytes (for download). |
| `forwardSearch(file, line): void` | Highlight a source location in the PDF. |

### Example: fit-to-width + hide toolbar

```ts
const viewer = editor.getViewer()
if (viewer) {
  viewer.setToolbarVisible(false)
  viewer.fitToWidth()
}
```

## Collaboration

Enable `collaboration: true` and follow the [Yjs integration recipe](editor-integration.md#collaborative-editing-yjs).
Initial models are created during construction: bind existing models through
`listFiles()` / `getModel()`, then handle `modelCreate` and `modelDispose` for later changes.

<a id="example-yjs--y-monaco"></a>
The complete example is maintained in the recipe above.

## Moved reference sections

These anchors preserve existing bookmarks. Follow the links to the focused guides.

<a id="shared-syntax-lifecycle"></a>
See [Shared syntax lifecycle](syntax-api.md#shared-syntax-lifecycle) in its dedicated guide.

<a id="command-database--signatures"></a>
See [Command database & signatures](language-api.md#command-database--signatures) in its dedicated guide.

<a id="headless-compiler"></a>
<a id="wasmtexcompileroptions"></a>
<a id="server-backends"></a>
<a id="incremental-compilation"></a>
<a id="heap-checkpoints-arbitrary-line-incremental-compilation"></a>
<a id="accessible-export-tagged-pdf--pdf-ua"></a>
<a id="tikz-figure-externalization"></a>
<a id="wasmtexcompiler-methods"></a>
<a id="headless-operation-lifetime"></a>
<a id="compile-phase-timings"></a>
<a id="compile-telemetry"></a>
<a id="safe-host-side-invalidation"></a>
See [Headless Compiler](compiler-api.md#headless-compiler) in its dedicated guide.

<a id="lsp-core"></a>
<a id="latexlanguageservice-methods"></a>
<a id="exact-tex-live-resource-completion"></a>
<a id="runtime-completion-snapshots"></a>
<a id="static-linter-chktex-style"></a>
<a id="monaco-adapter"></a>
<a id="standalone-lsp-server"></a>
See [LSP Core](language-api.md#lsp-core) in its dedicated guide.

<a id="synctex-wasmtexsynctex"></a>
See [SyncTeX](synctex-api.md#synctex-wasmtexsynctex) in its dedicated guide.
