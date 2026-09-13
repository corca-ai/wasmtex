# Development Guide

This guide is for developers contributing to the `wasmtex` codebase.

Before modifying engine internals, build flags, memory handling, or execution
glue for performance, read the [engine optimization policy](engine-optimization-policy.md).
It defines standalone compatibility evidence and the separate integrator adoption boundary.

## Quick Start

```bash
npm install
npm run sync-engine-assets -- --from https://corca-ai.github.io/wasmtex/
npm run dev               # Start dev server
# App: http://localhost:6001
```

## Prerequisites

- **Node.js**: v24+ (`engines.node: ">=24"`).
- **WASM Assets**: Each engine's authored controller (`*.worker.js`), generated module
  (`*.js`), binary (`*.wasm`), and format (`*.fmt`/`*.fmt.gz`) must be present. The
  runtime and CI load them from a per-year subdirectory, `public/wasmtex/<version>/`
  (e.g. `public/wasmtex/2025/`). Use `npm run sync-engine-assets` to fetch a
  hash-verified set. See [docs/engine.md](engine.md).

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server (port 6001) |
| `npm run build` | Production build: typecheck (`tsgo`) + standalone demo app (`vite build`) → `dist/` (GitHub Pages; gitignored) |
| `npm run build:lib` | SDK-only build (`BUILD_MODE=lib`): the nine ES entry points (`wasmtex`, `headless`, `node`, `synctex`, `warmup`, `syntax`, `lsp`, `lsp-monaco`, `lsp-server`) + `wasmtex.css` → **`lib/` (committed)** |
| `npm run check` | Typecheck only (`tsgo --noEmit`) |
| `npm run test` | Unit tests (Vitest, `vitest run`) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run test:package-consumer` | Verify installed package imports, types, UI bundling and missing-file/export rejection in an isolated consumer. |
| `npm run test:golden` / `npm run update:golden` | Golden-output tests (write/refresh `e2e/goldens/*.json`) |
| `npm run lint` / `npm run lint:fix` | Lint source and authored workers (Biome) — check / apply source fixes |
| `npm run format` | Format code (Biome) |
| `npm run gen:texlive-catalog -- --manifest <manifest> --output <dir>` | Generate immutable completion shards from a final `texlive-provenance.json` inventory |
| `npm run check:texlive-catalog -- <manifest> <dir>` | Verify exact catalog coverage, deterministic bytes, hashes, and provenance |
| `npm run check:deployed-completion -- --manifest <manifest> --base-url <url>` | Stream and hash every catalog/semantic source against the deployed TeX Live endpoint |
| `npm run reconcile:deployed-completion -- --manifest <manifest> --mirror-root <dir> --base-url <url> --policy <json>` | Apply only reviewed, hash-pinned CDN absences/hotfixes before immutable catalog generation |
| `npm run gen:tex-semantic-catalog -- --manifest <manifest> --mirror-root <root> --overrides <json> --output <dir>` | Extract and merge versioned class/package semantic shards, including exact option-gated color definitions, plus a coverage report |
| `npm run check:tex-semantic-catalog -- --manifest <manifest> --mirror-root <root> --overrides <json> --catalog <dir>` | Regenerate and reject semantic schema, provenance, source-byte, or golden drift |
| `npm run probe:tex-semantics -- --input <json> --command <probe> --output <json>` | Run an exact-profile probe with fail-closed OS network isolation and bounded time/memory |
| `npm run test:license-tools` | Test provenance, catalog, release, and licensing scripts with Node's test runner |
| `npm run sync-engine-assets -- --from <baseUrl>` | Download and SHA-256-verify a complete versioned engine set into `public/wasmtex/<version>/` |
| `npm run compat` | Compatibility harness — compile a corpus and bucket failures (`node scripts/compat/run.mjs`; writes `compat/report.{json,md}`) |
| `node scripts/gen-bloom-filter.mjs` | Generate bloom data from the configured object store, or from `TEXLIVE_MIRROR_ROOT` for an unpublished release |

Set both `WASMTEX_SMOKE_TEXLIVE_VERSION` and `WASMTEX_SMOKE_TEXLIVE_URL`
to a matching year and exact immutable snapshot URL when the
opt-in Node, cross-host, or incremental smoke suites qualify a new mirror.

## The committed `lib/` bundle

WasmTex isn't on npm, so consumers `npm install github:corca-ai/wasmtex#main`. A
`github:` install must yield a usable package **without** running a build (the `prepare`
build step is skipped or blocked by some package managers, and would otherwise leave
`exports` pointing at nonexistent files). So the published library bundle in **`lib/` is
committed** — built by `npm run build:lib`. The demo-app / GitHub-Pages build stays in the
gitignored `dist/`.

**If you change `src/` in a way that affects the built output, run `npm run build:lib` and
commit `lib/` in the same change.** The `lib-fresh` CI job rebuilds and fails the PR if
`lib/` drifts from `src/`. The build is deterministic (no sourcemaps / absolute paths; Node
24 everywhere), so a clean rebuild is byte-identical. `lib/**` is marked
`linguist-generated` in `.gitattributes`, so it's collapsed in PR diffs.

The declaration build preserves per-module named exports and rewrites parsed relative
module specifiers to resolvable `.js` paths (or `/index.js` for directory barrels).
This lets ESM consumers use NodeNext as well as Bundler resolution; the corresponding
`.d.ts` files still supply the types. An unresolved relative declaration fails the build.

### Installed package verification

`npm run test:package-consumer` needs Node 24 and npm registry access. It packs the
current `lib/` with `npm pack --ignore-scripts`, installs the tarball into an OS temp
directory, and removes the directory on success or failure. It never builds the SDK.
The CI `package-consumer` job runs before any checkout dependency installation or
`prepare`, independently of `lib-fresh` and the existing declaration export guard.

The consumer has no repository source, ancestor development dependencies, engine
assets, or SDK lifecycle execution. Seven neutral entry points execute under Node
without Monaco/PDF peers; a module-resolution hook also rejects attempts to import
those peers. Then the consumer installs its own exact tooling/peer versions from the
repository lock: TypeScript and tsgo check representative named/type exports from all
nine entries with Bundler and NodeNext resolution, with `skipLibCheck: false`.
Vite bundles the UI/Monaco entries and both public CSS aliases. This is a package
resolution/build check, not a browser UI interaction or real engine compile test.

Finally the probe removes a runtime entry and a named type export from the installed
copy and requires the actual Node/type checks to reject them. These mutations never
touch repository files. Keep the fixtures in `scripts/package-consumer/` aligned with
new public entry points; the gate rejects unaccounted entry-point additions.

The tarball proves npm's package file selection and consumption of the checked-out
bundle without a build. It does not exercise GitHub transport, authentication, ref
selection, Bun, or a package manager's script-enabled Git preparation. GitHub remains
the official install source; pin its commit and follow the [installation contract](howto.md#installation).

## Architecture & Internals

- See **[docs/architecture.md](architecture.md)** for a deep dive into the SDK structure and LSP implementation.
- See **[docs/engine.md](engine.md)** for details on the WASM compilation engine and TeX Live CDN.
- Follow the **[documentation guide](metadoc.md)** when changing project docs.

## Testing

The [runtime verification map](testing-map.md) connects behaviors, failure/race
scenarios, existing tests, CI gates and remaining gaps. Coverage exclusions do
not mean those modules have no unit tests. Update the map when changing this
verification boundary.

### Unit Tests
We use **Vitest**. Tests are located in `*.test.ts` files alongside the source code.
```bash
npm run test
```

Tests must assert observable behavior. In particular, worker/controller changes should
be exercised through protocol responses, an engine adapter, or a rebuilt engine smoke
test; reading implementation files and checking that source strings occur in some order
does not prove the feature works and is not an acceptable regression test.

`src/lsp/__tests__/completion-performance.test.ts` enforces the semantic-index budget on
a 600-file active graph: indexing under 3,000 ms, warmed completion under 150 ms, a single
file update under 100 ms, and retained semantic metadata under 8 MiB. These are CI guardrails,
not end-user timing claims; change a threshold only with benchmark evidence in the PR.
Runtime completion snapshot tests separately enforce engine/host record ceilings, a
2 MiB serialized retention ceiling, revision/profile rejection, stale-on-edit behavior,
and output-neutral worker response mapping. Engine rebuild PRs must also run the Node
smoke and cross-host parity gates below so the authored C/controller hook is exercised,
not merely its TypeScript consumer.

### E2E Tests
We use **Playwright**. These verify the full compilation loop, SyncTeX, and BibTeX integration.
```bash
# Playwright starts the dev server itself (reuses one already on port 6001)
npm run test:e2e
```


## Moved reference sections

These anchors preserve existing bookmarks. Follow the links to the focused guides.

<a id="engine-cpu-diagnostics"></a>
See [Engine CPU diagnostics](engine-testing.md#engine-cpu-diagnostics) in its dedicated guide.

<a id="cross-host-node-engine-tests"></a>
<a id="compile-pipeline-probe"></a>
See [Cross-Host (Node) Engine Tests](engine-testing.md#cross-host-node-engine-tests) in its dedicated guide.

<a id="pull-request-output-regression-gate"></a>
<a id="authored-worker-static-checks"></a>
Engine contributors should follow the [annual output regression gate](engine-testing.md#pull-request-output-regression-gate)
and [authored worker checks](engine-testing.md#authored-worker-static-checks).
