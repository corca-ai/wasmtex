# Execution Model — Client / Server Hybrid

> **TL;DR** — There is **one from-source, deterministic engine**, and it runs
> **byte-identically on any host**: a browser, a JS server runtime, or a standalone
> WASM runtime. The default is **100% client** (privacy, $0 backend, zero-latency).
> A server is an **opt-in escape hatch** the *integrator* wires up for the client's
> weak spots — never a requirement, never the default. The client/server boundary is
> **chosen by the consumer**, not baked into the library.

## Why the boundary can move

The property that makes this work is **from-source + determinism**. Because the
engine is built from pinned source and outputs are content-addressed, the **same
WASM engine produces identical output wherever it runs**. So:

- "Where *can* a module run?" is the wrong question — it can run anywhere.
- The real axes are **latency · privacy · cost · device capability**, decided *per task*.
- Because output is identical, the boundary is **fluid**: work done on one side is
  reusable by the other (a shared content-addressed cache).

The rule that keeps the model honest: **the client-only default must stay fully
intact.** Server routing exists for the client's weak spots, not as an easier
default — the privacy / $0-backend / zero-latency properties are the whole point
of the client path.

## "Server" is a deployment side, not a runtime

The engine is **host-agnostic WASM**. It asks its host for exactly three things — the
**host port**:

1. **File I/O** — a filesystem (MEMFS in the browser; real or in-memory FS on a server).
2. **File resolution / fetch** — the `kpse_find_file` hook (sync XHR → CDN in the browser;
   `fetch` or a local TeX Live mirror on a server).
3. **Scheduling / threading** — a Web Worker in the browser; `worker_threads` or a
   synchronous call on a server.

Given that abstraction, "server" is just *another host adapter*:

| Host | Adapter |
|---|---|
| Browser | Web Worker + XHR/fetch→CDN + MEMFS |
| Node | `installNodeWorkerHost` (`wasmtex/node`): reuses the JS glue over `worker_threads` + `fs`/`fetch` shims |
| Other JS runtimes (Deno / Bun) | same approach — reuse the JS glue with that runtime's shims |
| Standalone WASM runtime (Wasmtime / Wasmer / WasmEdge) or a WASI host | a runtime-neutral host port — an additional adapter, not a rewrite |
| Embedded in another language (Python / Go / Rust) | a host port via that runtime's WASM API |

The browser and Node adapters ship today. The engine is **not** JavaScript-bound:
keeping the host port runtime-neutral is what lets the same artifact run under a
standalone WASM runtime with no rewrite.

## The five principles

1. **Same-execution first.** Maximize the modules that run byte-identically on any host
   (the host-agnostic WASM engine). This is the default and the goal.
2. **Dedicated only when unavoidable.** Judge by the **host capabilities** a module
   needs — DOM, in-process JS, filesystem, network — not by "client vs server". A
   client-only or server-only module must justify itself. (Example: a LuaTeX
   JS⇄TeX bridge needs an *in-process JS host* → works in a browser **and** Node,
   but not a pure-WASI host.)
3. **The integrator chooses the boundary.** Every offloadable stage is exposed through a
   **pluggable backend**; the default registry is all-client. The consumer routes
   individual stages (a bibliography pass, an index pass, a full compile) to a server
   **if and only if they choose to**.
4. **Core is headless; UI is demo.** The core (`wasmtex/headless`, engine, LSP) is
   fully headless and has no DOM dependency. The editor UI and the demo app live
   **outside** the core and consume only the public API. UI-component types
   (`WasmTexOptions`/`WasmTexEventMap`, which reference `monaco-editor`) live in
   `src/component-types.ts`, not the core `src/types.ts`. **Enforced** by
   `src/headless-boundary.test.ts` — the `wasmtex/headless`, `wasmtex/lsp`, and
   `wasmtex/lsp/server` import graphs must not reach `monaco-editor` or any
   `editor`/`ui`/`viewer` module.
5. **⭐ The verification environment is the most important thing.** Cross-host output
   parity + perf-degradation guards are the contract that makes the fluid boundary
   trustworthy. If client and server can silently diverge, the whole model breaks —
   which is why the fail-loud build interposition guards and the golden-output suite
   are foundational, not optional.

## What runs where (maximize strengths)

| Work | Where | Why |
|---|---|---|
| Interactive / incremental recompile (keystroke → PDF) | **always client** | the interactive loop is the product; it never leaves the device |
| Editor, LSP, preview render | client | UI-host work |
| Standard pdf/xe/lua compile | **either** (default client) | host-agnostic engine; integrator may offload cold/huge compiles |
| makeindex, bibtex / bibtex8 | **either** (default client) | small C tools; tractable both sides |
| **Biber, xindy** | **server (recommended), client optional later** | Perl / Lisp runtimes — the client's weakest spot; not in the hot loop; deterministic ⇒ ideal offload |
| Cold first compile of a big document | server → client handoff | "cold on server, warm on client" |
| Content-addressed cache warming, format/package precompute | server / build service | deterministic, non-sensitive artifacts only ⇒ privacy-safe |
| Export backends (tagged PDF/UA, HTML, ePub) | server (optional) | heavy / batch |
| Bulk headless: CI, autograding, SSR | server = the library on a host | the client isn't in the picture |

