# WasmTex

An embeddable, browser-based LaTeX editor with real-time PDF preview — Monaco
editor, an in-browser pdfLaTeX engine (WASM), and PDF.js. Documents that need
XeLaTeX or LuaLaTeX (`fontspec`, `unicode-math`, CJK, `\directlua`) are auto-detected;
the full multi-engine pipeline runs through the [headless compiler](docs/howto.md#headless-compilation)
on the client or a Node server. TeX Live packages stream from a public CDN, so
there's nothing to host.

**[Live Demo](https://corca-ai.github.io/wasmtex/)**

## Quick Start

WasmTex is **not on npm** — install from GitHub. The install ships a prebuilt `lib/`
bundle, so it works with no build step. `monaco-editor` and `pdfjs-dist` are peer
dependencies.

```bash
npm install monaco-editor pdfjs-dist
npm install github:corca-ai/wasmtex#main
```

```typescript
import * as pdfjsLib from 'pdfjs-dist'
import { WasmTex } from 'wasmtex'
import 'wasmtex/style.css'

// Worker setup is REQUIRED — see the Integration Guide for the full block.
self.MonacoEnvironment = { /* monaco workers */ }
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs', import.meta.url,
).toString()

const editor = new WasmTex('#editor', '#preview', {
  files: { 'main.tex': '\\documentclass{article}\\begin{document}Hi!\\end{document}' },
})
await editor.init()
```

👉 **Start here:** the [Integration Guide](docs/howto.md) has the complete worker
setup and copy-pasteable recipes. A minimal example lives in
[`examples/embed.html`](examples/embed.html).

## Packages / Entry Points

| Import | Purpose |
|--------|---------|
| `wasmtex` | Full editor + PDF preview SDK. |
| `wasmtex/headless` | DOM-free compiler (your app owns editor/preview). |
| `wasmtex/node` | Run the engines under Node (`installNodeWorkerHost` + `WasmTexCompiler`). |
| `wasmtex/lsp` | Monaco-free LaTeX language service core. |
| `wasmtex/lsp/monaco` | Monaco provider adapter. |
| `wasmtex/lsp/server` | Transport-agnostic JSON-RPC language server. |
| `wasmtex/synctex` | SyncTeX parser + PDF↔source mapping, for a custom viewer. |
| `wasmtex/style.css` | Optional built-in UI/viewer styles. |

## Documentation

- **[Integration Guide](docs/howto.md)** — install, worker setup, headless, collaboration, engine selection.
- **[API Reference](docs/api.md)** — constructor options, methods, events, PdfViewer.
- **[Architecture](docs/architecture.md)** — SDK structure, VFS, LSP internals.
- **[Execution Model](docs/execution-model.md)** — client/server hybrid, pluggable per-stage backends.
- **[Engine & TeX Live](docs/engine.md)** — WASM engines, multi-engine routing, CDN.
- **[Licensing](docs/licensing.md)** — license scope and engine/CDN release requirements.
- **[Proprietary integration](docs/proprietary-integration.md)** — keep a host application closed-source while distributing engines compliantly.
- **[Bibliography](docs/bibliography.md)** · **[Warmup](docs/warmup.md)** · **[Contributing](docs/develop.md)**

> Contributing to WasmTex itself? See **[AGENTS.md](AGENTS.md)** and [docs/develop.md](docs/develop.md).

## Language features

The built-in LaTeX language server (editor-neutral cores in `src/lsp/`, with a Monaco adapter) provides:

| Feature | Status |
|---------|--------|
| Completion (commands, refs, cites, packages, files) | ✅ |
| Hover (commands w/ signature + package, citations) | ✅ |
| Go-to-definition / references / rename | ✅ |
| Document symbols / outline | ✅ |
| Diagnostics + [ChkTeX-style linter](docs/api.md#static-linter-chktex-style) | ✅ |
| Signature help (argument hints) | ✅ |
| Folding ranges (environments, sections, `% region`) | ✅ |
| Document highlight (occurrences under cursor) | ✅ |
| Workspace symbols (labels/sections/commands) | ✅ via `wasmtex/lsp` service + LSP server (Monaco has no workspace-symbol UI) |
| Code actions (insert `~`, add `\usepackage`, create `\label`) | ✅ |
| Inlay hints (resolved `.aux` numbers next to `\ref`) | ✅ |
| Document links (`\input`/`\include`, `\url`/`\href`) | ✅ |
| Semantic tokens (commands, math, comments, verbatim) | ✅ |
| Formatting (`latexindent`-style) | ⏳ planned |

## License

Original WasmTex code and documentation are licensed under the [MIT License](LICENSE).
Third-party engines, generated WASM, TeX Live packages and fonts, ICU data, and peer
dependencies retain their own licenses; see [Third-Party Notices](THIRD_PARTY_NOTICES.md)
and the included [license texts](LICENSES/README.md). The MIT SDK may be used in a
closed-source product when the separately distributed engine assets satisfy their
own terms; see the [proprietary integration guide](docs/proprietary-integration.md).
