# Unicode heap growth experiment — October 2026

Current behavior and release status belong to [compile performance](../compile-performance.md).
The [optimization policy](../engine-optimization-policy.md) governs promotion.

## Baseline and candidate

Baseline SDK: `fb5b667`. The source candidate is `44fecbec927b18fbef660156594289ed92518e08`.
It changes only Emscripten memory settings: XeTeX and LuaHBTeX use 5% geometric
headroom with a 16 MiB cap; dvipdfmx additionally starts at 64 MiB instead of
256 MiB. Growth remains enabled, stack sizes and maximum capacities unchanged.
Neither TeX capacity parameters nor format/package/mirror bytes change.

The screening used the baseline `public/wasmtex/2026` assets. Temporary trees
changed the generated JS growth constants or the converter WASM memory minimum
in isolation. These are diagnostic inputs, not source rebuilds or releases.
Copied manifests/receipts in those trees do not describe the changed bytes.
Source-built qualification subsequently replaced the diagnostic trees with
receipt-verified assets and the original baseline formats.

Environment: macOS arm64, Node 24.18.0, Chromium 145.0.7632.6. The diagnostic
uses its Latin Modern/amsmath document, fixed worker clocks, and the unchanged
`2026-ba38749b8714505a` mirror. Preparation populates an HTTP response cache;
measured stages reject upstream misses. Three fresh contexts measure initialization,
first/repeat compile, body edit and preamble edit. Separate RSS runs include
browser subprocesses, shared-page double counting and a 100 ms sampling interval.

| Screening | Baseline WASM capacity (MiB) | Candidate (MiB) | Decision |
| --- | ---: | ---: | --- |
| pdfLaTeX growth setting | 340.44 | 343.63 | Reject: no capacity saving. |
| XeTeX growth setting, including unchanged converter | 752.25 | 700.81 | Qualify from source. |
| LuaHBTeX growth setting | 265.50 | 230.38 | Qualify from source. |
| dvipdfmx initial allocation | 256 | 64 | Qualify together with Unicode growth. |

A combined XeTeX/converter screening sampled aggregate Chromium peak RSS of
1,140.8 → 951.8 MiB. Sampling perturbs timing; latency evidence must use separate,
quiet alternating runs. This is not a private-memory measurement or a budget.

Native Safari 26.6.2 screening used a safaridriver-owned engine-only page on the
same Mac, with identical cached mirror responses and sequential small-document
edit/repeat stages. macOS `footprint -j` measured retained physical footprint of
the active WebContent process at 717.2 MiB for the baseline and 546.3 / 502.7 MiB
for two candidate runs. Safari reused the same WebContent PID; its lifetime peak
therefore cannot compare these runs. Background activity made their latency
variable, so these observations support the memory hypothesis only. They do not
reproduce or attribute the reported 2 GiB CorTeX page, which includes the editor,
PDF renderer and host lifecycle. Playwright WebKit failed to create a context on
this machine; no Playwright WebKit qualification is claimed. The screened
2026 XeTeX/converter JS and WASM bytes were subsequently verified byte-identical
to source builds `37404296139` / `44fecbec927b18fbef660156594289ed92518e08`.
Lua's screened JS/WASM bytes likewise match source build `37404301927`;
this byte check does not upgrade variable local timings into latency evidence.

## Reproduction and required checks

```bash
node scripts/profile-font-cpu.mjs --assets <flat-year-assets> --year 2026 \
  --engine xelatex --trace false --heap-stats true --repetitions 3 \
  --cache-dir <shared-response-cache> --out <report-dir>
node scripts/sample-browser-rss.mjs --out <rss.json> -- \
  node scripts/profile-font-cpu.mjs --assets <flat-year-assets> --year 2026 \
  --engine xelatex --trace false --heap-stats true --repetitions 3 \
  --cache-dir <shared-response-cache> --out <memory-report-dir>
```

Repeat timing comparisons for LuaLaTeX and both annual profiles. Use
`stage-unicode-qualification.mjs` to verify actual workflow receipts and keep the
original formats. Annual qualification includes the real-core edit differential,
Unicode feature corpus, browser goldens, nested output, cross-host parity,
format fallback and checkpoint paths. The edit differential now also forces a
converter allocation larger than its current WASM capacity on both sides, dirties
and frees it, and compares subsequent output/edit/recovery with the baseline.
That is allocator pressure, not a claim to represent every large image workload.

## Source-built qualification

