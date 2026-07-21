# Execution Model — Client / Server Hybrid

> **TL;DR** — There is **one from-source, deterministic engine**, and it runs
> **byte-identically on any host**: a browser, a JS server runtime, or a standalone
> WASM runtime. The default is **100% client** (privacy, $0 backend, zero-latency).
> A server is an **opt-in escape hatch** the *integrator* wires up for the client's
> weak spots — never a requirement, never the default. The client/server boundary is
> **chosen by the consumer**, not baked into the library.

Tracking epic: [#107](https://github.com/corca-ai/wasmtex/issues/107).

## Why a hybrid is sound (and a moat, not a betrayal)

Our real asymmetric advantage is not "browser" — it is **from-source + determinism**.
Because we build the engine from source, pin the upstream ref, and content-address
outputs, the **same WASM engine produces identical output wherever it runs**. So:

- "Where *can* a module run?" is the wrong question — it can run anywhere.
- The real axes are **latency · privacy · cost · device capability**, decided *per task*.
- Because output is identical, the boundary is **fluid**: work done on one side is
  reusable by the other (a shared content-addressed cache).

No competitor has this. Overleaf is server-only — it cannot do zero-latency, in-process,
client compilation. Browser tools based on externally prebuilt engines cannot run *the
same engine* server-side and get identical output. **Only a from-source engine can slide the
boundary** — so the hybrid itself is part of the moat.

The hard rule that keeps it a moat: **the client-only default must stay fully intact.**
The moment "server mode" becomes the easy default, we have rebuilt Overleaf and lost the
privacy / $0 / zero-latency differentiation that is the whole point.

## "Server" is a deployment side, not a runtime

The engine is **host-agnostic WASM**. It asks its host for exactly three things — the
**host port**:

1. **File I/O** — a filesystem (MEMFS in the browser; real or in-memory FS on a server).
2. **File resolution / fetch** — the `kpse_find_file` hook (sync XHR → CDN in the browser;
   `fetch` or a local TeX Live mirror on a server).
3. **Scheduling / threading** — a Web Worker in the browser; `worker_threads` or a
   synchronous call on a server.

Given that abstraction, "server" is just *another host adapter*:

| Host | Adapter | Status |
|---|---|---|
| Browser | Web Worker + XHR/fetch→CDN + MEMFS | shipped |
| JS server runtime (Node / Deno / Bun) | reuse the JS glue + `fs`/`fetch` + `worker_threads`/sync shims | **Node shipped** (`installNodeWorkerHost`, `wasmtex/node`); Deno/Bun next |
| Standalone WASM runtime (Wasmtime / Wasmer / WasmEdge) or a WASI host | runtime-neutral host port | later adapter, not a rewrite |
| Embedded in another language (Python / Go / Rust) | host port via that runtime's WASM API | later |

The first server adapter is a JS runtime because it can **reuse the existing JS glue** —
but the engine is **not** JavaScript-bound. Keeping the host port runtime-neutral is what
lets the same artifact later run under a standalone WASM runtime with no rewrite.

## The five principles

1. **Same-execution first.** Maximize the modules that run byte-identically on any host
   (the host-agnostic WASM engine). This is the default and the goal.
2. **Dedicated only when unavoidable.** Judge by the **host capabilities** a module
   needs — DOM, in-process JS, filesystem, network — not by "client vs server". A
   client-only or server-only module must justify itself. (Example: the LuaTeX
   [JS⇄TeX bridge](https://github.com/corca-ai/wasmtex/issues/57) needs an *in-process
   JS host* → works in a browser **and** Node, but not a pure-WASI host.)
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
   trustworthy. If client and server can silently diverge, the whole model breaks. This
   is why [#50](https://github.com/corca-ai/wasmtex/issues/50) (fail-loud interposition)
   and [#51](https://github.com/corca-ai/wasmtex/issues/51) (golden output) are
   foundational, not optional.

## What runs where (maximize strengths)

| Work | Where | Why |
|---|---|---|
| Interactive / incremental recompile (keystroke → PDF) | **always client** | this is the moat — moving it server-side = becoming Overleaf |
| Editor, LSP, preview render | client | already a strength; UI-host |
| Standard pdf/xe/lua compile | **either** (default client) | host-agnostic engine; integrator may offload cold/huge compiles |
| makeindex, bibtex / bibtex8 | **either** (default client) | small C tools; tractable both sides |
| **Biber, xindy** | **server (recommended), client optional later** | Perl / Lisp runtimes — the client's weakest spot; not in the hot loop; deterministic ⇒ ideal offload |
| Cold first compile of a big document | server → client handoff | "cold on server, warm on client" |
| Content-addressed cache warming, format/package precompute | server / build service | deterministic, non-sensitive artifacts only ⇒ privacy-safe |
| Export backends (tagged PDF/UA, HTML, ePub) | server (optional) | heavy / batch |
| Bulk headless: CI, autograding, SSR | server = the library on a host | the client isn't in the picture |

## The determinism contract (the precondition)

The fluid boundary only works if client and server output is reproducible:

- **From-source + pinned upstream ref** — same engine bytes everywhere
  ([texlive-upgrade.md](texlive-upgrade.md#upstream-maintenance-interpose-dont-patch)).
- **Fail-loud interposition** — drift in the build is a located error, not a silent
  divergence ([#50](https://github.com/corca-ai/wasmtex/issues/50)).
- **Golden-output + cross-host parity tests** — assert client ≡ server output, per engine
  and tool ([#51](https://github.com/corca-ai/wasmtex/issues/51),
  [S4 #111](https://github.com/corca-ai/wasmtex/issues/111)). The parity smoke test
  (`src/engine/cross-host-parity.smoke.test.ts`, opt-in via `CROSS_HOST_PARITY=1`) compiles
  the golden corpus under the Node host (`installNodeWorkerHost`, `wasmtex/node`) and
  asserts the structural signature matches the browser golden for **pdfLaTeX, LuaLaTeX,
  XeLaTeX, and BibTeX** — all three engines run under Node verbatim.
- **Content-addressing** — `(sources + deps)` hash keys artifacts so either side can
  populate a shared cache ([S5 #112](https://github.com/corca-ai/wasmtex/issues/112)).

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

`withCache` wraps any string-producing backend for the shared content-addressed cache
(`CacheStore`, keyed by `contentKey`). The compiler auto-routes the `bibliography` **and
`index`** stages: `\printindex` runs client-side via the bundled makeindex WASM by default,
and a registered `index` backend (`createMakeindexBackend` / `createXindyBackend`) offloads
it. The biber (`.bcf`-based `BiberRequest`, `createBiberBackend`) biblatex flow and the
engine-pass stages expose the same backend seam but are not yet auto-routed by the compiler
— that wiring is the remaining work in the epic.

See the epic ([#107](https://github.com/corca-ai/wasmtex/issues/107)) for the structural
work (host port, backend interface, verification env) and per-module tracking.

## Guardrails (violate these and the moat erodes)

- **Client-first default is non-negotiable.** No server dependency in the default path.
- **The determinism contract is load-bearing.** No shipping a boundary feature without the
  parity gate (S4).
- **Privacy boundary.** Never route the document body to a server implicitly; offload only
  deterministic / non-sensitive sub-tasks, or within the integrator's own trust boundary,
  and only on explicit opt-in.
- **One engine, two hosts — not two engines.** The from-source advantage is that the
  server path is the *same* engine under a different host adapter, not a parallel
  implementation.
