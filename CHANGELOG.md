# Changelog

All notable changes to WasmTex are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

WasmTex is pre-1.0 and distributed via `github:corca-ai/wasmtex#main` (there is no npm
release yet). While the API is stabilizing, minor versions may include breaking changes;
breaking changes are called out under **Changed** with a ⚠️ marker.

## [Unreleased]

<!--
Add entries here as you land changes. Group them under these headings:
  Added / Changed / Deprecated / Removed / Fixed / Security
Keep them user-facing and concise. Example:
  ### Added
  - Server-side xindy backend for index generation.
-->

## [0.1.0] - 2026-07

Initial development snapshot. WasmTex is an embeddable, browser-based LaTeX editor with
real-time PDF preview.

### Added

- Full editor SDK (`wasmtex`): Monaco editor, in-browser pdfLaTeX (WASM) engine, and PDF.js
  preview, with a live compile loop.
- Headless compiler (`wasmtex/headless`) for callers that own their own editor/preview.
- Node host (`wasmtex/node`): the same from-source engine running under Node via
  `installNodeWorkerHost`.
- Multi-engine support with auto-detection: XeLaTeX and LuaLaTeX (`fontspec`,
  `unicode-math`, CJK, `\directlua`) in addition to pdfLaTeX.
- Bibliography support: BibTeX / biblatex+Biber detection with a pluggable backend
  interface; `makeindex` / `xindy` indexing.
- LaTeX language service (`wasmtex/lsp`) with a Monaco adapter and a transport-agnostic
  JSON-RPC server.
- SyncTeX (`wasmtex/synctex`): PDF ↔ source mapping for forward/inverse search.
- Warmup / preload path to eliminate first-compile cold start.
- Streaming TeX Live packages from a public CDN with SHA-256-verified engine assets — no
  self-hosting required.
- Licensing & compliance tooling: per-version license manifests, SBOM generation,
  corresponding-source archives, and release-notice gates.

[Unreleased]: https://github.com/corca-ai/wasmtex/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/corca-ai/wasmtex/releases/tag/v0.1.0