## The determinism contract (the precondition)

The fluid boundary only works if client and server output is reproducible:

- **From-source + pinned upstream ref** — same engine bytes everywhere; the
  [upstream maintenance guide](texlive-upgrade.md#upstream-maintenance-interpose-dont-patch) describes this pinning.
- **Fail-loud interposition** — drift in the build is a located error, not a
  silent divergence; the
  [upstream maintenance guide](texlive-upgrade.md#upstream-maintenance-interpose-dont-patch) documents the build guards.
- **Golden-output + cross-host parity tests** — assert client ≡ server output, per
  engine and tool. The parity smoke test
  (`src/engine/cross-host-parity.smoke.test.ts`, opt-in via `CROSS_HOST_PARITY=1`)
  compiles the golden corpus under the Node host (`installNodeWorkerHost`,
  `wasmtex/node`) and asserts the structural signature matches the browser golden
  for **pdfLaTeX, LuaLaTeX, XeLaTeX, and BibTeX** — all three engines run under
  Node verbatim.
- **Content-addressing** — `(sources + deps)` hash keys artifacts so either side can
  populate a shared cache.

Break this contract and a server result will not match a client result — so the
verification environment (principle 5) gates everything else.

## How a consumer chooses the boundary

The mechanism is **pluggable per-stage backends**, generalizing the existing
`BibliographyBackend` ([bibliography.md](bibliography.md)):

- A stage (engine pass, bibtex/biber, makeindex/xindy, export) resolves through a
  `ToolBackend` held in a `BackendRegistry` (`src/engine/backend-registry.ts`).
- The **default backend is client/WASM** — nothing leaves the device. `registry.resolve`
  returns the integrator's override or the client default, and `registry.isRemote(stage)`
  reports whether a stage is currently routed off-device.
- The integrator may register a **server backend** (`createRemoteBackend`, `location:
  'server'`) for a stage: it POSTs the stage request to *their* endpoint (which runs the
  same headless engine), tagging it with an `x-wasmtex-stage` header and an optional
  `x-wasmtex-cache-key` header so the endpoint / a shared cache can dedupe. The ready-made
  text-artifact helpers `createBiberBackend` and `createXindyBackend` are thin wrappers over
  `createJsonTextBackend`.
- Privacy is preserved by construction: a remote backend only sees what the integrator
  routes to it, and only when they wire one up.

**Wired today.** `WasmTexCompiler` takes an optional `backends?: BackendRegistry`. The
**bibliography** stage (classic BibTeX, stage name `BIBLIOGRAPHY_STAGE = 'bibliography'`)
resolves through it: register a server backend for that stage (request `{ aux, bibFiles }`
→ `.bbl`, see `BibliographyStageRequest`) and the compiler offloads that pass and skips the
client BibTeX engine entirely; leave it unregistered and the bundled client BibTeX runs
exactly as before. The backend toolkit (`BackendRegistry`, `createRemoteBackend`,
`createJsonTextBackend`, `BIBLIOGRAPHY_STAGE`, `withCache`, `MemoryCacheStore`, `contentKey`)
is re-exported from `wasmtex/headless`:

```ts
import {
  WasmTexCompiler, BackendRegistry, createJsonTextBackend, BIBLIOGRAPHY_STAGE,
  withCache, MemoryCacheStore, type BibliographyStageRequest,
} from 'wasmtex/headless'

const cache = new MemoryCacheStore()
const registry = new BackendRegistry()
// Offload the classic-BibTeX bibliography pass ({ aux, bibFiles } → .bbl) to an endpoint
// running the same engine, and cache the result. The endpoint receives the request as
// JSON tagged with the `x-wasmtex-stage` header and returns the `.bbl` as text.
registry.register(BIBLIOGRAPHY_STAGE, withCache(
  createJsonTextBackend<BibliographyStageRequest>({
    id: 'bibtex-remote', stage: BIBLIOGRAPHY_STAGE,
    endpoint: 'https://my-host/latex/bibliography',
  }),
  cache,
))
const compiler = new WasmTexCompiler({ files, backends: registry })
```

`withCache` wraps any string-producing backend for the shared content-addressed cache.
Store keys are produced by `backendCacheKey`: the stage, backend id/version, backend options,
and request content are all namespaced, so two tools cannot reuse each other's artifact.
Supplying a backend `version` is recommended whenever a deployment upgrade can change output.
The compiler auto-routes the `bibliography` **and
`index`** stages: `\printindex` runs client-side via the bundled makeindex WASM by default,
and a registered `index` backend (`createMakeindexBackend` / `createXindyBackend`) offloads
it. The biber (`.bcf`-based `BiberRequest`, `createBiberBackend`) biblatex flow and the
engine-pass stages expose the same backend seam but are not yet auto-routed by the
compiler.

## Guardrails

- **Client-first default is non-negotiable.** No server dependency in the default path.
- **The determinism contract is load-bearing.** No shipping a boundary feature without
  the cross-host parity gate.
- **Privacy boundary.** Never route the document body to a server implicitly; offload only
  deterministic / non-sensitive sub-tasks, or within the integrator's own trust boundary,
  and only on explicit opt-in.
- **One engine, two hosts — not two engines.** The from-source advantage is that the
  server path is the *same* engine under a different host adapter, not a parallel
  implementation.
