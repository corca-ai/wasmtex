# Compile performance

This guide describes adopted behavior and remaining limits. Exact commands,
build revisions and measurements belong to the [experiment history](history/README.md).
All engine changes follow the [optimization policy](engine-optimization-policy.md);
[the upgrade inventory](engine-upgrade-customizations.md) maps maintained changes
to their source files and requalification requirements.

## Adopted behavior

| Area | Current implementation | Boundary / cost |
| --- | --- | --- |
| Unicode initial memory | XeTeX and LuaHBTeX start at 128 MiB with growth enabled. | This is initial WASM memory, not browser RSS or a maximum document budget. |
| Initial heap snapshots | XeTeX, LuaHBTeX and dvipdfmx retain the nonzero prefix and restore the omitted suffix as zeros. | Preserves the original reset extent; distinct from resumable checkpoints. |
| Warmup | All three engine families accept supplied warmup data; hosts can merge profile-matched learned dependency sets. | Preparation costs time/network/memory; filesystem preloading must preserve lookup behavior. |
| Conversion evidence | dvipdfmx reports bounded successful file opens, including native-cache hits. | Adds observations; XeLaTeX dependency completeness remains false. |
| dvipdfmx font maps | Auxiliary lookup index and cached list tails preserve original ownership and iteration. | Includes the separately qualified missing-SFD lifetime fix; no cross-document font-object cache. |
| pdfTeX / XeTeX format loading | Bounded byte-verified decoded-format read cache with original O2 flags and published fmt bytes. | One source, at most 8 MiB compressed / 32 MiB decoded / 65,536 chunks; lifecycle and fallback checks required. |
| LuaHBTeX build | O3 + LTO on the pinned toolchain. | Larger compressed assets; no decoded-format cache. |
| pdfTeX incremental path | Preamble formats, optional durable preamble cache and browser heap checkpoints. | Each has a distinct identity/lifetime; see [engine caches](engine.md#preamble-snapshots). |

The September 2026 controlled corpus measured repeat/body improvements around
19% for ordinary PDF format reuse, 13–15% for checkpoint PDF, 13% for XeTeX,
and 10–11% for Lua LTO. These are separate comparisons, not additive speedups or
production percentiles. The measured fresh-browser aggregate peak RSS increase
was approximately 17–50 MiB; Lua's gzip-9 JS/WASM size increased 327–383 KB.
See the [final experiment qualification](history/compile-performance-2026-09.md#costs-and-release-qualification)
for per-year inputs, memory methodology and exact results.

## Excluded or deferred changes

| Candidate | Decision |
| --- | --- |
| Unicode filesystem injection intended to accelerate startup | Withdrawn after changing file-existence/alias behavior. HTTP/SW preparation is a separate host concern. |
| pdfTeX LTO | Rejected after a project-switch / embedded-PDF memory-access failure. Keep the [complete regression sequence](../test/fixtures/project-switch-images/README.md). |
| Ordinary O3 alone, XeTeX LTO, Lua format cache | Insufficient whole-compile benefit in #140. |
| SDK transfer / MEMFS ownership | Actual SDK-to-worker experiment missed the 5% pipeline threshold; existing paths retained. |
| pdfTeX AVL single-probe insertion | Rejected; see the [experiment decision](pdftex-fontmap-experiment.md). |
| Extra compressed assets | Deferred after insufficient additional savings; see [HTTP compression](http-compression.md). |
| Whole font-object sharing; XeTeX checkpoint resume | Not adopted. State completeness and benefit remain unproven. |
| Skipping intermediate XeTeX PDF conversion | Not adopted because error/diagnostic semantics must be preserved across reruns. |

An issue being open does not establish that its original proposal is active or
unimplemented: consult the latest decision and the build inputs before retrying.

<a id="font-map-index-qualification"></a>
The historical font-map qualification anchor is retained for release-audit links.
Its original measurements and holds are in the
archived [font-map record](history/compile-performance-2026-09.md#font-map-index-qualification).

## Release and adoption

The qualified #140 releases are
[2025-6d8b01c3a4570ad1](https://github.com/corca-ai/wasmtex/releases/tag/engine-2025-6d8b01c3a4570ad1)
and [2026-52bd7d6287f2a826](https://github.com/corca-ai/wasmtex/releases/tag/engine-2026-52bd7d6287f2a826).
They retain the original format-generation provenance and immutable mirrors.
`scripts/engine-release-components.json` owns the selected workflow runs;
artifact manifests and receipts own the released file identities. Do not infer
the current release from a historical benchmark's asset directory.

CorTeX adopted these engines through
[PR #1046](https://github.com/corca-ai/cortex/pull/1046), after both annual
52-template corpora passed twice and application/CI/deployment checks passed.
This is consumer qualification, not a WasmTex build dependency. The historical
nested-XeTeX failure was fixed separately in the SDK; use the current
[nested-output contract](nested-output.md) rather than accepting the old failure.

For a new experiment, use the [CPU diagnostics and testing guide](develop.md#engine-cpu-diagnostics),
measure preparation and end-to-end latency separately, and complete
[corresponding-source qualification](corresponding-source.md) before promotion.
