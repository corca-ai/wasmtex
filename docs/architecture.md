# Architecture

`WasmTex` is designed as a **headless-first SDK**. The core logic is decoupled from the UI, allowing it to run as a full IDE or a background compilation service.

> **Execution model:** the core is a host-agnostic, from-source engine that runs
> byte-identically on any host (browser, JS server runtime, standalone WASM runtime).
> The client/server boundary is chosen by the integrator, with a 100%-client default.
> See **[Execution Model — Client/Server Hybrid](execution-model.md)** for the principles,
> the host-port interface, and the determinism contract that makes the boundary fluid.

## High-Level Overview

```
[ Host Application ]
      ↓
[ WasmTex SDK ] (src/index.ts → WasmTex in src/wasmtex.ts)
      ├── [ VirtualFS ] (src/fs/virtual-fs.ts) - In-memory file management
      ├── [ LSP Engine ] (src/lsp/) - Completion, Hover, Diagnostics, Rename
      ├── [ Worker Orchestrator ] (src/engine/) - Engine selection + compile scheduling
      │     ├── pdfTeX Worker (WASM) - Default compilation + CDN fetching
      │     ├── XeLaTeX Workers (WASM) - XeTeX + dvipdfmx (fontspec / unicode-math / CJK)
      │     ├── LuaLaTeX Worker (WASM) - LuaHBTeX (writes PDF directly, single worker)
      │     └── BibTeX Worker (WASM) - Bibliography generation
      └── [ UI Components ] (src/ui/, src/viewer/) - Optional (hidden in headless mode)
```

- **SDK Core**: The `wasmtex` entry (`src/index.ts`) barrel-exports the `WasmTex` class (`src/wasmtex.ts`), which orchestrates VFS, LSP, and Engines.
- **Workers**: in the browser, WASM engines run in Web Workers to keep the main thread responsive; under Node the same engines run via a `worker_threads` host (`installNodeWorkerHost`, `wasmtex/node`).
- **Communication**: Asynchronous via `postMessage`. A request-response protocol is implemented using unique message IDs.
- **SyncTeX**: A binary parser (`src/synctex/`) processes `.synctex` files for bidirectional PDF ↔ Source navigation.

## Project Structure

```
src/
├── engine/           # WASM engine wrappers, engine selection, compile scheduler, error parsing
├── compat/           # Compatibility classifier (dev harness; not shipped in the bundle)
├── editor/           # Monaco editor setup & LaTeX/BibTeX language definitions
├── viewer/           # PDF.js based viewer and SyncTeX highlighting
├── synctex/          # SyncTeX binary parser & text-mapper fallback
├── lsp/              # Language Service Providers (Rename, Refs, Hover, etc.)
├── fs/               # Virtual filesystem (VirtualFS)
├── ui/               # Editor-marker helpers (error markers, range clamping)
├── perf/             # Performance tracking & debug overlay
├── index.ts          # SDK entry point — `wasmtex` (barrel export)
├── wasmtex.ts        # SDK main class (orchestrator)
├── component-types.ts# `WasmTexOptions` / `WasmTexEventMap` (UI component types)
├── headless.ts       # Headless compiler entry — `wasmtex/headless`
├── node.ts           # Node (server) entry — `wasmtex/node` (`installNodeWorkerHost`)
├── lsp-service.ts    # LSP core entry — `wasmtex/lsp`
├── lsp-monaco.ts     # Monaco LSP adapter — `wasmtex/lsp/monaco`
├── lsp-server.ts     # JSON-RPC LSP server — `wasmtex/lsp/server`
├── types.ts          # Shared public types
└── main.ts           # Standalone IDE entry point (index.html)

wasm-build/           # C/C++ source and Docker pipeline for pdfTeX WASM
scripts/              # Build and setup scripts
e2e/                  # Playwright integration tests
```

## Headless / UI split

The compile core is decoupled from the editor so it can run with no DOM:

- **`WasmTexCompiler`** (`src/headless.ts`, entry `wasmtex/headless`) is the headless
  core — feed it files + an engine and it returns a `CompileResult` (PDF, log, SyncTeX).
  The full browser component `WasmTex` (`src/wasmtex.ts`) layers Monaco, the viewer,
  and the LSP on top of the same engines.
- The **same** WASM engines run off-browser under Node via `installNodeWorkerHost`
  (`wasmtex/node`, `src/engine/node-host.ts`), a `worker_threads` host adapter. Output
  is byte-identical across hosts (covered by `src/engine/cross-host-parity.smoke.test.ts`
  for pdfLaTeX, LuaLaTeX, XeLaTeX, and BibTeX).

### Pluggable per-stage backends

A compile is a pipeline of stages (TeX pass, bibliography, index, …). Each stage resolves
through a `BackendRegistry` (`src/engine/backend-registry.ts`); the default for every
stage is **client/local** (WASM/TS), so nothing leaves the device. Pass a registry via the
`backends` option on `WasmTexCompilerOptions` to re-route a stage to a **server** backend:

