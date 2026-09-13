# Documentation index

Start with the task below. These guides describe current behavior; dated
experiments are in [history](history/README.md), and commit-bound release/source
audits are in [license evidence](license-evidence/README.md).

## Integrate the SDK

| Guide | Owns |
| --- | --- |
| [Integration](howto.md) | Installation, workers, headless/Node recipes and editor integration. |
| [API reference](api.md) | Public entry points, options, methods, events and data contracts. |
| [Bibliography](bibliography.md) | BibTeX, biblatex-lite and remote Biber behavior. |
| [Warmup](warmup.md) | Preload APIs, learned dependency sets, cache scope and preparation costs. |
| [Nested output](nested-output.md) | Main-file/output-path contract and regression commands. |

## Understand and develop

| Guide | Owns |
| --- | --- |
| [Architecture](architecture.md) | Module boundaries and repository structure. |
| [Execution model](execution-model.md) | Shipped hosts, backend routing and determinism limits. |
| [Language service](language-service.md) | Syntax/indexing, completion evidence and editor-neutral boundaries. |
| [Development](develop.md) | Setup, commands, committed bundles and testing/profiling procedures. |
| [Runtime verification map](testing-map.md) | Execution behavior, failure/race tests, CI placement, coverage boundaries and remaining gaps. |
| [Documentation maintenance](metadoc.md) | Source-of-truth rules, history lifecycle and link checks. |

## Maintain engines and releases

| Guide | Owns |
| --- | --- |
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
