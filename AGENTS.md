# WasmTex Agent Guide

## Mission

Build a high-performance embeddable LaTeX SDK with a headless compile core,
optional editor/PDF preview, and host-independent engine boundaries.

Before any task, read the relevant current guides below. The complete
[documentation index](docs/README.md) separates usage, architecture, operations
and historical evidence.

| Work | Required reading |
| --- | --- |
| Architecture or client/server boundary | [Architecture](docs/architecture.md), [execution model](docs/execution-model.md). |
| Integration or public API | [Integration](docs/howto.md), [API reference](docs/api.md); [bibliography](docs/bibliography.md) for backend changes. |
| Syntax, LSP or completion | [Language service architecture](docs/language-service.md), [API reference](docs/api.md). |
| Engine, memory, build flags or performance | [Engine runtime](docs/engine.md), [optimization policy](docs/engine-optimization-policy.md), [current performance decisions](docs/compile-performance.md). |
| Warmup or caching | [Warmup](docs/warmup.md), [engine runtime](docs/engine.md), [optimization policy](docs/engine-optimization-policy.md). |
| TeX Live source/year or mirror upgrade | [Upgrade procedure](docs/texlive-upgrade.md), [customization inventory](docs/engine-upgrade-customizations.md), [mirror operations](docs/texlive-mirror-operations.md). |
| Release/distribution | [Licensing](docs/licensing.md), [corresponding source](docs/corresponding-source.md), [proprietary integration](docs/proprietary-integration.md). |
| Contribution and verification | [Development](docs/develop.md), [CONTRIBUTING.md](CONTRIBUTING.md). |
| Documentation | [Documentation maintenance](docs/metadoc.md) and the guide owning the topic. |

WasmTex must not depend on an integrating application's code or project schema.
A host such as CorTeX owns adoption, profile resolution and deployment.
Preserve published formats/mirrors and observable compile semantics for
transparent engine optimizations. Review annual upgrades under their separate
procedure instead of assuming cross-year format compatibility.

`CLAUDE.md` is a symlink to this file. Historical experiment notes are evidence,
not instructions to resume work or descriptions of current support.