```ts
import { WasmTexCompiler, BackendRegistry, createBiberBackend, BIBER_STAGE } from 'wasmtex/headless'

const backends = new BackendRegistry()
backends.register(BIBER_STAGE, createBiberBackend({ endpoint: '/api/biber' }))
const compiler = new WasmTexCompiler({ engine: 'pdflatex', files, backends })
```

Bibliography has two typed slots: `BIBTEX_STAGE` receives `{ aux, bibFiles }`, while
`BIBER_STAGE` receives `{ bcf, bibFiles }`. The registry rejects a backend whose declared
stage does not match its slot, preventing a Biber endpoint from receiving a classic BibTeX
request. With no registry the client BibTeX/biblatex-lite paths are unchanged.
`createBiberBackend` and `createXindyBackend` are server-first backends for full
biblatex/Biber and xindy; the compiler auto-routes both bibliography slots and the `index`
slot. Wrap any backend with `withCache`
(`src/engine/content-cache.ts`) to dedupe identical work. See
[Execution Model](execution-model.md) and [Bibliography Backends](bibliography.md).

## Tech Stack

- **Frontend**: Vanilla TypeScript + Vite (No framework).
- **Editor**: Monaco Editor with custom LSP implementation.
- **Engine**: pdfTeX 1.40.28 and BibTeX (WASM), from TeX Live 2025. The engine is
  auto-selected per document (pdfLaTeX / XeLaTeX / LuaLaTeX); see the
  [multi-engine support guide](engine.md#multi-engine-support-xelatex--lualatex) for routing details.
- **Viewer**: PDF.js.
- **Build/Lint**: Vite, Biome.
- **Testing**: Vitest, Playwright.

## LSP Implementation Details

### Parser & tokenizer
Language features are backed by a small, error-tolerant LaTeX parser:

- **`src/lsp/latex-tokenizer.ts`** — `tokenize(source): Token[]` is a catcode-aware
  lexer. It models the catcodes that matter for source intelligence — control
  sequences, group braces `{}`, math toggles (`$`, `$$`, `\(`, `\[`), comments,
  macro parameters (`#1`), and verbatim regions (inline `\verb`, and verbatim-like
  environment bodies). Every `Token` carries an absolute offset plus a 1-based
  line/column, and the tokenizer never throws on malformed input.
- **`src/lsp/latex-parser.ts`** — `parseLatexFile(content, filePath): FileSymbols`
  tokenizes, then **masks** regions that must not be interpreted (comments, inline
  `\verb`, verbatim environment bodies, and the false branch of
  `\iffalse`/`\iftrue`…`\fi`) by blanking them while preserving newlines, so
  positions stay exact. Symbols are then extracted over the whole masked text, so
  **multi-line arguments** work and commented/verbatim content is ignored.
  User macros that wrap `\label`/`\ref`/`\cite` (e.g. `\newcommand{\fig}[1]{\label{#1}}`)
  are **shallow-expanded** (bounded depth, cycle-guarded) so the symbols they
  generate are indexed at their call sites.

### Project Index
`ProjectIndex` maintains a global state of symbols (labels, citations, commands) across all files in the `VirtualFS`. It is updated on every keystroke (debounced). Updates are **incremental** — only the edited file is re-parsed — and per-name lookups (`findLabelDef`, `getAllLabelRefs`, `findAllOccurrences`, …) are backed by **inverted indexes**, so a query is O(result) rather than a full-project scan.

### Rename (F2)
Rename functionality uses `ProjectIndex.findAllOccurrences()` to find symbols in both `.tex` and `.bib` files. It handles:
- `\label` ↔ `\ref`
- `@article{key}` in `.bib` ↔ `\cite{key}` in `.tex`
- `\newcommand{\cmd}` ↔ `\cmd` usages

Cross-file rename edits are reported to the host via the `workspaceEdit` event.

### Cross-File Navigation
Go-to-definition and references can target locations in other project files. When this happens, WasmTex switches the active file internally and emits a `fileOpen` event so the host can update its UI (file tabs, collaboration bindings, etc.).

### Diagnostics
Project diagnostics are computed by `computeDiagnostics()` (in
`src/lsp/diagnostic-provider.ts`) by cross-referencing the `ProjectIndex`. For
example, it flags `\ref{key}` if `key` does not exist in any loaded file. The
ChkTeX-style source linter is cached per `.tex` file: `updateFile()` re-lints
only changed source bytes, while `getDiagnostics()` combines those cached
results with the current project-index diagnostics.

### BibTeX / `.bib` parsing
`src/lsp/bib-parser.ts` is a robust BibTeX/biblatex parser: all entry types, brace- and quote-delimited values with nested braces, multi-line values, `#` string concatenation, `@string` macro expansion, `@preamble`/`@comment`, and `crossref`/`xdata` field inheritance. Parsed entries expose `title`, `author`, `year`, `journal` (venue), and a full `fields` map. `formatReference()` renders the citation hover preview; the `unused-bib-entry` diagnostic (for any entry never cited) is emitted by `computeDiagnostics()` in `src/lsp/diagnostic-provider.ts`.

### Package-aware command intelligence
`src/lsp/completion-context.ts` parses the complete active command invocation at the cursor instead of matching one line with a command-specific regular expression. It tolerates unfinished input, masks comments and verbatim regions through the shared tokenizer, understands multiline/nested required and optional groups, comma lists, and key/value positions, and returns an exact edit range plus sibling resource selectors. `src/lsp/completion-registry.ts` dispatches that context to typed, host-neutral value-domain resolvers; a service owns an isolated registry and adapters forward cancellation. Monaco and JSON-RPC therefore share the same analysis and candidates.

`src/lsp/package-db.ts` derives argument signatures (required vs optional, with placeholders) from the bundled command snippets and reports each command's source package. Structural commands and package shards may additionally type arguments as class/package resources, labels, citations, files, colors, key/value families, and other semantic domains. Completion is **package-aware**: commands from packages loaded via `\usepackage` (and the LaTeX kernel) rank first, while commands from packages not loaded are still offered but ranked lower and annotated with the `\usepackage{X}` they need. Hover shows the argument signature plus the source package; `getCommandSignature()` feeds signature help and completion context analysis.

### Exact TeX Live resource catalogs

`scripts/lib/texlive-catalog.mjs` deterministically derives class (`.cls`), package
(`.sty`), BibTeX (`.bst`), biblatex (`.bbx`/`.cbx`/`.lbx`), and supported font-file
shards from the final flattened mirror provenance manifest. The manifest's file
inventory determines an immutable `mirrorRevision`; catalogs are published under
`catalog/<mirrorRevision>/` and carry the TeX Live year, source package, selected
source path, hashes, collision decision, and known engine constraint for every
record. The checker regenerates the expected bytes and rejects missing, extra,
reordered, or altered records.

`src/lsp/resource-catalog.ts` keeps transport outside the completion core. A host
injects a profile-bound provider; the HTTP implementation lazily fetches hashed
shards, accepts a pluggable offline store, deduplicates concurrent loads, and rejects
schema or profile mismatches. Until a shard is ready the neutral result explicitly
sets `isIncomplete`. Without a matching provider, only project-local resources are
offered—there is no guessed mirror fallback. Project files are ranked first and
shadow same-named mirror entries. The same registry feeds Monaco, the neutral API,
and JSON-RPC LSP.

### Typed class/package semantic shards

Resource existence and resource semantics are separate immutable layers.
`scripts/lib/tex-semantic-extractor.mjs` reads the exact mirrored `.cls`/`.sty`
bytes and extracts legacy `DeclareOption`, kvoptions, `define@key`, l3/modern key
declarations, pgfkeys, and xparse command/environment signatures with balanced-group
parsing. It also extracts package/project color declarations; the xcolor shard reads
the selected mirror's `dvipsnam.def`, `svgnam.def`, and `x11nam.def` bytes and records
their activating package/class options. Starred palette options remain deferred until
the project activates individual names with `definecolors` or `providecolors`. Dynamic catch-alls are reported as unsupported instead of silently treated
as complete. An optional observed report comes from the bounded, network-isolated
probe contract; `scripts/tex-semantic-overrides-<year>.json` supplies MIT,
WasmTex-authored high-value corrections. Every record retains declared, observed,
inferred, or override provenance plus confidence.

The deterministic generator emits `semantic/<mirrorRevision>/{classes,packages}/`
shards, an index, and a coverage report that separates exact, declared, observed,
inferred, overridden, and unresolved metadata. Overrides are applied only when the
matching resource exists in the final mirror. Golden and regeneration checks reject
source, schema, provenance, or output drift.

At runtime `src/lsp/semantic-catalog.ts` lazily loads profile-matched shards. The
key/value resolver uses the class or package selector—even when it follows the
optional argument—merges multiple selected package scopes, removes already-used
non-repeatable keys, inserts either a flag or `key=` snippet, and dispatches value
positions to enum, boolean, color, file, command, bibliography, font, and other typed
domains. Free-form/unknown values stay editable; this metadata is completion evidence,
not a validator.

The first-class color resolver combines active semantic shards, class/package options,
and `definecolor`/`providecolor`/`colorlet`/`definecolorset` declarations from the
current include graph. Later definitions deterministically replace earlier ones while
`providecolor` never clobbers an existing name. Direct color commands and color-valued
keys share the resolver. In an xcolor mix such as `red!50!blue`, only the color-name
segment at the cursor is replaced. Neutral candidates carry optional structured color
preview and provenance data that JSON-RPC and Monaco adapters preserve.

**Data & licensing.** The command database is wasmtex-authored (the snippet DB in `src/lsp/latex-commands.ts`); we intentionally do **not** bundle the GPL-licensed CWL corpus, so there are no redistribution constraints. Signatures are computed deterministically from those snippets (`parseSignature`), so the dataset is reproducible from source — no opaque generated blob. For the long tail beyond the bundled core, `src/lsp/package-shard-loader.ts` remains a backward-compatible host-supplied command-shard loader. Exact release semantics use the profile-bound semantic catalog above; neither path imports an external completion corpus.
