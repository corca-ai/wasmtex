# Integration Guide

For application developers installing WasmTex. Choose a path before configuring workers:

| Your application needs | Guide |
| --- | --- |
| Compile files with your own editor/viewer or on Node | [Headless compilation](headless.md) |
| Built-in Monaco editor and PDF preview | [Browser setup below](#worker-setup-required) |
| Language features in an existing editor | [Language service integration](language-integration.md) |
| Source navigation in a custom PDF viewer | [SyncTeX API](synctex-api.md) |

Contributing to the library itself? Start with [development](develop.md).

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
  separately for the built-in editor and viewer (see [Worker Setup](#worker-setup-required)).
  `pdfjs-dist` is optional for headless and SyncTeX consumers using their own renderer.
  `monaco-editor` remains a required package-level peer, so npm can install it even
  for a headless-only application. The neutral/headless/Node runtime entries do not
  import Monaco, PDF.js or pdf-lib eagerly. `pdf-lib` is an optional peer used for
  incremental PDF splicing; peer metadata and runtime import boundaries are separate.
- The repository commits the prebuilt `lib/` bundle. A GitHub install may also
  run `prepare`, which rebuilds it and requires **Node.js ≥ 24**; package managers
  that skip lifecycle scripts use the committed bundle. Pin a tag/commit
  instead of `#main` for reproducible builds.
- TypeScript ESM consumers can use `moduleResolution: "NodeNext"` (with
  `module: "NodeNext"`) or their bundler's `"Bundler"` resolution. Include DOM libs
  for browser API types in the SDK declarations and Node types when using
  `wasmtex/node`; DOM type availability does not require a DOM at runtime.
  The [installed-package gate](develop.md#installed-package-verification) checks
  the committed bundle without lifecycle scripts and documents its transport limits.
- **Engine binaries are not part of the install.** Follow [engine asset setup](assets.md)
  to download a verified set from a repository checkout and serve it in your app.

## What's Included

TeX Live packages can be fetched on demand from the default public mirror.
Engine JS/WASM and format assets are separate and must be available at your
configured asset URL. The browser `WasmTex` component can register a service
worker when the host serves `sw.js`; the headless compiler does not install one.
Durable caching and offline prerequisites are described in [warmup](warmup.md).

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

Create two containers with nonzero heights before running the TypeScript below:

```html
<div style="display: grid; grid-template-columns: 1fr 1fr; height: 80vh">
  <div id="editor-container" style="min-width: 0"></div>
  <div id="preview-container" style="min-width: 0"></div>
</div>
```

```typescript
import { WasmTex } from 'wasmtex'
import 'wasmtex/style.css'

// Run the Worker Setup block above first.

// 2. Create editor
const editor = new WasmTex('#editor-container', '#preview-container', {
  assetBaseUrl: '/', // after serving the verified engine assets
  serviceWorker: false, // enable only when your host serves sw.js
  files: {
    'main.tex': '\\documentclass{article}\\begin{document}Hello world!\\end{document}'
  }
})

editor.on('status', ({ status, message }) => {
  if (status === 'error') console.error(message)
})
await editor.init()
// On unmount: editor.dispose()
```

`WasmTex` exposes a dedicated stylesheet entrypoint (`wasmtex/style.css`) and does not auto-import it from the JS entry.
Import it if you want the default built-in layout and viewer styles.

## Advanced Features

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

## References

- **[Runnable example](../examples/embed.html)**: Minimal embed (constructor + worker setup) you can copy into a bundled app.
- **[Full API Reference](api.md)**: Detailed list of methods and events.
- **[Engine Configuration](engine.md)**: How to configure WASM assets and CDN.
- **[Bibliography backends](bibliography.md)**: BibTeX vs biblatex/Biber selection.
- **[Warmup / Preload](warmup.md)**: Eliminate first-compile cold start.


## Moved reference sections

These anchors preserve existing bookmarks. Follow the links to the focused guides.

<a id="headless-compilation"></a>
<a id="server-backends-bibtex--biber--xindy-offload"></a>
<a id="server-side-compilation-node"></a>
See [Headless Compilation](headless.md#headless-compilation) in its dedicated guide.

<a id="standalone-lsp"></a>
See [Standalone LSP](language-integration.md#standalone-lsp) in its dedicated guide.

<a id="engine-selection-xelatex--cjk"></a>
See [Engine selection](headless.md#engine-selection-xelatex--cjk) in its dedicated guide.

<a id="split-container-mode-editor--pdf-only"></a>
<a id="using-an-existing-monaco-editor"></a>
<a id="setup"></a>
<a id="example"></a>
<a id="disposal"></a>
<a id="multi-file-navigation"></a>
<a id="intelligent-rename-f2"></a>
<a id="collaborative-editing-yjs"></a>
See [Split-container mode](editor-integration.md#split-container-mode-editor--pdf-only) in its dedicated guide.

<a id="preparing-transport-for-the-selected-engine"></a>
See [Preparing transport for the selected engine](headless.md#preparing-transport-for-the-selected-engine) in its dedicated guide.
