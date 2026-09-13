# Architecture

`WasmTex` is designed as a **headless-first SDK**. The core logic is decoupled from the UI, allowing it to run as a full IDE or a background compilation service.

The [execution model](execution-model.md) defines the client-first boundary,
shipped browser/Node adapters and cross-host verification limits.

## High-Level Overview

Engine performance changes must follow the [engine optimization policy](engine-optimization-policy.md):
preserve formats, output, and the TeX Live mirror while publishing a separately
identified engine release that existing CorTeX projects can adopt transparently.

```
[ Host Application ]
      ↓
[ WasmTexCompiler (headless) ] or [ WasmTex (browser component) ]
      ├── [ VirtualFS ] (src/fs/virtual-fs.ts) - In-memory file management
      ├── [ LSP Engine ] (src/lsp/) - Completion, Hover, Diagnostics, Rename
      ├── [ Worker Orchestrator ] (src/engine/) - Engine selection + compile scheduling
      │     ├── pdfTeX Worker (WASM) - Default compilation + CDN fetching
      │     ├── XeLaTeX Workers (WASM) - XeTeX + dvipdfmx (fontspec / unicode-math / CJK)
      │     ├── LuaLaTeX Worker (WASM) - LuaHBTeX (writes PDF directly, single worker)
      │     └── BibTeX Worker (WASM) - Bibliography generation
      └── [ UI Components ] (src/editor/, src/viewer/) - WasmTex only; absent from headless imports
```

- **Compile core**: `wasmtex/headless` exports `WasmTexCompiler`; it owns multi-engine orchestration without a UI. The root `wasmtex` entry exports the separate browser `WasmTex` orchestrator. Both reuse engine and filesystem modules.
- **Workers**: in the browser, WASM engines run in Web Workers to keep the main thread responsive; under Node the same engines run via a `worker_threads` host (`installNodeWorkerHost`, `wasmtex/node`).
- **Communication**: Asynchronous via `postMessage`. The worker bridge correlates responses by request ID where available and queues legacy command-keyed waiters.
- **SyncTeX**: A parser (`src/synctex/`) processes SyncTeX text for bidirectional PDF ↔ Source navigation.

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

wasm-build/           # C/C++ glue, tracked patches and Docker builds for every engine family
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
  (`wasmtex/node`, `src/engine/node-host.ts`), a `worker_threads` host adapter. Cross-host structural parity is checked by `src/engine/cross-host-parity.smoke.test.ts`
  for pdfLaTeX, LuaLaTeX, XeLaTeX, and BibTeX; see the execution-model limits.

### Pluggable per-stage backends

The compiler routes bibliography and index stages
through a `BackendRegistry` (`src/engine/backend-registry.ts`); the default for every
stage is **local to the compiler host** (WASM/TS). Package/font downloads still use the configured mirror. Pass a registry via the
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
(`src/engine/content-cache.ts`) to dedupe identical work. See [Execution Model](execution-model.md) and [Bibliography Backends](bibliography.md).

## Tech Stack

- **Frontend**: Vanilla TypeScript + Vite (No framework).
- **Editor**: Monaco Editor with custom LSP implementation.
- **Engine**: versioned pdfTeX/BibTeX, XeTeX/dvipdfmx, and LuaHBTeX WASM lines from
  immutable TeX Live 2025 and 2026 source pins. The engine is
  auto-selected per document (pdfLaTeX / XeLaTeX / LuaLaTeX); see the
  [multi-engine support guide](engine.md#multi-engine-support-xelatex--lualatex) for routing details.
- **Viewer**: PDF.js.
- **Build/Lint**: Vite, Biome.
- **Testing**: Vitest, Playwright.

## Language and syntax services

The syntax service owns source-preserving snapshots and the project index.
Language features consume those snapshots plus profile-bound static and runtime
completion evidence. Monaco and JSON-RPC are adapters over the neutral service.
Read [language service architecture](language-service.md) for parser, indexing,
completion and provenance details; [the API reference](language-api.md#lsp-core) owns the
public interface.
