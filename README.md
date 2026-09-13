# WasmTex

An embeddable LaTeX SDK with a headless compiler, optional Monaco editor and PDF
preview, and editor-neutral language services. The headless compiler runs pdfLaTeX,
XeLaTeX and LuaLaTeX in browser workers or on Node. The built-in `WasmTex` component
provides a pdfLaTeX editor and PDF.js preview. TeX Live packages load on demand;
engine assets are [hosted separately](docs/assets.md).

**[Live Demo](https://corca-ai.github.io/wasmtex/)**

## Quick Start

Install from GitHub with Node 24+. The package includes a committed `lib/` bundle;
package managers may also run its `prepare` build. Pin a commit instead of `#main`
for reproducible installs.

```bash
npm install github:corca-ai/wasmtex#main
```

[Download and serve the engine assets](docs/assets.md) under `/wasmtex/2025/`, then
compile in your browser app:

```typescript
import { WasmTexCompiler } from 'wasmtex/headless'

const compiler = new WasmTexCompiler({
  assetBaseUrl: '/',
  files: {
    'main.tex': String.raw`\documentclass{article}\begin{document}Hello!\end{document}`,
  },
})
try {
  await compiler.init()
  const result = await compiler.compile()
  if (result.success && result.pdf) {
    // Hand these bytes to your PDF renderer or download handler.
    console.log(`Compiled ${result.pdf.byteLength} PDF bytes`)
  } else {
    console.error(result.errors, result.log)
  }
} finally {
  compiler.dispose()
}
```

For the built-in editor, install `monaco-editor` and `pdfjs-dist`, then follow the
[complete browser setup](docs/howto.md#worker-setup-required). For server compilation,
use the [Node recipe](docs/headless.md#server-side-compilation-node).

## Packages / Entry Points

| Import | Purpose |
|--------|---------|
| `wasmtex` | Full editor + PDF preview SDK. |
| `wasmtex/headless` | DOM-free compiler (your app owns editor/preview). |
| `wasmtex/node` | Run the engines under Node (`installNodeWorkerHost` + `WasmTexCompiler`). |
| `wasmtex/lsp` | Monaco-free LaTeX language service core. |
| `wasmtex/lsp/monaco` | Monaco provider adapter. |
| `wasmtex/lsp/server` | Transport-agnostic JSON-RPC language server. |
| `wasmtex/warmup` | Dependency-light TeX Live preload and learned-set helpers. |
| `wasmtex/syntax` | Source-preserving syntax snapshots without Monaco. |
| `wasmtex/synctex` | SyncTeX parser + PDF↔source mapping, for a custom viewer. |
| `wasmtex/style.css` | Optional built-in UI/viewer styles. |

## Documentation

- **SDK users:** [installation](docs/howto.md), [engine assets](docs/assets.md),
  [headless / Node](docs/headless.md), [editor recipes](docs/editor-integration.md),
  and [language integration](docs/language-integration.md).
- **API contracts:** [editor](docs/api.md), [compiler](docs/compiler-api.md),
  [language service](docs/language-api.md), [syntax](docs/syntax-api.md), and
  [SyncTeX](docs/synctex-api.md).
- **Contributors:** [contribution workflow](CONTRIBUTING.md), [agent guide](AGENTS.md),
  [development](docs/develop.md), and [architecture](docs/architecture.md).

The [documentation index](docs/README.md) also covers engine maintenance, release
procedures, licensing and historical evidence.

## Language features

The built-in LaTeX language server (editor-neutral cores in `src/lsp/`, with a Monaco adapter) provides:

| Feature | Status |
|---------|--------|
| Completion (commands, refs, cites, packages, files) | ✅ |
| Hover (commands w/ signature + package, citations) | ✅ |
| Go-to-definition / references / rename | ✅ |
| Document symbols / outline | ✅ |
| Diagnostics + [ChkTeX-style linter](docs/language-api.md#static-linter-chktex-style) | ✅ |
| Signature help (argument hints) | ✅ |
| Folding ranges (environments, sections, `% region`) | ✅ |
| Document highlight (occurrences under cursor) | ✅ |
| Workspace symbols (labels/sections/commands) | ✅ via `wasmtex/lsp` service + LSP server (Monaco has no workspace-symbol UI) |
| Code actions (insert `~`, add `\usepackage`, create `\label`) | ✅ |
| Inlay hints (resolved `.aux` numbers next to `\ref`) | ✅ |
| Document links (`\input`/`\include`, `\url`/`\href`) | ✅ |
| Semantic tokens (commands, math, comments, verbatim) | ✅ |
| Formatting (`latexindent`-style) | ⏳ planned |

## Contributing

Contributions are welcome! Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** for setup,
coding standards, and the PR process, and note the committed-`lib/` rebuild rule.

- 🐛 **Bugs / features:** open an [issue](https://github.com/corca-ai/wasmtex/issues/new/choose).
- 🔐 **Security:** report privately — see [SECURITY.md](SECURITY.md).
- 🤝 **Conduct:** participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).
- 📓 **Changes:** notable changes are tracked in the [Changelog](CHANGELOG.md).

## License

Original WasmTex code and documentation are licensed under the [MIT License](LICENSE).
Third-party engines, generated WASM, TeX Live packages and fonts, ICU data, and peer
dependencies retain their own licenses; see [Third-Party Notices](THIRD_PARTY_NOTICES.md)
and the included [license texts](LICENSES/README.md). The MIT SDK may be used in a
closed-source product when the separately distributed engine assets satisfy their
own terms; see the [proprietary integration guide](docs/proprietary-integration.md).
