# Bibliography backends (biblatex + Biber)

WasmTex supports two bibliography toolchains through a **pluggable backend**
interface, selected automatically from the document.

## Detection

`detectBibliographyMode(source)` returns:

| Mode | Triggered by | Handled by |
|------|--------------|------------|
| `bibtex` | `\bibliography`, `\bibliographystyle`, `thebibliography` | bundled **BibTeX WASM engine** (`bibtex-engine.ts`) — the legacy path, unchanged |
| `biblatex` | `\usepackage[...]{biblatex}` | a registered `BibliographyBackend` (default: the bundled **biblatex-lite**) |
| `none` | no bibliography | — |

For biblatex, `detectBiblatexBackend(source)` reads the `backend=` option
(`biber` default, or `bibtex`).

All of these are exported from both `wasmtex` and `wasmtex/headless`.

## Decision spike

biblatex's default engine is **Biber** (a Perl program); the existing BibTeX
engine can't produce biblatex's `.bbl`. Three options were considered:

1. **Biber → WASM** — highest fidelity (full biber: sorting, filters, Unicode,
   `crossref`/`xdata`). But Biber is Perl + Text::BibTeX (the C `btparse`) + a
   large CPAN tree — intractable to ship to WASM.
2. **biblatex-lite (JS/TS)** — implement the common path natively (cite
   collection, sorting, the core fields, `.bbl` generation). **No Perl, tiny**,
   reuses the project's robust `.bib` parser. Lower fidelity: covers the
   numeric/author-year subset, not the full biber feature set.
3. **Pluggable backend interface** — define backends so either of the above (or
   a host-provided backend) can be slotted in.

**Decision.** Ship **option 3 (pluggable interface)** with **option 2
(biblatex-lite)** as the bundled, zero-download client default that covers the
common case. Because Biber is deterministic and not in the hot interactive loop,
**option 1 ships as a *server* backend** (`createBiberBackend`), not a deferred
WASM artifact — an integrator points it at an endpoint running real Biber for
full fidelity. The classic BibTeX path is untouched, so legacy documents are
unaffected.

The headless `WasmTexCompiler` **drives this automatically**: when it detects
a biblatex document it reads the `.bcf` the first LaTeX pass emitted, runs a
registered server Biber backend (or biblatex-lite by default), injects the
`.bbl`, and reruns — you don't hand-wire it (see *Server backends* below). The
low-level primitives are exported for custom (non-headless) hosts:

```ts
import {
  generateBiblatexBbl,
  selectBiblatexBackend,
  type BibliographyBackend,
} from 'wasmtex'

// Manual sketch (only for a host NOT using WasmTexCompiler's auto-routing):
// generate the .bbl from the parsed .bib entries + cited keys and write it next to the .tex.
const backend: BibliographyBackend = selectBiblatexBackend(/* [hostBackend], 'host-id' */)
const bbl = backend.generateBbl({ entries, citedKeys, sort: 'nty' })
compiler.setFile('main.bbl', bbl)
```

`selectBiblatexBackend(backends?, preferredId?)` returns the backend whose `id`
matches `preferredId`, else the first supplied backend, else the bundled
`biblatexLiteBackend`. `generateBiblatexBbl` is that backend's `generateBbl`.

## Supported subset (biblatex-lite)

- Entry filtering to cited keys (`\cite`/`\nocite` order).
- Sorting: `nty` (name/title/year) or `none` (cite order).
- Core fields: author (parsed into `family`/`given` name parts), title, year,
  journal.

Full biblatex fidelity — every field, name-disambiguation hashes,
`sortinit`/locale collation, and the complete style set — is the **server Biber
backend's** job (see below).

## Server backends (per-stage offload)

The bibliography pass is one stage of a compile pipeline routed through a
per-stage `BackendRegistry`. The default for every stage is **client/local**, so
nothing leaves the device. Pass a registry as the `backends` option to
`WasmTexCompiler` (`wasmtex/headless`) to offload a stage to an endpoint
running the same deterministic engine; any unregistered stage stays on the
client default.

Two distinct request shapes flow off-device, both file-level:

- **Server BibTeX** — the classic `\bibliography` flow. The headless compiler
  routes it through `runRemoteBibliography` under the `BIBLIOGRAPHY_STAGE`
  (`'bibliography'`) stage. The server backend receives a
  `BibliographyStageRequest` (`{ aux, bibFiles }` — the first pass's `.aux` plus
  the `.bib` databases) and returns the `.bbl`; the client BibTeX (WASM) engine
  is then skipped. With no registry, the client BibTeX engine runs, unchanged.
- **Server Biber** — full biblatex fidelity. `createBiberBackend({ endpoint })`
  builds a server backend for the same `bibliography` stage that consumes a
  `BiberRequest` (`{ bcf, bibFiles }` — the `.bcf` control file plus the `.bib`s)
  and returns the `.bbl`. The compiler auto-routes here for a biblatex +
  `backend=biber` document: it reads the `.bcf`, calls `runRemoteBiber`, injects
  the returned `.bbl`, and reruns — so **registering the backend is all you do**.
  With no registry, biblatex-lite runs on-device, unchanged.

```ts
import {
  BackendRegistry,
  BIBLIOGRAPHY_STAGE,
  createBiberBackend,
  WasmTexCompiler,
  MemoryCacheStore,
  withCache,
} from 'wasmtex/headless'

const backends = new BackendRegistry()
// Full-fidelity Biber, with a content-addressed cache so identical runs are free.
backends.register(
  BIBLIOGRAPHY_STAGE,
  withCache(createBiberBackend({ endpoint: '/api/biber' }), new MemoryCacheStore()),
)

const compiler = new WasmTexCompiler({ backends })
```

A server backend's output is reproducible (same deterministic engine, browser or
server), so it is content-addressable: `withCache` (`content-cache.ts`) keys the
`.bbl` by a hash of its inputs and reuses it anywhere. Each server request also
carries an `x-wasmtex-cache-key` header for a shared cache. `createBiberBackend`
takes an optional `cacheKey(request)` for a custom key; the same registry seam
also serves the index stage. The compiler auto-routes `index` too — `\printindex`
runs client-side via the bundled makeindex WASM by default, and a registered
`createMakeindexBackend` / `createXindyBackend` offloads it (see
[execution model](execution-model.md#how-a-consumer-chooses-the-boundary)).

## Related

- [docs/engine.md](engine.md) — WASM engine + the BibTeX worker.
- The `.bib` parser these backends share: see *BibTeX / `.bib` parsing* in
  [docs/architecture.md](architecture.md).
