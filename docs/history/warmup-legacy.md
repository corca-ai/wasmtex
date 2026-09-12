# Early warmup measurements

These figures were moved from the usage guide during the September 2026
cleanup. The original text did not provide a complete engine revision, browser,
network and cache reproduction record. Keep them as historical motivation,
not current product targets or proof of zero preparation cost.
Use the [warmup guide](../warmup.md) for current behavior and
[performance guide](../compile-performance.md) for qualified changes.

A real
document — a conference class, Times fonts, hyperref — needs many more files, and each
one the worker fetches on demand is a **serial** synchronous request that pays the full
mirror latency. Measured against the live mirror in a fresh browser context, that is
where a cold first compile goes (warm recompiles of the same documents take 0.1–0.2 s):

| Document | Mirror requests | No warmup | Built-in warmup | Exact set prefetched |
|---|---:|---:|---:|---:|
| article + amsmath (40 sections) | 19 | 8.3 s | 0.3 s (after a 5.3 s warmup) | 0.3 s (after a 1.5 s prefetch) |
| IEEEtran conference | 40 | 12–23 s | 11.5 s | 0.3 s (after 2.0 s) |
| NeurIPS 2026 | 89 | 31 s | 26 s | 0.4 s (after 2.4 s) |
| acmart sigconf | 185 | 57–175 s | 69 s | 0.8 s (after 5.0 s) |


## Performance

Measured with Playwright (Chromium, localhost dev server):

| Metric | Before | After |
|--------|--------|-------|
| Sync XHR during compile | 90 (64 OK + 26 wasted 403) | 0 |
| Time to first PDF | ~4.9s | ~2.9s |

The warmup fetch runs concurrently with other page initialization (Monaco loading, DOM setup), so the effective cost is near zero when called early enough.

