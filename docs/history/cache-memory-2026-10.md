# Cache memory experiments — October 2026

Current behavior belongs to [compile performance](../compile-performance.md).
The [optimization policy](../engine-optimization-policy.md) governs promotion.

## Scope and inputs

Baseline: `a34920b5428c2f92d00c3861b76fa41f7ec48529` from `origin/main`.
The retained candidates are built from
`b23d0d2b54486bdea989c150091794679ce3cfe4`.
The annual mirrors, published formats, TeX capacities, heap growth policy and
initialization snapshots remain unchanged. SDK and controller changes are
qualified separately; this record does not attribute the reported Safari
whole-application 2 GiB footprint to the engine.

The local environment is macOS arm64, Node 24.18.0 and Chromium 145.0.7632.6.
The cache probe seeds IndexedDB by compiling and waiting for a confirmed save,
then disposes that compiler and initializes another on the same origin. Every
measured repetition uses a fresh browser context. Preparation fills an exact
immutable-mirror HTTP response cache; measured runs reject upstream misses.
SDK-owned retained bytes count distinct reachable warmup buffers, not process RSS.
Supplied caller warmup remains reusable for compiler/engine reinitialization.

A host that disables SDK persistence and supplies its own warmup cache does
not follow this durable-return probe. Its reusable caller buffers remain owned
by the host and referenced by the compiler. The measured 10–15 MiB reduction
therefore does not establish the same reduction in that host, and the cache
export optimization only helps consumers that actually request cache exports.

## Decisions

| Candidate | Screening evidence | Decision |
| --- | --- | --- |
| Release initialized Unicode warmup originals | In the 2026 small-document return visit, retained SDK originals: XeTeX 10,576,020 bytes → 0; LuaHBTeX 15,370,025 → 0. Original serial runs and a quiet repeat showed compile medians within about 1%. | Retain local warmup sets until every worker receives them, then let the local references expire. Keep caller-owned inputs for reinitialization. |
| Remove the second `dumpcache` byte copy | Actual authored controllers, 16 × 1 MiB independently-owned read results: allocation volume 32 → 16 MiB; alternating median dump times approximately 0.74–0.80 → 0.35–0.39 ms. | Transfer the independently-owned MEMFS `readFile` result. Native MEMFS ownership and subsequent compiles require real browser qualification. |
| Save only changed cache files | Actual `PersistentCache`: with a 10 MiB budget, saving a 6 MiB file then a second 6 MiB file as a full session payload keeps both; a delta evicts the first. | Reject the naive delta protocol: it changes cache retention and may slow the next visit. A complete inventory/acknowledgement protocol remains a separate unqualified design. |
| Sparse auxiliary initialization snapshots | Actual 2026 BibTeX/BibTeX8/makeindex, five alternating pairs, repeated/changed/rejected-input/recovery outputs and logs match. Retained copies 64/128/64 MiB → 0.073/0.088/0.166 MiB. Repeats improve, but all initializations are slower. | Reject this implementation under the speed-preservation requirement. An Int32 scanning variant did not remove the initial cost. |
| Share identical checkpoint pages/files | Node V8 mechanism screening: four 64 MiB occupied heaps plus a stable 32 MiB file, one changed page per boundary. Unique storage 384 → 96.1875 MiB, median capture 3.205 → 26.234 ms. | Reject the exact-byte JavaScript comparison scheme. This is not an end-to-end checkpoint/Safari measurement and does not reject every sharing design. |

Auxiliary initialization plus first-run medians were 39.806 → 41.492 ms for
BibTeX, 58.317 → 61.236 ms for BibTeX8 and 22.100 → 25.107 ms for makeindex.
The makeindex malformed input is a rejected entry, not necessarily a fatal
exit. First bibliography calls include loopback resolver cost; initialization
alone was consistently slower for all five pairs and every auxiliary engine.
The tested sparse controllers/build changes were discarded, not published.

The final source rebuilds retain every original format and all LuaHBTeX/dvipdfmx
core/glue bytes. XeTeX's native sources, build flags and pinned toolchain are
unchanged, but its rebuilt WASM differs in function/data layout (file sizes are
12 bytes smaller for 2025 and 6 bytes smaller for 2026). These are size deltas,
not counts of changed bytes. The 2025 generated glue also changes import-wrapper
order and embedded data addresses. Independent review found no unintended
native source/build-input change; this is not proof of binary equivalence.
Annual end-to-end comparisons therefore qualify the actual rebuilt core plus
controller and SDK, rather than attributing whole-compile results solely to the
cache-export edit. The isolated controller screen remains allocation evidence.

The first overlapping cache-preparation runs and a later timing run overlapped
with heavy unit tests are excluded from latency evidence. Independent review
required actual SDK hashes (including nested engine modules), seed-save success,
bounded persistence waits, and separate return-initialization timing. The final
harness rejects unsupported project/checkpoint combinations for this cache probe.

## Reproduction

```bash
node scripts/profile-font-cpu.mjs --assets <year-assets> --year 2026 \
  --sdk-dir <exact-lib-directory> --sdk-source-revision <commit> \
  --engine unicode --cache-probe true --trace false --heap-stats true \
  --repetitions 5 --cache-dir <mirror-response-cache> --out <report-dir>
node scripts/profile-cache-transfer.mjs <baseline-year-assets> \
  <candidate-year-assets> <report.json>
node scripts/profile-checkpoint-sharing.mjs <report.json>
```

The transfer and sharing scripts are mechanism screens, not physical memory or
whole-compile benchmarks. The cache probe reports seed/return-init preparation
and persistence wait separately from compile latency, hashes the actual SDK and
engine inputs, and checks native MEMFS copies survive transferable detachment.
Source qualification and immutable release evidence are appended below when
complete; local staged controller copies alone are not release provenance.

## Source rebuild and assembly

The retained engine changes were rebuilt from the exact source commit above:

| Year | XeTeX and dvipdfmx | LuaHBTeX | Assembled release |
| --- | --- | --- | --- |
| 2025 | [37417681723](https://github.com/corca-ai/wasmtex/actions/runs/37417681723) | [37417687158](https://github.com/corca-ai/wasmtex/actions/runs/37417687158) | `2025-e98592b5cdb10877` |
| 2026 | [37417684616](https://github.com/corca-ai/wasmtex/actions/runs/37417684616) | [37417690219](https://github.com/corca-ai/wasmtex/actions/runs/37417690219) | `2026-dce598a0b9a42e79` |

Each raw receipt and every artifact hash was verified before composition.
The original format-generation receipts were downloaded from the existing
pinned runs and matched the baseline's embedded generation receipts exactly.
Unchanged pdfTeX, BibTeX, BibTeX8 and makeindex build inputs were reused.

Complete corresponding source was assembled and verified by
[2025 run 37420415006](https://github.com/corca-ai/wasmtex/actions/runs/37420415006)
and [2026 run 37420417620](https://github.com/corca-ai/wasmtex/actions/runs/37420417620).
Downloaded archive SHA-256 values matched their CI checksum files; local source
checks also passed against the final asset manifests.

- 2025: `038a6c426143fb81a7d23f7e9a5304fd1657179b0ed5649a1036ab3087becdb3`
- 2026: `a599df2fb44470a89d5416882d0fb040dc8583c1ff5e4e4c9a7997771e071158`

The license manifests and 2026 distribution profile bind those actual archive
hashes. The release IDs exclude mutable legal metadata and continue to identify
the exact engine artifacts and generation receipts.
