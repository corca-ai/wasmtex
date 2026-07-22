# Integration Guide

This guide explains how to integrate the `WasmTex` library into your web applications.

## Installation

WasmTex is **not published to npm** — install it directly from GitHub. The
package name is `wasmtex`, so you still import it as `from 'wasmtex'`.

```bash
# npm
npm install monaco-editor pdfjs-dist
npm install github:corca-ai/wasmtex#main

# bun
bun add monaco-editor pdfjs-dist
bun add github:corca-ai/wasmtex#main
```

**Notes:**
- `monaco-editor` and `pdfjs-dist` are peer dependencies and must be installed
  separately (see [Worker Setup](#worker-setup-required)).
- A GitHub install builds the library locally via the `prepare` script, so the
  install machine needs the toolchain (**Node.js ≥ 24**). Pin a tag/commit
  instead of `#main` for reproducible builds.
- **Engine binaries are not part of the install** (the WASM engines + prebuilt
  formats ship via CI, not the package). If you self-host assets, pull a verified,
  matching set with `npm run sync-engine-assets -- --from <baseUrl>`; the
  [asset self-hosting guide](engine.md#self-hosting-the-engine-assets-manifest--sync) covers the complete process.
  The sync command accepts only a release whose license manifest is marked
  `release-cleared`; it will not turn development binaries into a redistributable set.

## What's Included

TeX Live packages are served from a **public CDN** — no setup or hosting required. The library fetches packages on demand during compilation and caches them via a Service Worker for offline use.

## Worker Setup (Required)

WasmTex depends on **Monaco Editor** and **pdfjs-dist** web workers. Because these are peer dependencies (not bundled into the library), **your bundler** must resolve and bundle the worker files from your own `node_modules`.

Add the following setup code **before** creating a `WasmTex` instance:

```typescript
import * as pdfjsLib from 'pdfjs-dist'

// Monaco workers — required for the code editor
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
        { type: 'module' },
      )
    }
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    )
  },
}

// pdfjs worker — required for PDF preview
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()
```

> **Why is this needed?** The `new URL(…, import.meta.url)` pattern must appear in **your** source code so that your bundler (Vite, webpack, etc.) can locate the worker files in `node_modules` and emit them as separate chunks. The library cannot do this on your behalf because the worker URLs would be resolved relative to the pre-built library bundle, not your project.

## Basic Usage

```typescript
import * as pdfjsLib from 'pdfjs-dist'
import { WasmTex } from 'wasmtex'
import 'wasmtex/style.css'

// 1. Worker setup (see section above)
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'json') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
        { type: 'module' },
      )
    }
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    )
  },
}
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// 2. Create editor
const editor = new WasmTex('#editor-container', '#preview-container', {
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hello world!\\end{document}'
  }
})

await editor.init()
```

`WasmTex` exposes a dedicated stylesheet entrypoint (`wasmtex/style.css`) and does not auto-import it from the JS entry.
Import it if you want the default built-in layout and viewer styles.

## Advanced Features

### Headless Compilation

Use the headless entrypoint when your app owns the editor, CRDT state, and PDF UI.

```typescript
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: 'https://cdn.example.com/',
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hello\\end{document}',
  },
})

await compiler.init()
const result = await compiler.compile()

if (result.pdf) {
  renderPdf(result.pdf)
}
```

### Server backends (BibTeX / Biber / xindy offload)

By default every compile stage runs **client-side** (WASM/TS), so nothing leaves the
device. To offload a stage to a server that runs the same deterministic engine, pass a
`backends` registry to `WasmTexCompiler`. Stages left unregistered keep the client
default. The `.aux`-based `BIBTEX_STAGE` and `.bcf`-based `BIBER_STAGE` are distinct
contracts, so one processor can never receive the other's request.

```typescript
import { WasmTexCompiler, BackendRegistry, BIBER_STAGE, createBiberBackend } from 'wasmtex/headless'

const backends = new BackendRegistry()
// BIBER_STAGE accepts only the .bcf-based BiberRequest contract.
backends.register(BIBER_STAGE, createBiberBackend({ endpoint: '/api/biber' }))

const compiler = new WasmTexCompiler({ files, backends })
await compiler.init()
const result = await compiler.compile() // Biber runs remotely; rest stays client-side.
```

`createBiberBackend` (biblatex `.bcf` → `.bbl`), `createMakeindexBackend` and
`createXindyBackend` (`.idx` → `.ind`, stage `'index'`) are thin wrappers over
`createJsonTextBackend` / `createRemoteBackend`; roll your own server backend with those for
any stage. Wrap any string-producing backend with `withCache(backend, store)` (e.g.
`new MemoryCacheStore()`) for content-addressed reuse — a stage compiled once on any host is
then free everywhere. The toolkit is exported from both `wasmtex` and `wasmtex/headless`.
See [Bibliography backends](bibliography.md).

> The compiler auto-routes the `bibliography` **and `index`** stages. `\printindex` works
> out of the box, fully client-side, via the bundled makeindex WASM — no server needed. A
> backend registered for `index` (`createMakeindexBackend`, or `createXindyBackend` for
> multilingual / complex indexing) offloads that stage to your endpoint instead. The
> [execution model](execution-model.md#how-a-consumer-chooses-the-boundary) explains how to choose the boundary.

### Server-side compilation (Node)

The `wasmtex/node` entry runs the same engines off-browser via a `worker_threads`
host. Call `installNodeWorkerHost` once (pointing at your local engine assets), then use
`WasmTexCompiler` exactly as in the browser. pdfLaTeX, LuaLaTeX, **and XeLaTeX** all run
under Node.

```typescript
import { installNodeWorkerHost, WasmTexCompiler } from 'wasmtex/node'

const nodeHost = installNodeWorkerHost({
  publicDir: '/path/to/public',                  // holds versioned controller/core/WASM assets
  assetBaseUrl: 'http://assets.local/',
})

const compiler = new WasmTexCompiler({
  assetBaseUrl: 'http://assets.local/',
  texliveUrl: 'https://your-texlive-cdn/2025/',  // TeX Live packages (pass-through fetch)
  files: { 'main.tex': '\\documentclass{article}\\begin{document}Hello\\end{document}' },
})
await compiler.init()
const { pdf } = await compiler.compile()
compiler.dispose()
nodeHost.dispose() // restores the previous global fetch and worker factory
```

> Node ≥ 24 is required, and the engine `.js`/`.wasm` assets must be present under
> `publicDir` (the package install does not ship them — pull them with
> `npm run sync-engine-assets -- --from <baseUrl>`).

### Standalone LSP

Use the LSP entrypoints when you want LaTeX diagnostics/outline/rename without
using the built-in editor/viewer.

```typescript
import { createLatexLanguageService } from 'wasmtex/lsp'
import { ensureLanguagesRegistered, registerLatexMonacoProviders } from 'wasmtex/lsp/monaco'

const lsp = createLatexLanguageService({ files })

ensureLanguagesRegistered()
const disposables = registerLatexMonacoProviders(lsp, {
  onWorkspaceEdit(edit) {
    // Apply edits to your app state or CRDT layer.
  },
})

const diagnostics = lsp.getDiagnostics()
```

### BibTeX Support
The editor automatically handles `.bib` and `.bst` files.

```typescript
editor.loadProject({
  'main.tex': `
\\documentclass{article}
\\begin{document}
As shown in \\cite{knuth1984}, TeX is great.
\\bibliographystyle{plain}
\\bibliography{references}
\\end{document}`,
  'references.bib': `
@article{knuth1984,
  author = {Knuth, Donald E.},
  title = {Literate Programming},
  journal = {The Computer Journal},
  year = {1984},
}`
})
```

### Engine selection (XeLaTeX / CJK)

WasmTex auto-detects the TeX engine each document needs. You usually do nothing — a
doc that uses `fontspec`, `unicode-math`, or CJK (`xeCJK`, `xetexko`) is detected and
routed to **XeLaTeX**, a `\directlua`/`luacode`/`luaotfload` doc to **LuaLaTeX**, and
everything else to **pdfLaTeX**. You can also force it with a `% !TEX program = …`
magic comment or the `engine` option.

> **Where the Unicode engines run.** The browser **`WasmTex` UI component runs
> pdfLaTeX only.** A document that needs XeLaTeX/LuaLaTeX compiles to an *actionable*
> error there ("this document requires XeLaTeX …") rather than failing cryptically.
> The **headless `WasmTexCompiler`** (and the Node host, see [Server-side
> compilation (Node)](#server-side-compilation-node)) does run XeLaTeX/LuaLaTeX when
> the matching engine WASM is present in its assets dir — so by-name CJK fonts and
> `\directlua` work there.

```typescript
// Auto (default): detected from the main file's preamble / magic comment.
new WasmTex('#editor', '#preview', { files, engine: 'auto' })

// Force a specific engine. (XeLaTeX/LuaLaTeX actually compile under the headless
// compiler; the browser WasmTex component is pdfLaTeX-only.)
new WasmTexCompiler({ files, engine: 'xelatex' })
```

A Korean document, for example, compiles under the headless compiler (or Node host):

```latex
\documentclass{article}
\usepackage{xeCJK}
\setCJKmainfont{Harano Aji Gothic}   % by family name, or a filename like
                                     % HaranoAjiGothic-Regular.otf
\begin{document}
안녕하세요. XeLaTeX + xeCJK 한국어 문서.
\end{document}
```

> **Fonts must be on the TeX Live mirror.** Both by-name
> (`\setmainfont{Latin Modern Roman}`) and by-filename
> (`\setmainfont{lmroman10-regular.otf}`) work; the font file has to exist on the
> CDN (the bundled mirror already carries the TeX Live OpenType/TrueType fonts,
> including the pan-CJK Harano Aji family).

A LuaLaTeX document is detected the same way — a `\directlua`, a `luacode`/`luaotfload`
package, or `% !TEX program = lualatex` selects **LuaLaTeX** (again, under the headless
compiler / Node host):

```latex
% !TEX program = lualatex
\documentclass{article}
\usepackage{fontspec}
\setmainfont{lmroman10-regular.otf}   % by filename (or stem: lmroman10-regular)
\begin{document}
LuaLaTeX with \directlua{tex.print("inline Lua")}.
\end{document}
```

> **LuaLaTeX fonts: specify by filename, not human name.** Unlike XeLaTeX,
> LuaLaTeX has no font-name database shipped yet, so `\setmainfont{lmroman10-regular.otf}`
> or the stem `\setmainfont{lmroman10-regular}` works (kpse resolves it on the CDN),
> but `\setmainfont{Latin Modern Roman}` does **not** resolve — luaotfload silently
> falls back to Computer Modern. Shipping a luaotfload names database (to enable
> human-name lookup) is tracked as a follow-up; until then, prefer XeLaTeX for
> by-name fonts and CJK.

> **Engine assets.** Each Unicode engine loads from your assets dir
> (`wasmtex/<version>/`), next to the pdfTeX engine: XeLaTeX needs
> `wasmtex-xetex` + `wasmtex-dvipdfm`; LuaLaTeX needs `wasmtex-luatex` (it
> writes PDF directly, so it's a single worker — no dvipdfmx). The standalone IDE /
> GitHub Pages build ships whatever is available automatically (CI). If you self-host,
> `npm run sync-engine-assets -- --from <baseUrl>` places the Unicode engines too.
> **If an engine's WASM is
> absent, a document that needs it compiles to an actionable error** ("this document
> requires XeLaTeX/LuaLaTeX …") instead of failing cryptically — so pdfLaTeX-only
> deployments degrade gracefully. Both XeLaTeX and LuaLaTeX (LuaHBTeX) are built from
> source and ship via CI; the
> [multi-engine support guide](engine.md#multi-engine-support-xelatex--lualatex) covers their build and routing details.

### Split-container mode (Editor + PDF only)
Build a minimal layout by giving both editor and preview nodes.

```typescript
const editor = new WasmTex('#editor-container', '#preview-container', {
  files: { 'main.tex': '...' }
})

editor.on('compile', ({ result }) => {
  if (result.success && result.pdf) {
    myCustomViewer.display(result.pdf)
  }
})
```

### Using an Existing Monaco Editor

If your application already manages a Monaco editor, pass it via the `editor` option. WasmTex will attach its LSP features (autocompletion, hover, go-to-definition, diagnostics) and compilation pipeline to your editor without creating a duplicate instance.

#### Setup

You are responsible for:
1. **Worker configuration** — set up Monaco and pdfjs workers as described in [Worker Setup](#worker-setup-required).
2. **Editor creation and disposal** — WasmTex will **not** dispose your editor when `latex.dispose()` is called.

WasmTex handles:
- Registering `latex` and `bibtex` languages (via `ensureLanguagesRegistered`)
- Switching the editor's model when the active file changes
- All LSP providers and compilation

#### Example

```typescript
import * as monaco from 'monaco-editor'
import * as pdfjsLib from 'pdfjs-dist'
import { WasmTex, ensureLanguagesRegistered } from 'wasmtex'
import 'wasmtex/style.css'

// 1. Configure workers (see Worker Setup section)
self.MonacoEnvironment = {
  getWorker(_workerId, label) {
    if (label === 'json') {
      return new Worker(
        new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url),
        { type: 'module' },
      )
    }
    return new Worker(
      new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url),
      { type: 'module' },
    )
  },
}
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString()

// 2. Register LaTeX/BibTeX languages before creating the editor
//    so that syntax highlighting is available from the start.
ensureLanguagesRegistered()

// 3. Create your own Monaco editor
const source = '\\documentclass{article}\n\\begin{document}\nHello!\n\\end{document}'

const myEditor = monaco.editor.create(document.getElementById('editor')!, {
  language: 'latex',
  value: source,
  automaticLayout: true,
})

// 4. Pass it to WasmTex
const latex = new WasmTex('#editor', '#preview', {
  editor: myEditor,
  files: { 'main.tex': source },
})

await latex.init()
```

#### Disposal

```typescript
// WasmTex cleans up its own resources (engines, LSP, models)
// but leaves your editor instance alive.
latex.dispose()

// myEditor is still usable — dispose it on your own terms.
myEditor.dispose()
```

### Multi-File Navigation

WasmTex handles cross-file navigation (go-to-definition, inverse search) internally.
Use the `fileOpen` event to keep your host UI in sync:

```typescript
// Track which file is active (e.g. for file tabs)
latex.on('fileOpen', ({ path }) => {
  highlightTab(path)
})

// Programmatic file switching
latex.openFile('chapters/intro.tex')

// Query the current file
const current = latex.getActiveFile()
```

When a rename (F2) affects multiple files, the `workspaceEdit` event reports all edits:

```typescript
latex.on('workspaceEdit', ({ edits }) => {
  const affectedFiles = new Set(edits.map(e => e.file))
  console.log('Rename touched:', [...affectedFiles])
})
```

### Intelligent Rename (F2)
Press **F2** on a symbol to rename it across the project. Supports Labels, Citations, and custom Commands.

### Collaborative Editing (Yjs)

WasmTex supports real-time collaborative editing via Yjs and y-monaco.
Enable `collaboration: true` so that WasmTex never calls `model.setValue()` on
Monaco models — content ownership is delegated entirely to the CRDT layer.

```typescript
import * as Y from 'yjs'
import { MonacoBinding } from 'y-monaco'
import { WebsocketProvider } from 'y-websocket'
import * as pdfjsLib from 'pdfjs-dist'
import { WasmTex } from 'wasmtex'
import 'wasmtex/style.css'

// Worker setup (see "Worker Setup" section above)
self.MonacoEnvironment = { /* ... */ }
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs', import.meta.url,
).toString()

// Yjs setup
const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc)
const yfiles = ydoc.getMap('files')
const bindings = new Map<string, MonacoBinding>()

// Create WasmTex with collaboration enabled
const latex = new WasmTex('#editor', '#preview', {
  files: { 'main.tex': '\\documentclass{article}\n\\begin{document}\nHello!\n\\end{document}' },
  collaboration: true,
})

// Bind y-monaco to each model as it is created
latex.on('modelCreate', ({ path, model }) => {
  let ytext = yfiles.get(path) as Y.Text
  if (!ytext) { ytext = new Y.Text(); yfiles.set(path, ytext) }
  bindings.set(path, new MonacoBinding(
    ytext, model, new Set([latex.getMonacoEditor()]), provider.awareness,
  ))
})

// Clean up bindings when models are disposed
latex.on('modelDispose', ({ path }) => {
  bindings.get(path)?.destroy()
  bindings.delete(path)
})

await latex.init()
```

**How it works:**
- WasmTex creates Monaco models and emits `modelCreate` for each file.
- Your code attaches a `MonacoBinding` that syncs the model content via Yjs.
- Remote edits arrive as `model.applyEdits()` → triggers `onDidChangeContent` →
  WasmTex updates its VFS and recompiles automatically.
- `collaboration: true` prevents WasmTex from calling `model.setValue()`,
  which would conflict with the CRDT state.
- Use `fileOpen` to switch Yjs bindings when the active file changes
  (e.g. via go-to-definition or `openFile()`).

## References

- **[Runnable example](../examples/embed.html)**: Minimal embed (constructor + worker setup) you can copy into a bundled app.
- **[Full API Reference](api.md)**: Detailed list of methods and events.
- **[Engine Configuration](engine.md)**: How to configure WASM assets and CDN.
- **[Bibliography backends](bibliography.md)**: BibTeX vs biblatex/Biber selection.
- **[Warmup / Preload](warmup.md)**: Eliminate first-compile cold start.
