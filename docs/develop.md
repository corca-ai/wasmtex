# Development Guide

This guide is for developers contributing to the `wasmtex` codebase.

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
| `npm run build:lib` | SDK-only build (`BUILD_MODE=lib`): the seven ES entry points (`wasmtex`, `headless`, `node`, `synctex`, `lsp`, `lsp-monaco`, `lsp-server`) + `wasmtex.css` → **`lib/` (committed)** |
| `npm run check` | Typecheck only (`tsgo --noEmit`) |
| `npm run test` | Unit tests (Vitest, `vitest run`) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run test:golden` / `npm run update:golden` | Golden-output tests (write/refresh `e2e/goldens/*.json`) |
| `npm run lint` / `npm run lint:fix` | Lint (Biome) — check / apply fixes |
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

Set `WASMTEX_SMOKE_TEXLIVE_URL` to an exact immutable snapshot URL when the
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

## Architecture & Internals

- See **[docs/architecture.md](architecture.md)** for a deep dive into the SDK structure and LSP implementation.
- See **[docs/engine.md](engine.md)** for details on the WASM compilation engine and TeX Live CDN.
- Follow the **[documentation guide](metadoc.md)** when changing project docs.

## Testing

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

### Cross-Host (Node) Engine Tests
The same from-source WASM engine runs under Node via `installNodeWorkerHost`
(`src/engine/node-host.ts`, exported from `wasmtex/node`). The verification tests are
**env-gated** so they stay out of the default `npm run test`; they read the engine assets
from `public/`, so run `npm run sync-engine-assets -- --from <baseUrl>` first.
To verify a local rebuild without replacing release artifacts, set
`WASMTEX_SMOKE_PUBLIC_DIR` to an equivalent directory tree containing the rebuilt files.
```bash
# Off-browser pdfTeX smoke
NODE_COMPILE_SMOKE=1 npx vitest run src/engine/node-compile.smoke.test.ts

# Client/server parity vs the browser golden — pdflatex + lualatex + xelatex + bibtex
CROSS_HOST_PARITY=1 npx vitest run src/engine/cross-host-parity.smoke.test.ts
```
