# Editor integration recipes

Set up [browser workers and containers](howto.md#worker-setup-required) first.
This guide covers application-owned Monaco instances, file navigation and Yjs.
Options, methods and events are in the [editor API](api.md).

## Split-container mode (Editor + PDF only)
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

## Using an Existing Monaco Editor

If your application already manages a Monaco editor, pass it via the `editor` option. WasmTex will attach its LSP features (autocompletion, hover, go-to-definition, diagnostics) and compilation pipeline to your editor without creating a duplicate instance.

### Setup

You are responsible for:
1. **Worker configuration** — set up Monaco and pdfjs workers as described in [Worker Setup](howto.md#worker-setup-required).
2. **Editor creation and disposal** — WasmTex will **not** dispose your editor when `latex.dispose()` is called.

WasmTex handles:
- Registering `latex` and `bibtex` languages (via `ensureLanguagesRegistered`)
- Switching the editor's model when the active file changes
- All LSP providers and compilation

### Example

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

### Disposal

```typescript
// WasmTex cleans up its own resources (engines, LSP, models)
// but leaves your editor instance alive.
latex.dispose()

// myEditor is still usable — dispose it on your own terms.
myEditor.dispose()
```

## Multi-File Navigation

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

## Intelligent Rename (F2)
Press **F2** on a symbol to rename it across the project. Supports Labels, Citations, and custom Commands.

## Collaborative Editing (Yjs)

WasmTex supports real-time collaborative editing via Yjs and y-monaco.
Enable `collaboration: true` so that WasmTex never calls `model.setValue()` on
Monaco models — content ownership is delegated entirely to the CRDT layer.

Install `yjs`, `y-monaco` and your transport (here `y-websocket`) separately.
The example assumes a Yjs server has the project's authoritative text. Your host
owns room synchronization, initial document seeding and shared file creation/deletion.

```typescript
import * as Y from 'yjs'
import type { editor as MonacoEditor } from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { WebsocketProvider } from 'y-websocket'
import { WasmTex } from 'wasmtex'
import 'wasmtex/style.css'

// Run the browser worker setup from the integration guide first.
const ydoc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:1234', 'my-room', ydoc)
await new Promise<void>((resolve) => {
  const onSync = (synced: boolean) => {
    if (synced) { provider.off('sync', onSync); resolve() }
  }
  provider.on('sync', onSync)
})

const bindings = new Map<string, MonacoBinding>()
const latex = new WasmTex('#editor', '#preview', {
  assetBaseUrl: '/',
  serviceWorker: false,
  files: { 'main.tex': ydoc.getText('main.tex').toString() },
  collaboration: true,
})

function bind(path: string, model: MonacoEditor.ITextModel) {
  if (bindings.has(path)) return
  bindings.set(path, new MonacoBinding(
    ydoc.getText(path), model, new Set([latex.getMonacoEditor()]), provider.awareness,
  ))
}

latex.on('modelCreate', ({ path, model }) => bind(path, model))
latex.on('modelDispose', ({ path }) => {
  bindings.get(path)?.destroy()
  bindings.delete(path)
})
// The constructor already created initial models, before listeners could attach.
for (const path of latex.listFiles()) {
  const model = latex.getModel(path)
  if (model) bind(path, model)
}
await latex.init()

// Call on unmount; these resources are owned by this component/host.
function dispose() {
  for (const binding of bindings.values()) binding.destroy()
  bindings.clear()
  latex.dispose()
  provider.destroy()
  ydoc.destroy()
}
```

**How it works:**
- Bind existing models after construction, then use `modelCreate` for later files.
- Your code attaches a `MonacoBinding` that syncs the model content via Yjs.
- Remote edits arrive as `model.applyEdits()` → triggers `onDidChangeContent` →
  WasmTex updates its VFS and recompiles automatically.
- `collaboration: true` prevents WasmTex from calling `model.setValue()`,
  which would conflict with the CRDT state.
- Keep one binding per model across file switches. Use `fileOpen` for active-file UI
  or awareness state, not to recreate every binding.
