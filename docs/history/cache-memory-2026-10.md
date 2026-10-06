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
SDK-owned retained bytes count distinct reachable original warmup file buffers,
not process RSS. Shared bloom bytes, decoded formats and worker heaps/caches
are outside that metric and remain available.
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
| Remove the second `dumpcache` byte copy | Actual authored controllers, 16 × 1 MiB independently-owned read results: allocation volume 32 → 16 MiB; alternating median dump times approximately 0.74–0.80 → 0.35–0.39 ms. | Transfer the independently-owned MEMFS `readFile` result for XeTeX/converter on both years and 2026 Lua. Hold 2025 Lua after repeated initialization increases; keep its exact published artifacts. Actual native ownership and subsequent compiles are qualified. |
| Save only changed cache files | Actual `PersistentCache`: with a 10 MiB budget, saving a 6 MiB file then a second 6 MiB file as a full session payload keeps both; a delta evicts the first. | Reject the naive delta protocol: it changes cache retention and may slow the next visit. A complete inventory/acknowledgement protocol remains a separate unqualified design. |
| Sparse auxiliary initialization snapshots | Actual 2026 BibTeX/BibTeX8/makeindex, five alternating pairs, repeated/changed/rejected-input/recovery outputs and logs match. Retained copies 64/128/64 MiB → 0.073/0.088/0.166 MiB. Repeats improve, but all initializations are slower. | Reject this implementation under the speed-preservation requirement. An Int32 scanning variant did not remove the initial cost. |
| Share identical checkpoint pages/files | Node V8 mechanism screening: four 64 MiB occupied heaps plus a stable 32 MiB file, one changed page per boundary. Unique storage 384 → 96.1875 MiB, median capture 3.205 → 26.234 ms. | Reject the exact-byte JavaScript comparison scheme. This is not an end-to-end checkpoint/Safari measurement and does not reject every sharing design. |

Auxiliary initialization plus first-run medians were 39.806 → 41.492 ms for
BibTeX, 58.317 → 61.236 ms for BibTeX8 and 22.100 → 25.107 ms for makeindex.
The makeindex malformed input is a rejected entry, not necessarily a fatal
exit. First bibliography calls include loopback resolver cost; initialization
alone was consistently slower for all five pairs and every auxiliary engine.
The tested sparse controllers/build changes were discarded, not published.

