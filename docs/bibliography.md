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

## Class-generated BibTeX databases

Classic BibTeX receives project `.bib` files and project-relative databases named
by `\bibdata` in the main auxiliary file that the TeX engine generated during
compilation. This includes REVTeX notes and ACS control records. Project files
retain precedence; generated databases remain engine-owned and are not added to
the host project. Both the headless compiler (client or remote BibTeX) and editor
use this collection rule. Generated bibliography outputs conservatively depend
on the project's TeX sources as well as its bibliography and custom style inputs.
Paths outside the virtual project root are never read for this transfer.

## Design

biblatex's default engine is **Biber**. The headless compiler accepts a host-provided
`ToolBackend<BiberRequest, string>` at `BIBER_STAGE`, with either `client` or
`server` location. A host can supply a full Biber WASM runtime; the SDK does not
bundle or download it. The zero-download default remains **biblatex-lite**, a
limited JS/TS implementation of common numeric/author-year bibliography fields.
`createBiberBackend` constructs the optional HTTP backend for a host-owned server.

The classic BibTeX path is independent of both, so `\bibliography` documents
are unaffected.

The headless `WasmTexCompiler` **drives this automatically**: when it detects
a biblatex document it reads the `.bcf` the first LaTeX pass emitted, runs a
registered local or server Biber backend (or biblatex-lite by default), injects the
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
`sortinit`/locale collation, and the complete style set — is the **full Biber
backend's** job (see below).

## Host-provided local Biber

```ts
backends.register(BIBER_STAGE, {
  id: 'host-biber', stage: BIBER_STAGE, location: 'client', version: 'pinned-runtime',
  async run(request, context) {
    return (await localBiber.run(request, { signal: context?.signal })).bbl
  },
})
```

`runBiberBackend` calls the selected backend regardless of location. An absent
backend returns `null` and selects biblatex-lite; a selected backend's errors
propagate without silently changing bibliography implementations. The legacy
`runRemoteBiber` helper remains remote-only. The compiler passes the current
operation's abort signal to Biber. `withCache` forwards it and rejects cancelled
results before caching; the HTTP adapter forwards it to fetch. Hosts must forward
cancellation to their runtime and own its disposal, assets, version compatibility,
and any explicit recovery policy. Other built-in stages retain their existing
remote-only routing and do not yet receive the compiler signal.

## Server backends (per-stage offload)

The bibliography pass is one stage of a compile pipeline routed through a
per-stage `BackendRegistry`. The default for every stage is **client/local**, so
nothing leaves the device. Pass a registry as the `backends` option to
`WasmTexCompiler` (`wasmtex/headless`) to offload a stage to an endpoint
running the same deterministic engine; any unregistered stage stays on the
client default.

Two distinct request shapes flow off-device, both file-level:

- **Server BibTeX** — the classic `\bibliography` flow. The headless compiler
  routes it through `runRemoteBibliography` under `BIBTEX_STAGE`
  (`'bibliography:bibtex'`). The server backend receives a
  `BibliographyStageRequest` (`{ aux, bibFiles }` — the first pass's `.aux` plus
  the `.bib` databases) and returns the `.bbl`; the client BibTeX (WASM) engine
  is then skipped. With no registry, the client BibTeX engine runs, unchanged.
- **Server Biber** — full biblatex fidelity. `createBiberBackend({ endpoint })`
  builds a server backend for the separate `BIBER_STAGE` (`'bibliography:biber'`) that consumes a
  `BiberRequest` (`{ bcf, bibFiles }` — the `.bcf` control file plus the `.bib`s)
  and returns the `.bbl`. The compiler auto-routes here for a biblatex +
  `backend=biber` document: it reads the `.bcf`, calls `runBiberBackend`, injects
  the returned `.bbl`, and reruns — so **registering the backend is all you do**.
  With no registry, biblatex-lite runs on-device, unchanged.

```ts
import {
  BackendRegistry,
  BIBER_STAGE,
  createBiberBackend,
  WasmTexCompiler,
  MemoryCacheStore,
  withCache,
} from 'wasmtex/headless'

const backends = new BackendRegistry()
// Full-fidelity Biber, with a content-addressed cache so identical runs are free.
backends.register(
  BIBER_STAGE,
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
`createMakeindexBackend` / `createXindyBackend` offloads it; the
[execution model](execution-model.md#pluggable-stages-available-today) explains how consumers choose that boundary.

## Related

- [docs/engine.md](engine.md) — WASM engine + the BibTeX worker.
- See the [architecture guide](architecture.md) for the *BibTeX / `.bib` parsing*
  implementation shared by these backends.
