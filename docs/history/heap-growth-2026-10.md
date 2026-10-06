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
The subsequent source builds must replace them for qualification and promotion.

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
quiet alternating runs. This does not establish Safari memory usage or a budget.

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

The initial source-only decision is to retain these candidates for qualification.
No source-built release or consumer adoption is claimed by the screening.
