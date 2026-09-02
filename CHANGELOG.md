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

- Accessible export (`WasmTexCompiler.exportAccessiblePdf()`): a tagged, PDF/UA-2 declared
  PDF produced by the LaTeX tagging kernel (`\DocumentMetadata{tagging=on}`, TeX Live 2026
  profile) on a sibling compiler, with the document language detected, a verified
  document-class support matrix, and a read-back report (`inspectPdfTagging`) of structure
  tree, language, figure alt coverage, headings and tables. Linter rules `a11y-graphics-alt`,
  `a11y-float-caption`, `a11y-heading-skip`, `a11y-pdf-metadata` (info by default).
- TikZ figure externalization (`tikzExternalization` on `WasmTexCompiler`): a document that
  calls `\tikzexternalize` now has its pictures rendered by a pool of sibling compilers
  (no shell escape) and reused across edits via the `external` library's own MD5 check;
  `mode: 'auto'` extends this to documents that load TikZ without calling it, with a
  never-worse-than-inline contract (documented library limits are detected and left inline;
  a failed figure job falls back to an inline compile). `\ref` inside pictures resolves and
  picture errors are surfaced in `errors` at their source lines; a main file can pin its
  mode with `% !WASMTEX tikz-externalization = off|document|auto`. A text-only recompile of a
  15-picture document drops from ~1.1 s to ~140 ms. Telemetry: `telemetry.tikzExternalization`.
  - Server-side xindy backend for index generation.
-->

### Added

- `telemetry.texliveDependencies`: the exact TeX Live dependency set of a compile,
  unioned across rerun passes, and `warmup({ dependencies })` to prefetch that set in
  parallel next session. Measured against the live mirror, replaying the set takes a cold
  IEEEtran first compile from 12–23 s to ~2.3 s and acmart from 57 s+ to ~6 s. The set
  is fetched on top of the built-in manifest, never instead of it, and is cumulative over
  the compiler session so a preamble-snapshot compile does not shrink it (#80).
- Resolver evidence retains up to 1024 entries per pass (was 256), so the dependency
  set of a large document stays complete.
- Document Syntax Snapshot v8 exposes bounded, non-overlapping source-order blocks so
  downstream semantic engines can reason about adjacency without rescanning TeX.

### Fixed

- The pdfTeX worker stored host-preloaded TeX Live files (warmup and persistent
  cache) under their bare request name, so a TFM and a same-named virtual font
  (`ptmr7t`, every psnfss/Times document) overwrote each other and a rehydrated
  session failed with `Bad metric (TFM) file`. Preloads now use the same
  extension-normalized cache path as on-demand fetches (#80).

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
