# API Reference

Full reference for the `WasmTex` SDK.

## Entry Points

| Import | Purpose |
|--------|---------|
| `wasmtex` | Full editor + PDF preview SDK. |
| `wasmtex/headless` | DOM-free compiler API. No Monaco or PDF.js runtime imports. |
| `wasmtex/node` | Node (server) entry. `installNodeWorkerHost` + the headless compiler, to run the same engine under `worker_threads`. |
| `wasmtex/lsp` | Monaco-free LaTeX language service core. |
| `wasmtex/lsp/monaco` | Monaco provider adapter for the language service. |
| `wasmtex/lsp/server` | Transport-agnostic JSON-RPC language server. |
| `wasmtex/synctex` | SyncTeX parser + PDF↔source mapping (`SynctexParser`, `TextMapper`). |
| `wasmtex/style.css` | Optional built-in UI/viewer styles. |

## Constructor

```typescript
new WasmTex(
  editorContainer: HTMLElement | string,
  previewContainer: HTMLElement | string,
  options?: WasmTexOptions,
)
```

## Styling

`WasmTex` does not inject the optional "batteries-included" stylesheet from the JS entrypoint anymore.
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
| `engine` | `'auto' \| 'pdflatex' \| 'xelatex' \| 'lualatex'` | `'auto'` | TeX engine. `'auto'` detects it from the main file — a `% !TEX program = …` magic comment, or `fontspec`/`unicode-math`/CJK (`xeCJK`)/`\directlua` in the preamble — falling back to pdfLaTeX. See [Multi-engine support](engine.md#multi-engine-support-xelatex--lualatex). |
| `texliveVersion` | `'2025'` | `'2025'` | TeX Live engine/assets version. The option remains versioned for future TeX Live releases. |
| `texliveUrl` | `string` | Public CDN | TexLive server endpoint. Defaults to `https://d1jectpaw0dlvl.cloudfront.net/{version}/` |
| `mainFile` | `string` | `'main.tex'` | Main TeX file name |
| `files` | `Record<string, string \| Uint8Array>` | `{}` | Initial project files (path → content) |
| `serviceWorker`| `boolean`| `true` | Cache texlive packages via SW |
| `assetBaseUrl` | `string` | `auto` | Base URL for WASM/Worker assets |
| `skipFormatPreload` | `boolean` | `false` | Skip initial `.fmt` preload during engine bootstrap |
| `disablePreambleSnapshot` | `boolean` | `false` | Disable [precompiled preamble snapshots](engine.md#preamble-snapshots) and always run a full compile. Escape hatch for documents incompatible with preamble precompilation. |
| `incremental` | `boolean` | `false` | Enable [incremental compilation](#incremental-compilation) in the interactive loop (pdfLaTeX only). A body edit after a page break re-typesets only the tail and splices it (PDF **and** SyncTeX) onto the cached head for an immediate, **exact** **fast paint** — no reconcile needed for a single-file `final` edit. The `status` event's `incremental` flag marks a fast paint. Falls back to a full compile for XeLaTeX/LuaLaTeX, preamble/early edits, and label/citation edits, and to a background reconcile for multi-file tails. Opt-in. |
| `persistentCache` | `boolean` | `false` | Enable the [built-in persistent cache](engine.md#persistent-cache) (IndexedDB) of fetched TeX Live assets. Near-instant return visits, works offline. No-ops without IndexedDB. See `clearCache()`. |
| `editorContainerClassName` | `string` | `''` | Extra class name(s) for the editor container |
| `previewContainerClassName` | `string` | `''` | Extra class name(s) for the preview container |
| `runtimeScopeAttribute` | `string` | `data-wasmtex-runtime` | Attribute used to scope runtime UI styles |
| `collaboration` | `boolean` | `false` | Enable collaborative editing. When `true`, WasmTex never calls `model.setValue()` on Monaco models, leaving content ownership to an external CRDT/OT system (e.g. Yjs). Listen for `modelCreate`/`modelDispose` events to bind your provider. |
| `warmupCache` | `WarmupCache` | - | Pre-fetched TeX Live files from `warmup()`. Eliminates blocking sync XHR during first compilation. See [Warmup](warmup.md). |
| `toolbar` | `boolean` | `true` | Show or hide the PDF viewer toolbar (zoom controls, page info, download button). Set to `false` to hide the toolbar entirely from initialization. |
| `lint` | `boolean \| Partial<LintConfig>` | `true` | [Static linter](#static-linter-chktex-style) (ChkTeX-style). `false` disables it; an object overrides per-rule `enabled`/`severity`. |

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
All are tree-shakeable and free of editor/viewer dependencies.

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
`BIBLIOGRAPHY_STAGE` constant, and the types `BibliographyBackend`,
`BibliographyMode`, `BblInput`, `BibliographyStageRequest`. These let a host
generate a biblatex `.bbl` or route the bibliography stage to a server backend.
Full guide: **[Bibliography backends](bibliography.md)**.

### Per-stage backends

The toolkit behind the [`backends`](#server-backends) option, also re-exported
from `wasmtex/headless`:

| Export | Purpose |
|--------|---------|
| `BackendRegistry` | Per-stage registry. `register(stage, backend)` overrides a stage; unregistered stages keep the client default. |
| `ToolBackend` | A stage backend (`id`, `location: 'client' \| 'server'`, `run(request)`). |
| `createRemoteBackend` / `RemoteBackendOptions` | Build a **server** backend that POSTs a stage request to an integrator endpoint running the same engine. |
| `createJsonTextBackend` | `createRemoteBackend` specialized to a JSON request / text response (the shape every text-artifact stage shares). |
| `createBiberBackend` / `BiberRequest` / `BiberBackendOptions` | Server Biber backend for the `bibliography` stage. |
| `createMakeindexBackend` / `IndexStageRequest` / `MakeindexBackendOptions` | Server makeindex backend for the `index` stage (`.idx` → `.ind`). The client default needs no backend. |
| `createXindyBackend` / `XindyRequest` / `XindyBackendOptions` | Server xindy backend for the `index` stage (multilingual / complex indexing). |
| `detectIndexUse` / `runRemoteIndex` / `INDEX_STAGE` | Index-stage detection + registry routing (mirrors the bibliography seam). |
| `withCache` / `MemoryCacheStore` / `contentKey` / `CacheStore` | Wrap a backend with the shared content-addressed cache. |

See [Execution model](execution-model.md) for the client/server boundary.

### Command database & signatures

For hosts building their own completion/hover UI on top of `wasmtex/lsp`:

| Export | Purpose |
|--------|---------|
| `getCommandSignature` / `parseSignature` / `formatSignature` | Resolve and render a command's argument signature. |
| `getCommandPackage` | The source `\usepackage` a command belongs to. |
| `registerShard` | Register an extra package-command shard with the DB. |
| `PackageShardLoader` / `ShardStore` / `PackageShardLoaderOptions` / `PackageShard` | On-demand per-package shard fetching + pluggable cache store. |
| `CommandArg` | Argument descriptor type. |

### Linter

`lintSource(content, path, config?)`, `DEFAULT_LINT_CONFIG`, and the types
`LintConfig`, `LintRuleConfig`, `LintRuleId`. See
[Static linter](#static-linter-chktex-style).

## Headless Compiler

Use `wasmtex/headless` when your app owns the editor, collaboration layer, and PDF rendering.

```ts
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: 'https://cdn.example.com/',
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}',
  },
})

await compiler.init()
const result = await compiler.compile()
```

### `WasmTexCompilerOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `files` | `Record<string, string \| Uint8Array>` | `{}` | Initial project files. |
| `mainFile` | `string` | `'main.tex'` | Main TeX file. |
| `engine` | `'auto' \| 'pdflatex' \| 'xelatex' \| 'lualatex'` | `'auto'` | TeX engine; `'auto'` detects from the main file. See [Multi-engine support](engine.md#multi-engine-support-xelatex--lualatex). |
| `texliveVersion` | `'2025'` | `'2025'` | TeX Live engine/assets version. The option remains versioned for future TeX Live releases. |
| `texliveUrl` | `string` | Public CDN | TeX Live package endpoint. |
| `assetBaseUrl` | `string` | `'/'` | Base URL for WasmTex WASM assets (`wasmtex/...`). |
| `skipFormatPreload` | `boolean` | `false` | Skip `.fmt` preload during engine bootstrap. |
| `disablePreambleSnapshot` | `boolean` | `false` | Disable [precompiled preamble snapshots](engine.md#preamble-snapshots) and always run a full compile. |
| `persistentCache` | `boolean` | `false` | Enable the [built-in persistent cache](engine.md#persistent-cache) (IndexedDB) of fetched TeX Live assets. No-ops without IndexedDB. |
| `warmupCache` | `WarmupCache` | - | Pre-fetched TeX Live files from `warmup()`. |
| `incremental` | `boolean` | `false` | Enable [incremental compilation](#incremental-compilation) via mid-document checkpoints (pdfLaTeX only). |
| `backends` | `BackendRegistry` | - | Per-stage backend registry. Every stage defaults to client/local (nothing leaves the device); register a **server** backend for a stage to offload it. Today the headless compiler routes the `bibliography` stage through the registry — a registered server backend turns `{aux, bibFiles} → .bbl` and the client BibTeX (WASM) engine is skipped. See [Server backends](#server-backends). |

#### Server backends

`backends` lets a headless/server integrator move a compile stage off the
device. Construct a [`BackendRegistry`](#per-stage-backends) and register a
**server** backend for a stage — the default for every unregistered stage stays
client/local. The compiler currently resolves the `bibliography` stage
(`BIBLIOGRAPHY_STAGE`) through it; a server backend receives a
`BibliographyStageRequest` (`{ aux, bibFiles }`) and returns the `.bbl`.

```ts
import { WasmTexCompiler, BackendRegistry, createBiberBackend } from 'wasmtex/headless'

const backends = new BackendRegistry()
backends.register('bibliography', createBiberBackend({ endpoint: 'https://my-host/biber' }))

const compiler = new WasmTexCompiler({ files, backends })
await compiler.init()
await compiler.compile() // bibliography runs on your endpoint; client BibTeX is skipped
```

`createBiberBackend` (biblatex/Biber → `.bbl`), `createMakeindexBackend` and
`createXindyBackend` (the `index` stage, `.idx` → `.ind`) build server backends
over the same endpoint contract; `createRemoteBackend` / `createJsonTextBackend`
build one for any custom stage. Wrap any backend with `withCache` for the shared
content-addressed cache.

> **Wired today:** the compiler auto-routes the `bibliography` and `index` stages.
> `\printindex` runs client-side via the bundled makeindex WASM by default; a backend
> registered for `index` (`createMakeindexBackend` / `createXindyBackend`) offloads it.
> See the [execution model](execution-model.md#how-a-consumer-chooses-the-boundary).

#### Incremental compilation

With `incremental: true`, a body edit **after a page break** (`\clearpage`/`\newpage`) re-typesets only the *tail* of the document — booting the engine from a cached checkpoint at the latest page break before the change and splicing the new tail pages onto a cached head PDF (#55). On long documents this turns a multi-second recompile into a ~200 ms one (≈3–5× and climbing with length).

- **pdfLaTeX only** — XeLaTeX/LuaLaTeX always do a full compile.
- **Optional peer dependency**: splicing uses [`pdf-lib`](https://www.npmjs.com/package/pdf-lib). If it isn't installed, incremental silently falls back to a full compile.
- **Automatic fallback** to a full compile when the preamble changed, there's no page break before the edit, or the edit touches labels/sectioning (so cross-references stay correct — LaTeX's usual two-pass reconcile still applies).
- Transparent: `compile()` returns the same `CompileResult`; no API change beyond the option.

The **editor** `WasmTex({ incremental: true })` wires this into the interactive loop (#99): a
servable edit renders its checkpoint splice immediately as a **fast paint**. The tail's SyncTeX is
**spliced** onto the last full compile's head (page + source-line + input-tag offsets), so the fast
paint carries **exact** SyncTeX — click-to-source works immediately and, because the edit is `final`
(cross-references unchanged) and the head is unchanged, **no background reconcile is needed** (a real
throughput win, not just latency hiding). The `status` event carries `incremental: true` on such a
fast paint. It also **speculatively pre-builds** the checkpoint near the cursor while the loop is idle,
so the first edit is fast too. Same fallbacks as above; label/citation edits skip the fast paint and go
straight to a full compile (no stale-reference flash). The SyncTeX splice covers single-file documents;
a multi-file tail (`\include`/`\input` of chapters), or a head that changed since the last full compile,
falls back to a background full reconcile that refreshes SyncTeX + cross-references.

### `WasmTexCompiler` Methods

- `init(): Promise<void>`
- `compile(): Promise<CompileResult>`
- `setFile(path, content): void`
- `loadProject(files): Promise<void>`
- `getFile(path): string | Uint8Array | null`
- `listFiles(): string[]`
- `getMainFile(): string`
- `setMainFile(path): void`
- `getProjectIndex(): ProjectIndex` — escape hatch to the shared symbol index (labels, citations, commands) for host-built tooling.
- `readOutput(path): Promise<string | null>` — reads generated files such as `main.log`, `main.aux`, or `main.bbl`.
- `flushCache(): Promise<void>`
- `clearCache(): Promise<void>` — clears the [persistent TeX Live cache](engine.md#persistent-cache) (IndexedDB) for the active TeX Live year.
- `dispose(): void`

### Compile telemetry

`CompileResult.telemetry` is a machine-readable description of a compile — branch on stable fields instead of scraping the log. It's headless **data only**; the host decides how to surface it (problem panel, preview overlay, cache layer). The legacy `errors` / `glyphCoverage` fields remain for back-compat; telemetry is their superset.

```ts
const { telemetry } = await compiler.compile()
```

| Field | Type | Description |
|-------|------|-------------|
| `diagnostics` | `Diagnostic[]` | Every error/warning with a stable `code` (`tex-error`, `package-error`, `missing-package`, `font-not-found`, `missing-glyph`, `undefined-reference`, `undefined-citation`, `rerun-needed`, `overfull-box`, `package-warning`, `latex-warning`), `severity`, `message`, and optional `file`/`line`. A `missing-glyph` entry carries the affected font + characters in `glyph`. |
| `geometry` | `DocumentGeometry` | Page/box geometry parsed from the XDV — per page: `width`/`height` (media box, bp), `textRuns` (positioned runs with `x`/`y`/`width`/`size`/`glyphs`, plus `text`/`font` when available), `rules`, and a `contentBox`. The substrate for text extraction, click-to-source, cropping, and overlays. **XeLaTeX only** (the engine that emits XDV); `reliable: false` flags an unparseable/desynced run. |
| `dependencies` | `DependencyGraph` | What the compile depended on: `nodes` (each with `kind: 'tex' \| 'class' \| 'package' \| 'font' \| 'image' \| 'bib' \| 'other'`, `origin: 'project' \| 'system'`, and `discoveredBy`) + `edges` (`includes`/`loads`/`uses-font`/`reads`) + `root`. The substrate for cache invalidation and incremental compile. Derived from the log (all engines) and enriched with the source `\usepackage`/`\input`, XDV fonts (XeLaTeX), and the `.fls` recorder (pdfLaTeX). |

Coordinates are PDF points (bp) measured from each page's top-left. Geometry text and dependency fonts are best-effort — XeTeX emits run text only for some runs, and font edges come from the XeLaTeX XDV.

## LSP Core

Use `wasmtex/lsp` when you want LaTeX intelligence without taking WasmTex's editor/viewer.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'

const lsp = createLatexLanguageService({
  files: {
    'main.tex': '\\section{Intro}\\label{sec:intro}\\ref{missing}',
  },
})

const diagnostics = lsp.getDiagnostics()
const outline = lsp.getOutline('main.tex')
```

Construct it with `createLatexLanguageService(options?)` or `new LatexLanguageService(options?)`;
`options` (`LatexLanguageServiceOptions`) seeds `files`, `aux`, `engineCommands`,
`semanticTrace`, and `lint`. The editor-neutral result types — `SemanticToken`, `InlayHint`,
`CodeAction`, `DocumentLink`, `FoldingRange`, `SignatureHelp`, `WorkspaceSymbol`,
`Diagnostic`, `FileSymbols`, `SectionDef` — are exported from `wasmtex/lsp` for typing
your own UI.

### `LatexLanguageService` Methods

**Project state**
- `loadProject(files): void`
- `updateFile(path, content): void`
- `removeFile(path): boolean`
- `getFile(path): string | Uint8Array | null`
- `listFiles(): string[]`
- `updateAux(content): void` — feed back `.aux` numbers (resolves `\ref`/`\cite` inlay hints).
- `updateEngineCommands(commands): void` — feed back the engine's command hash (improves completion).
- `updateSemanticTrace(trace): void` — feed back semantic-trace data for richer tokens.

**Language features** (all return editor-neutral types)
- `getDiagnostics(): Diagnostic[]`
- `getFileSymbols(path): FileSymbols | undefined`
- `getOutline(path): SectionDef[]`
- `getCompletions(path, line, column): NeutralCompletionItem[]`
- `getHover(path, line, column): NeutralHover | null`
- `getDefinition(path, line, column): NeutralLocation | null`
- `getReferences(path, line, column): NeutralLocation[]`
- `getSignatureHelp(path, line, column): SignatureHelp | null`
- `getDocumentHighlights(path, line, column): LFRange[]`
- `getWorkspaceSymbols(query): WorkspaceSymbol[]`
- `getFoldingRanges(path): FoldingRange[]`
- `getInlayHints(path): InlayHint[]`
- `getDocumentLinks(path): DocumentLink[]`
- `getSemanticTokens(path): SemanticToken[]`
- `getCodeActions(path, line): CodeAction[]`
- `getRenameEdits(path, line, column, newName): LatexWorkspaceEdit | undefined`

**Escape hatches**
- `getProjectIndex(): ProjectIndex`
- `getVirtualFileSystem(): VirtualFS`

### Static linter (ChkTeX-style)

`getDiagnostics()` includes style/correctness lint warnings (no compile needed)
alongside the reference/citation checks. The linter is comment/verbatim/math
aware (it never fires inside comments, `\verb`, verbatim environments, or — for
text rules — math mode). Each rule is individually toggleable with a severity;
lint diagnostics use codes distinct from the index diagnostics, so the two never
double-report.

Configure via the `lint` option (on `WasmTex` and `LatexLanguageService`):
`false` disables the linter; an object overrides per-rule `enabled`/`severity`.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'

const service = createLatexLanguageService({
  files,
  lint: {
    'straight-double-quotes': { enabled: false, severity: 'info' }, // turn one rule off
    'space-before-punctuation': { enabled: true, severity: 'error' }, // bump severity
  },
})
```

You can also lint a single string directly: `lintSource(content, path, config?)`.
`DEFAULT_LINT_CONFIG` exposes the defaults.

| Rule (`code`) | Default | Flags |
|---------------|---------|-------|
| `nbsp-before-ref` | info | A plain space before `\ref`/`\cite`/… (suggests `~`). |
| `space-before-punctuation` | warning | Whitespace before `, ; : ! ?`. |
| `doubled-space` | info | Two or more spaces between words. |
| `ellipsis` | info | Literal `...` (suggests `\dots`/`\ldots`). |
| `straight-double-quotes` | info | A straight `"` (suggests `` `` `` / `''`). |
| `display-math-dollars` | warning | `$$ … $$` (suggests `\[ … \]`). |
| `en-dash-range` | info | A hyphen between digits, e.g. `10-20` (suggests `--`). |
| `math-operator-as-text` | warning | `sin`, `log`, … as plain text in math mode (suggests `\sin`). |
| `footnote-spacing` | info | A space before `\footnote`. |
| `abbreviation-spacing` | info (off) | `e.g.`/`i.e.` followed by a plain space. Off by default. |

### Monaco Adapter

Use `wasmtex/lsp/monaco` when you want the existing Monaco completion, hover,
definition, reference, symbol, and rename providers.

```ts
import { createLatexLanguageService } from 'wasmtex/lsp'
import { ensureLanguagesRegistered, registerLatexMonacoProviders } from 'wasmtex/lsp/monaco'

ensureLanguagesRegistered()
const service = createLatexLanguageService({ files })
const disposables = registerLatexMonacoProviders(service, {
  onWorkspaceEdit(edit) {
    // Apply via your app state or Yjs transaction.
  },
})
```

The Monaco providers are thin adapters over editor-neutral cores in `src/lsp/`
(`neutral-providers.ts`, `language-features.ts`) — none of which import Monaco —
so the same logic backs both the Monaco adapter and the LSP server below.

### Standalone LSP server

Use `wasmtex/lsp/server` to run the language intelligence as a JSON-RPC
[Language Server](https://microsoft.github.io/language-server-protocol/) in any
host (VS Code, Neovim, or a browser Web Worker). `LatexLspServer` is
transport-agnostic: give it a `send` callback and feed it incoming messages with
`handle()`. It implements `initialize`, `textDocument/didOpen`/`didChange`,
`completion`, `hover`, `definition`, `references`, `rename`, and pushes
`publishDiagnostics`.

```ts
import { LatexLspServer } from 'wasmtex/lsp/server'

// Browser Web Worker transport (host side mirrors this).
const server = new LatexLspServer((msg) => self.postMessage(msg))
self.onmessage = (e) => server.handle(e.data)
```

```ts
// Node stdio transport sketch (for a VS Code / Neovim binary):
const server = new LatexLspServer((msg) => writeMessage(process.stdout, msg))
readMessages(process.stdin, (msg) => server.handle(msg))
```

## SyncTeX (`wasmtex/synctex`)

Parse the engine's SyncTeX output and map between PDF positions and source
locations — for hosts that render the PDF themselves (the built-in `PdfViewer`
already uses this internally). `CompileResult.synctex` holds the raw bytes.

```ts
import { SynctexParser, TextMapper } from 'wasmtex/synctex'

const data = new SynctexParser(synctexBytes).parse()      // { ...SynctexData }
// PDF → source (inverse search) and source → PDF (forward search):
const mapper = new TextMapper(data)
```

| Export | Purpose |
|--------|---------|
| `SynctexParser` | Parses raw (or gzipped) `.synctex` bytes into `SynctexData`. |
| `TextMapper` | Maps between `PdfLocation` and `SourceLocation` using the parsed data. |
| `normalizeSynctexInputName` | Normalizes an input path as SyncTeX records it (for matching project files). |
| `SynctexData` / `SynctexNode` / `PdfLocation` / `SourceLocation` | Result/coordinate types. |

## Methods

- `init(): Promise<void>` — Initializes the WASM engines and runs the first compilation.
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
- `revealLine(line: number, file?: string): void` — Navigates the editor to a specific line/file.
- `clearCache(): Promise<void>` — Clears the [persistent TeX Live cache](engine.md#persistent-cache) (IndexedDB) for the active TeX Live year.
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
| `compile` | `{ result: CompileResult }` | A compilation cycle finished. `result.telemetry` carries machine-readable diagnostics, geometry, and the dependency graph — see [Compile telemetry](#compile-telemetry). |
| `status` | `{ status: string, message?: string, preambleSnapshot?: boolean, incremental?: boolean }` | Editor lifecycle state changed (e.g. `'compiling'`, `'ready'`, `'error'`). `message` provides human-readable progress text; `preambleSnapshot` is `true` when a cached `.fmt` was reused; `incremental` is `true` when a `'ready'` reflects an [incremental](#incremental-compilation) fast paint (exact when SyncTeX was spliced; a background reconcile follows only when it couldn't be). Compile results also expose `preambleRebuilt` when the preamble `.fmt` cache was rebuilt. |
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
await editor.init()

editor.on('diagnostics', ({ diagnostics }) => {
  for (const d of diagnostics) {
    console.log(`[${d.severity}] line ${d.line}: ${d.message}`)
  }
  // render into your own UI…
  renderDiagnosticsPanel(diagnostics)
})
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

When `collaboration: true` is set, WasmTex delegates all content ownership to your CRDT/OT layer. It will never call `model.setValue()`, so your binding stays authoritative.

### Example: Yjs + y-monaco

```ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { MonacoBinding } from 'y-monaco'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider('wss://your-server', 'room-id', ydoc)

const editor = new WasmTex('#editor', '#preview', { collaboration: true })
await editor.init()

const bindings = new Map()

editor.on('modelCreate', ({ path, model }) => {
  const ytext = ydoc.getText(path)
  const binding = new MonacoBinding(
    ytext,
    model,
    new Set([editor.getMonacoEditor()]),
    provider.awareness,
  )
  bindings.set(path, binding)
})

editor.on('modelDispose', ({ path }) => {
  bindings.get(path)?.destroy()
  bindings.delete(path)
})
```