All four source builds use `44fecbec927b18fbef660156594289ed92518e08`:
2025 XeTeX/converter [37404293394](https://github.com/corca-ai/wasmtex/actions/runs/37404293394),
2025 LuaHBTeX [37404298803](https://github.com/corca-ai/wasmtex/actions/runs/37404298803),
2026 XeTeX/converter [37404296139](https://github.com/corca-ai/wasmtex/actions/runs/37404296139),
and 2026 LuaHBTeX [37404301927](https://github.com/corca-ai/wasmtex/actions/runs/37404301927).
Build receipts, unchanged annual source pins and mirror identities were verified;
original formats retain their original generation receipts.

Isolated Ubuntu x64 runners used Node 24.21.0 and Chromium 145.0.7632.6.
Each ABBA or BAAB run measures five fresh contexts per series, ten per side.
Reports enforce a fixed SDK revision, harness hash, workload and environment
within one run, and fixed asset hashes independently for each side. Tracing is
off and measured mirror-cache misses fail. Different runner timings are not
pooled. Separate process-memory runs use three contexts per engine.

| Small document, after preamble edit | Baseline WASM capacity (MiB) | Candidate (MiB) |
| --- | ---: | ---: |
| XeTeX/converter, both annual lines | 496.25 + 256 | 444.81 + 64 |
| LuaHBTeX 2025 | 221.25 | 198.88 |
| LuaHBTeX 2026 | 265.50 | 230.38 |

The authored 6000×6000 RGB image forces actual converter growth: both sides reach
456.19 MiB (2025) / 456.25 MiB (2026) and preserve output through repeats, edits and the final small document.
Grown linear memory does not shrink on document reset. Separately, the Node
allocator-pressure differential forces growth, dirties/frees the allocation and
compares edits; malformed-DVI failure followed by two valid conversions verifies
recovery on the same worker. The Unicode corpus compares PDF bytes after only
per-run stamps, SyncTeX, diagnostics, dependencies, geometry and glyph coverage.
Annual browser goldens, nested output and cross-host parity also pass.

2025 [ABBA qualification](https://github.com/corca-ai/wasmtex/actions/runs/37406282382)
passes all checks. Small-document compile medians change −7.8% to −2.5% for XeTeX
and −0.9% to −0.2% for Lua. The image probe changes XeTeX −1.6% to +1.5%, while
Lua first/repeat/edit/restore initially changes +2.3% to +4.1%. This was reviewed
rather than silently accepted. A focused Lua
[BAAB repeat](https://github.com/corca-ai/wasmtex/actions/runs/37407691683)
passes all checks; small compile medians change −0.67% to +0.71%, and image
compile/restore medians −0.36% to +0.37%. The initial slowdown does not reproduce.

2026 [first ABBA run](https://github.com/corca-ai/wasmtex/actions/runs/37406848499)
passes source-built growth/recovery, output, measurement, browser golden, nested
and cross-host checks. Small compile medians change −0.84% to +1.85% for XeTeX
and −0.14% to +0.61% for Lua; image compile/restore changes −0.32% to +1.34% for
XeTeX and +0.04% to +1.26% for Lua. Its final checkpoint test fails because it
hard-coded 2025 and loaded absent assets. The test now accepts the annual mirror;
local 2025 and 2026 checkpoint runs both pass. The corrected
[BAAB qualification](https://github.com/corca-ai/wasmtex/actions/runs/37408651383)
passes all checks, including both checkpoint paths. Its small compile medians
change −2.16% to −0.66% for XeTeX and −0.17% to +1.22% for Lua; image
compile/restore changes −0.94% to +0.61% for XeTeX and −0.82% to +0.67% for Lua.
Lua small initialization again increases (+8.44%), while image initialization
changes −2.38%. Initialization latency is not claimed unchanged.

All measurement runs checked out the prior baseline catalog before candidate
release pins were updated (the final run uses `996bdd9201405473a22ef71f77e58d5a8003441d`).
Future qualification now requires an explicit baseline catalog ref, resolves and
records its exact commit independently, and cannot silently follow candidate pins.
The baseline for this experiment is `fb5b66720fbb7fa0a427d824507c32230087e9ed`.

Aggregate sampled Unicode Chromium peak RSS is 1,117.5 → 938.5 MiB for 2025
and 1,122.2 → 927.2 MiB for the first 2026 run. The corrected 2026 BAAB run
measures 1,120.4 → 937.9 MiB. These are sampled sums of browser
process RSS, not private physical-memory budgets. The focused 2025 Lua run
measures 719.1 → 721.1 MiB: Lua's physical peak reduction is not established.
Its image first capacity also increases 184.38 → 189.38 MiB, despite lower
capacity after additional preamble fonts. Capacity savings are workload-specific.
Lua initialization varies, including +10.7% (about 19 ms) in the first 2026 small
run; compile-speed results cannot establish identical initialization latency.

The source-built measurements and independent review support retaining these
settings. Both corrected annual CI runs and release/provenance gates pass.
The published releases are `2025-e53a1aea7b7ebc88` and `2026-6d5129f5cbe00164`.
Their verified corresponding-source publication runs are
[2025](https://github.com/corca-ai/wasmtex/actions/runs/37410418827) and
[2026](https://github.com/corca-ai/wasmtex/actions/runs/37410421070).
Archive SHA-256 values are `38e1736e95599b58e3fd8ce60ce4a7b14f52d12173d4d2e787fba0111f362e3b`
and `2ee15d14b4618dd10c34780096ca96d37e1a98da04a13e6b044e9ec60df2c565`, respectively.
No consumer adoption is claimed before the separate host qualification.
