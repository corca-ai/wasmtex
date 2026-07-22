# Contributing to WasmTex

Thanks for your interest in WasmTex — an embeddable, browser-based LaTeX editor
with real-time PDF preview. This guide covers how to set up, make changes, and get
them merged. By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

- **Bugs / features:** open a [GitHub issue](https://github.com/corca-ai/wasmtex/issues/new/choose).
- **Security issues:** do **not** file a public issue — see [SECURITY.md](SECURITY.md).
- **Questions / usage help:** start with the [Integration Guide](docs/howto.md) and
  [API Reference](docs/api.md).

## Prerequisites

- **Node.js v24+** (`engines.node: ">=24"`; the repo pins `24` in `.nvmrc`).
- **npm** (the repo ships a `package-lock.json`; use `npm ci` for reproducible installs).
- **WASM engine assets.** The runtime and most e2e tests load per-year engine files
  from `public/wasmtex/<version>/`. Fetch a hash-verified set once:

```bash
npm install
npm run sync-engine-assets -- --from https://corca-ai.github.io/wasmtex/
npm run dev          # http://localhost:6001
```

Rebuilding the WASM engines themselves is **not** required for most contributions and
runs via Docker on a separate build host — see [docs/engine.md](docs/engine.md) and the
`wasm-*.yml` workflows. If your change is TypeScript-only, the synced assets above are
all you need.

## Repository layout

| Path | What lives here |
|------|-----------------|
| `src/` | The SDK/editor source (TypeScript). Unit tests sit alongside as `*.test.ts`. |
| `lib/` | **Committed** built bundle consumers install. Generated — do not hand-edit (see below). |
| `e2e/` | Playwright specs, golden corpus, and benchmarks. |
| `scripts/` | Build, engine-asset, and license/compliance tooling (`*.mjs`, with `*.test.mjs`). |
| `docs/` | All prose documentation. Start at [AGENTS.md](AGENTS.md) / [README](README.md). |
| `wasm-build/` | Dockerized TeX Live → WASM engine build inputs. |

For architecture context, read [docs/architecture.md](docs/architecture.md) and
[docs/execution-model.md](docs/execution-model.md) before touching the client/server
split, headless boundary, or engine host.

## Development workflow

Common commands (full table in [docs/develop.md](docs/develop.md)):

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (port 6001). |
| `npm run check` | Typecheck only (`tsgo --noEmit`). |
| `npm run lint` / `npm run lint:fix` | Biome lint — check / autofix. |
| `npm run format` | Biome formatter. |
| `npm run test` | Unit tests (Vitest). |
| `npm run test:e2e` | End-to-end tests (Playwright). |
| `npm run test:golden` / `npm run update:golden` | Golden-output tests — check / refresh. |
| `npm run build:lib` | Rebuild the committed `lib/` bundle. |

### Coding standards

- **TypeScript, strict.** `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals`/`noUnusedParameters`, and more.
  `npm run check` must pass with zero errors.
- **Biome** owns formatting and linting: 2-space indent, 100-column width, single quotes,
  semicolons as-needed. Run `npm run lint:fix` before committing. `noExplicitAny` is a
  warning — avoid `any`; prefer precise types or `unknown` + narrowing.
- **Cognitive complexity ≤ 15** (enforced as an error). Split large functions rather than
  suppressing the rule.
- **Avoid duplication.** `jscpd` guards against copy-paste; refactor shared logic instead.
- Match the conventions of the surrounding code — naming, comment density, and idiom.

### The committed `lib/` bundle — important

WasmTex isn't on npm; consumers run `npm install github:corca-ai/wasmtex#main`, which
must work **without a build step**. So the published bundle in `lib/` is committed.

> **If you change `src/` in a way that affects built output, run `npm run build:lib` and
> commit `lib/` in the same change.**

The `lib-fresh` CI job rebuilds and fails the PR if `lib/` drifts from `src/`. The build
is deterministic (Node 24, no sourcemaps/absolute paths), so a clean rebuild is
byte-identical. `lib/**` is `linguist-generated`, so it collapses in PR diffs.

### Licensing & compliance changes

WasmTex redistributes TeX Live (WASM). Any change touching engine assets, `public/`,
`LICENSES/`, `THIRD_PARTY_NOTICES.md`, or the release pipeline must keep the compliance
gates green. Read [docs/licensing.md](docs/licensing.md) and
[docs/corresponding-source.md](docs/corresponding-source.md), and run the relevant checks
(`npm run check:licenses`, `npm run check:release-notices`, `npm run check:corresponding-source`).

## Testing

Before opening a PR, make sure the local gates pass — they mirror CI and the pre-commit hook:

```bash
npm run check      # typecheck
npm run lint       # Biome
npm run test       # unit tests
```

- **Add or update tests** for any behavior change. Unit tests live next to the source as
  `*.test.ts`; end-to-end coverage goes in `e2e/`.
- **Golden output:** if a change intentionally alters compiled output, refresh goldens with
  `npm run update:golden` and review the diff.
- **Cross-host / engine smoke tests** are env-gated (e.g. `NODE_COMPILE_SMOKE=1`,
  `CROSS_HOST_PARITY=1`) and need synced engine assets — see
  [docs/develop.md](docs/develop.md#cross-host-node-engine-tests).

A [lefthook](https://github.com/evilmartians/lefthook) pre-commit hook runs typecheck,
lint, unit tests, and the duplication check in parallel. Install hooks with `npx lefthook
install` (a fresh `npm install` sets this up via `lefthook`).

## Commit messages

Use a short `type: summary` subject line, matching the existing history:

```
feat: add xindy server backend
fix: guard against empty SyncTeX block
docs: clarify headless worker setup
test: cover cross-host BibTeX parity
compliance: bind corresponding source by revision
```

Common types: `feat`, `fix`, `docs`, `test`, `perf`, `refactor`, `chore`, `compliance`.
Keep the subject imperative and under ~72 characters; put rationale in the body.

## Pull requests

1. **Branch** from `main` (or work in a fork).
2. Keep PRs focused; unrelated changes belong in separate PRs.
3. Fill in the [PR template](.github/PULL_REQUEST_TEMPLATE.md) checklist.
4. Ensure CI is green — `lib-fresh`, lint, typecheck, unit tests, and (on `main`) the
   license/compliance gates all run.
5. Update the relevant `docs/` and add a `CHANGELOG.md` entry under **Unreleased** when
   your change is user-facing.

### Contributor License / sign-off

Contributions are accepted under the project's [MIT License](LICENSE) — by submitting a
PR you agree your contribution is licensed under those terms. No CLA or DCO sign-off is
required. Contributors are credited collectively as "WasmTex contributors."

## Documentation

Docs are first-class here. If you change behavior, update the matching page in `docs/` and
follow the maintenance rules in [docs/metadoc.md](docs/metadoc.md). The docs index lives in
[AGENTS.md](AGENTS.md).

---

Thanks for contributing! 🎉
