# Execution Model — Client / Server Hybrid

WasmTex's architecture uses one from-source engine family on different hosts,
with a client-first default and an integrator-chosen server boundary. Browser
and Node adapters ship today. This guide distinguishes those implementations
from future host adapters and stage-routing possibilities.

## Supported hosts

| Host | Shipped implementation |
| --- | --- |
| Browser | Web Workers, Emscripten JS glue, MEMFS, fetch and synchronous XHR for unresolved TeX Live files. |
| Node 24+ | `installNodeWorkerHost` from `wasmtex/node`, using `worker_threads`, local engine assets and browser-global shims. Worker synchronous network lookup uses curl, which must be installed. |

Both run the same released JS/WASM/controller files. Node does not replace the
engine filesystem with a native TeX installation. Its adapter maps asset URLs
to a local directory and leaves package resolution on the configured mirror.
Dispose compilers before disposing the global host installation.
See the [Node integration recipe](howto.md#server-side-compilation-node).

Deno/Bun, standalone WASI runtimes and Python/Go/Rust embeddings have no shipped
host adapter here. The current artifact imports Emscripten/JavaScript facilities;
it is not a drop-in WASI binary. Supporting another runtime requires an adapter
and equivalent compatibility tests. Host independence is the architectural
boundary to preserve, not a claim that every runtime is already supported.

## Headless and UI boundaries

`WasmTexCompiler` (`wasmtex/headless`) owns compilation without a DOM, Monaco or
PDF.js dependency. `WasmTex` adds the browser editor and viewer. The syntax and
language services can also run without Monaco through their own entry points.
`src/headless-boundary.test.ts` guards these import boundaries.

Keep host-specific scheduling, networking and storage behind adapters. WasmTex
must not depend on an integrator's project schema, repository or deployment.
CorTeX may consume WasmTex; the reverse dependency is forbidden. The
[architecture guide](architecture.md) describes the modules and
[API reference](api.md#entry-points) lists package entry points.

## Pluggable stages available today

`WasmTexCompilerOptions.backends` accepts `BackendRegistry`. The compiler
consults three typed slots:

| Slot | Request / result | Default |
| --- | --- | --- |
| `BIBTEX_STAGE` (`bibliography:bibtex`) | `{ aux, bibFiles }` → `.bbl` text | Bundled BibTeX path. |
| `BIBER_STAGE` (`bibliography:biber`) | `{ bcf, bibFiles }` → `.bbl` text | Local biblatex-lite subset when no remote Biber result is selected. |
| `INDEX_STAGE` (`index`) | Index request → `.ind` text | Bundled makeindex path. |

Biber routing is implemented. Engine-pass and export stages are not automatic
registry routes in the current compiler. A host can run the headless compiler
on its server, but a full-compile offload or server-to-client checkpoint handoff
is not provided by registering another built-in slot.

```ts
import {
  WasmTexCompiler, BackendRegistry, BIBER_STAGE, createBiberBackend,
} from 'wasmtex/headless'

const backends = new BackendRegistry()
backends.register(BIBER_STAGE, createBiberBackend({ endpoint: '/api/biber' }))
const compiler = new WasmTexCompiler({ files, backends })
```

The registry checks that a backend's declared stage matches its slot. The
ready-made remote helpers POST to an integrator-owned endpoint; WasmTex does
not deploy that service. `withCache` can wrap string-producing backends with
keys that include stage, backend identity/version/options and request content.
The integrator must update backend identity when changed server inputs can
change output. See [bibliography backends](bibliography.md) and the
[backend API](api.md#server-backends) for payloads and fallback behavior.

## Determinism and verification

The same engine and inputs should preserve compilation semantics across hosts.
Pinned source, toolchain, assets, formats and mirrors are necessary, but do not
by themselves prove byte-identical PDF output: clock-dependent metadata, runtime
behavior and external backend versions also matter.

The cross-host smoke compares Node output to browser structural goldens for
pdfLaTeX, XeLaTeX, LuaLaTeX and BibTeX. Optimization qualification additionally
compares baseline/candidate outputs with the existing narrow metadata
normalization and fixed clocks where required. Structural golden equality is
not a claim that arbitrary raw PDFs are byte-identical on every host.
Use the [development tests](develop.md#cross-host-node-engine-tests) and
[optimization policy](engine-optimization-policy.md) for the exact gates.

Completion snapshots follow the same revision/root/engine/profile identity.
Unsupported observations stay explicit, and completion queries do not trigger
compilation. Raw heap checkpoints remain tied to one engine build and worker;
they are not portable server/client cache artifacts. Format and durable-cache
contracts are described in the [engine guide](engine.md#preamble-snapshots).

## Integrator choices

Interactive compilation defaults to the local engine. A host can choose Node
for batch work or remote bibliography/index services where that suits device
capability, latency, privacy and cost. Remote routing is opt-in; document and
bibliography contents sent to an endpoint are subject to that host's trust boundary.

Client-side compilation still downloads engine/package/font assets and incurs
network latency on cache misses. It does not imply zero network traffic or
complete offline support. Server execution, shared caches and precomputation
need their own measured benefit and compatibility evidence before adoption.
