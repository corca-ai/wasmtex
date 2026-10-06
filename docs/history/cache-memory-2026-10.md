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
