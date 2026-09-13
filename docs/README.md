# Documentation index

Choose your audience below. **SDK users** integrate WasmTex into an application;
**contributors** change WasmTex itself. These guides describe current behavior; dated
experiments are in [history](history/README.md), and commit-bound release/source
audits are in [license evidence](license-evidence/README.md).

## SDK users: install and integrate

| Guide | Owns |
| --- | --- |
| [Integration](howto.md) | Installation and a complete built-in browser editor setup. |
| [Engine assets](assets.md) | Download a verified set, configure URLs and troubleshoot loading. |
| [Headless / Node](headless.md) | Compile without a UI, select engines and route remote stages. |
| [Editor integration](editor-integration.md) | Existing Monaco instances, navigation and Yjs bindings. |
| [Language integration](language-integration.md) | Neutral service, Monaco adapter and profile-bound catalogs. |
| [Editor API](api.md) | Entry-point index, component options, methods, events and viewer. |
| [Compiler API](compiler-api.md) | Headless options, results, incremental compilation, tagged export and TikZ. |
| [Language API](language-api.md) | Language service methods, linter and JSON-RPC transport. |
| [Syntax API](syntax-api.md) | Shared source snapshots, stable document identity and schema contracts. |
| [SyncTeX API](synctex-api.md) | Parse output, map coordinates and support custom PDF viewers. |
| [Bibliography](bibliography.md) | BibTeX, biblatex-lite and remote Biber behavior. |
| [Warmup](warmup.md) | Preload APIs, learned dependency sets, cache scope and preparation costs. |
| [Nested output](nested-output.md) | Main-file/output-path contract and links to regression coverage. |

## Contributors: understand and develop

| Guide | Owns |
| --- | --- |
| [Architecture](architecture.md) | Module boundaries and repository structure. |
| [Execution model](execution-model.md) | Shipped hosts, backend routing and determinism limits. |
| [Language service](language-service.md) | Syntax/indexing, completion evidence and editor-neutral boundaries. |
| [Development](develop.md) | Setup, commands, committed bundles and everyday verification. |
| [Runtime verification map](testing-map.md) | Execution behavior, failure/race tests, CI placement, coverage boundaries and remaining gaps. |
| [Documentation maintenance](metadoc.md) | Source-of-truth rules, history lifecycle and link checks. |

## Maintainers: engines and releases

| Guide | Owns |
| --- | --- |
| [Engine builds](engine-build.md) | Source build pipelines, controllers and checkpoint binaries. |
| [Engine testing](engine-testing.md) | Cross-host smoke tests, differential qualification and CPU profiling. |
| [Engine runtime](engine.md) | Workers, assets, lookup, formats and cache/checkpoint lifetimes. |
| [Compile performance](compile-performance.md) | Adopted optimizations, rejected/deferred decisions and measurement limits. |
| [Optimization policy](engine-optimization-policy.md) | Required compatibility and promotion contract. |
| [Upgrade customizations](engine-upgrade-customizations.md) | Maintained patches/build flags and upstream assumptions to recheck. |
| [TeX Live upgrade](texlive-upgrade.md) | Annual source/mirror/format upgrade sequence. |
| [Mirror operations](texlive-mirror-operations.md) | Immutable publication, verification and rollback. |
| [2026 lifecycle](texlive-2026-snapshot-lifecycle.md) | Published annual snapshots and future finalization procedure. |
| [HTTP compression](http-compression.md) | Read-only diagnostics and current compression decision. |
| [pdfTeX font-map decision](pdftex-fontmap-experiment.md) | Short decision and link to the rejected experiment evidence. |
| [Licensing](licensing.md) | SDK/engine scope, inventories and redistribution gates. |
| [Corresponding source](corresponding-source.md) | Receipt-bound source archives and clean rebuild qualification. |
| [Proprietary integration](proprietary-integration.md) | Separation of a closed-source host from engine distribution. |

The machine authorities are `package.json` for exports/commands,
`scripts/engine-release-components.json` for annual build-run selection, artifact
manifests/receipts for released bytes, and `scripts/texlive-profiles-2026.json`
for exact 2026 profiles. A historical report does not override those records.