The source rebuilds retain every original format and all LuaHBTeX/dvipdfmx
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
| 2025 | [37417681723](https://github.com/corca-ai/wasmtex/actions/runs/37417681723) | Reused published [37404298803](https://github.com/corca-ai/wasmtex/actions/runs/37404298803); investigated 37417687158 not promoted | `2025-18f28ec91eb80496` |
| 2026 | [37417684616](https://github.com/corca-ai/wasmtex/actions/runs/37417684616) | [37417690219](https://github.com/corca-ai/wasmtex/actions/runs/37417690219) | `2026-dce598a0b9a42e79` |

Each raw receipt and every artifact hash was verified before composition.
The original format-generation receipts were downloaded from the existing
pinned runs and matched the baseline's embedded generation receipts exactly.
Unchanged pdfTeX, BibTeX, BibTeX8 and makeindex build inputs were reused.

Corresponding source for the investigated both-controller composition was
assembled and verified by
[2025 run 37420415006](https://github.com/corca-ai/wasmtex/actions/runs/37420415006)
and [2026 run 37420417620](https://github.com/corca-ai/wasmtex/actions/runs/37420417620).
Downloaded archive SHA-256 values matched their CI checksum files; local source
checks also passed against the final asset manifests.

- Investigated 2025 composition, not promoted: `038a6c426143fb81a7d23f7e9a5304fd1657179b0ed5649a1036ab3087becdb3`
- 2026: `a599df2fb44470a89d5416882d0fb040dc8583c1ff5e4e4c9a7997771e071158`

The 2026 license manifest and distribution profile bind its actual archive
hash. The final 2025 source binding is recorded after its separate assembly. The release IDs exclude mutable legal metadata and continue to identify
the exact engine artifacts and generation receipts.


## Annual source qualification

The exact source-built releases passed the annual real-core growth/recovery,
Unicode corpus, nested output, browser golden, checkpoint and cross-host suites:
[2025 ABBA, run 37420244709](https://github.com/corca-ai/wasmtex/actions/runs/37420244709)
and [2026 BAAB, run 37420310910](https://github.com/corca-ai/wasmtex/actions/runs/37420310910).
The isolated GitHub runners used Linux x64, Node 24.21.0 and Chromium
145.0.7632.6. Each workload has two five-repetition series per arm, fresh browser
contexts, a fixed worker clock and no upstream mirror misses during measurement.
All strict PDF/auxiliary/diagnostic/dependency comparisons passed.

| SDK-owned durable original file buffers | Baseline retained bytes | Candidate retained bytes |
| --- | ---: | ---: |
| 2025 XeTeX | 10,365,881 | 0 |
| 2025 LuaHBTeX | 14,829,704 | 0 |
| 2026 XeTeX | 10,576,020 | 0 |
| 2026 LuaHBTeX | 15,370,025 | 0 |

These are distinct reachable original file ArrayBuffers, not physical RSS.
The count excludes retained bloom bytes, decoded formats and worker caches. The cache probe
confirmed seed persistence and checked the actual native MEMFS read copies
survive transferable detachment in all three affected workers. Caller warmup
reuse/reinitialization remains covered independently.

The separate ordinary cold-context process runs sampled aggregate Chromium
peak RSS at 934.76 → 921.36 MiB (2025) and 944.26 → 927.26 MiB (2026).
Those runs do not exercise the durable-return path or establish its physical
memory saving; their difference is not attributed to this change. There is no
new whole-application Safari RSS claim.

### Latency investigation

All latency claims use untraced runs. Small/image arms use the same actual SDK
to isolate the source-built engine release; durable arms use the exact baseline
and candidate SDKs. Actual SDK hashes include nested engine modules. Different
CI runs are assessed independently, not pooled as if they shared one machine.

The first 2026 small XeTeX comparison measured initialization +3.84% and first
compile +2.93%. The independent opposite-order
[ABBA repeat 37422221642](https://github.com/corca-ai/wasmtex/actions/runs/37422221642)
measured initialization 109.30 → 101.90 ms (−6.77%) and first compile
968.00 → 965.00 ms (−0.31%). First-compile series medians were baseline
970.7/965.3 ms and candidate 970.6/964.1 ms; the initial increase did not repeat.
Image first compile changed +0.03%, durable first compile +0.61%.

2025 small LuaHBTeX initialization increased 206.85 → 223.35 ms (+7.98%)
initially and 154.80 → 164.20 ms (+6.07%) in the independent
[BAAB repeat 37422041129](https://github.com/corca-ai/wasmtex/actions/runs/37422041129).
The repeated increase was held for investigation rather than accepted under an
arbitrary percentage tolerance. Image initialization changed −1.80% and durable
return initialization +0.09% in that repeat.

Two additional controls used identical baseline engine assets and baseline SDK
in both arms; the comparator asserts full cross-arm asset/SDK hash equality and
labels them `baseline-assets`, not candidate latency qualification:
[BAAB 37423211033](https://github.com/corca-ai/wasmtex/actions/runs/37423211033)
measured initialization 203.05 → 199.95 ms (−1.53%), while
[ABBA 37423214082](https://github.com/corca-ai/wasmtex/actions/runs/37423214082)
measured 197.95 → 211.80 ms (+7.00%). The same-input increase establishes
initialization order/environment variation, but is not subtracted from the A/B
results and does not prove that the candidate has zero cost.

The actual phase-diagnostic comparisons
[BAAB 37423611594](https://github.com/corca-ai/wasmtex/actions/runs/37423611594)
and [ABBA 37423615070](https://github.com/corca-ai/wasmtex/actions/runs/37423615070)
again measured initialization increases (+7.93% and +5.57%). All 40 measured
samples completed warmup loading after worker boot and format loading. Warmup
loading, whose SDK/mirror inputs were unchanged, increased by 15.25/11.40 ms;
worker-boot medians changed +3.00/−1.40 ms. This locates the observed delay but
does not establish that candidate-related scheduling interference is absent.
Independent measurement review therefore withheld promotion of the 2025 Lua
controller. The final 2025 assembly reuses exact published Lua assets and
run 37404298803; candidate 1's SDK lifetime improvement remains enabled.
The earlier 2025 both-controller reports qualify an investigated composition,
not this final release. Final-composition qualification is recorded separately.
The unpublished investigated 2025 composition was `2025-e98592b5cdb10877`;
its corresponding-source SHA `038a6c426143fb81a7d23f7e9a5304fd1657179b0ed5649a1036ab3087becdb3`
is not a source binding for the final release.
The optional wrappers report worker boot, format loading, durable reads,
warmup loading and injection, including completion offsets. These phases overlap
and include diagnostic overhead; their durations must not be added together or
used alone to establish preserved total latency. Missing required phase records
must fail the analysis rather than be silently omitted.


## Final 2025 composition qualification

The [final-composition BAAB run 37424722127](https://github.com/corca-ai/wasmtex/actions/runs/37424722127)
passed output, native ownership, growth/recovery, golden, nested, checkpoint
and cross-host checks with the exact retained baseline Lua assets. Small Xe
initialization changed −0.97%, first compile +0.58%, repeat −0.54%; small Lua
initialization changed −0.30%, first compile +0.40%, repeat −0.76%.
The actual durable-return SDK comparison retained 10,365,881/14,829,704 bytes
of original Xe/Lua file buffers in the baseline and zero in the candidate.
Xe return initialization changed −4.66%, Lua +1.42%; first compile changed
−3.35%/−1.17%. These counts exclude caller-owned warmup, Bloom filters,
decoded formats, native files and linear-memory/checkpoint buffers.

Image Xe restore initially changed 369.90 → 394.25 ms (+6.58%). Promotion
was held for independent review and a focused opposite-order repeat. Its
chronological BAAB series medians were candidate 393.1, baseline 365.3,
baseline 399.8 and candidate 396.6 ms; baseline itself moved 34.5 ms.
This variation was evidence of order/environment effects, not a deduction
from the measured increase or a reason to waive it.

The [final-composition image ABBA repeat 37427251446](https://github.com/corca-ai/wasmtex/actions/runs/37427251446)
then measured restore 345.90 → 345.70 ms (−0.06%), initialization −2.87%,
first compile −0.68%, repeat −0.16%, body edit +0.18% and preamble edit +0.06%.
The restore increase did not repeat. Both image arms use the same SDK; the
actual Xe/converter candidate bytes match the final composition. These
independent runs are assessed separately rather than pooled across runners.

## Final source publication

The final 2025 composition's source workflow
[37424748148](https://github.com/corca-ai/wasmtex/actions/runs/37424748148)
published the complete archive on
[engine-2025-18f28ec91eb80496](https://github.com/corca-ai/wasmtex/releases/tag/engine-2025-18f28ec91eb80496).
Its SHA-256 is
`f07b5bcfe6e0064c2053e6d971081dee2d0128cac4c6a2c3d11ec6e2c324f2ff`.
The retained Lua source revision is
`44fecbec927b18fbef660156594289ed92518e08`; its exact composed receipt includes
the original format-generation provenance. This source unit is additional to
the b23d0d2 Xe/converter build and reused auxiliary/pdfTeX/format source units.

The 2026 publication workflow
[37423360204](https://github.com/corca-ai/wasmtex/actions/runs/37423360204)
published
[engine-2026-dce598a0b9a42e79](https://github.com/corca-ai/wasmtex/releases/tag/engine-2026-dce598a0b9a42e79).
Rebuilding at the exact prior assembly catalog commit reproduced the verified
`a599df2fb44470a89d5416882d0fb040dc8583c1ff5e4e4c9a7997771e071158`
archive hash. The public download and final-manifest source check also match.
No archive or immutable mirror object was overwritten.
