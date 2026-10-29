# pdfTeX startup and first PDF, October 2026

Current behavior belongs to [compile performance](../compile-performance.md),
[warmup](../warmup.md) and the [compiler API](../compiler-api.md).
This record describes a controlled October 29 experiment, not a network SLA.

## Inputs and method

Baseline SDK: `2944dcc51798da67dfe406b7fc58320ad3e6947c`.
Implementation/native build input: `1f8710cb0621f0bc713b5c1eaf7de28c76dd2eff`;
the final PR withdraws its experimental TikZ pass suppression. That withdrawal
changes SDK orchestration only. The native controller, transport preparation
and initialization paths measured below are unchanged.

| Annual line | Baseline engine | Candidate engine | Immutable mirror |
| --- | --- | --- | --- |
| 2025 | `2025-ce1320d67ac68cb8` | `2025-1af3a35a5a7866e6` | `2025-0d3fc73b65e39905` |
| 2026 | `2026-3c2c13bc1c39b68c` | `2026-d64ba6b955b0f06f` | `2026-ba38749b8714505a` |

Mirrors are `https://texlive.corca.ai/snapshots/<mirror>/<year>/`.
Both candidates retain every native WASM byte, generated engine JS byte and
published format byte from the baseline; only the pdfTeX controller changes.
The controller bundles its two resolver helpers and adds response-only
preparation. The build receipts retain original format-generation provenance.
The original pdfTeX format SHA-256 values are
`2c84dce536ab2c15d1430225ed6f18a10ef3d191e9c1e528557772ac1a8bf8dc` (2025) and
`fd1f4c0411b9bceb8562acd847b62da030b3b803b72799bff6c73dc095935bb5` (2026).

Native workflow runs: 40797687073 (2025), 40797690735 (2026).
Corresponding-source workflows: 40798465446 and 40799169670. Published archives
are attached to each candidate engine tag; their checksums are recorded in
that annual license manifest. Unaffected engine families retain their pinned
workflow runs and receipts.

Measurements ran serially in Chromium on macOS arm64, Node 24.22.1, with
tracing disabled. The original SDK was extracted into a separate immutable
library directory and its 324 files checked against the baseline Git archive.
A loopback HTTP proxy first populated responses from the exact annual mirror;
measured runs refused upstream cache misses. New browser contexts were empty;
repeat/body/preamble/restore stages retained their worker. Two preparation
runs preceded three measured repetitions per cell. Values below are medians.

The six synthetic inputs are a one-page note, eight-page math paper, 45-page
math document, bibliography document, mixed TikZ/tikz-cd document and a resolver
visibility probe. Ordinary pdfTeX covered all six at 0/60 ms response delay in
2026 and 60 ms in 2025. Checkpoint pdfTeX separately covered paper and large
inputs for those three environments. Delays apply to asset and mirror responses;
SDK module loading is outside the simulated link.

```sh
node scripts/gen-startup-corpus.mjs report/startup-corpus
node scripts/profile-font-cpu.mjs --engine pdflatex-checkpoint \
  --year 2026 --trace false --heap-stats true --save-pdf true \
  --repetitions 3 --prepare-runs 2 --latency-ms 60 \
  --project report/startup-corpus/paper.json \
  --sdk-dir <baseline-lib-or-lib> --assets <annual-asset-directory> \
  --texlive-url https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/ \
  --cache-dir <prepared-cache> --out <side-specific-report>
```

Repeat with the same cache and each side's assets/SDK; use `--engine pdflatex`
for plain mode, the other annual mirror for 2025, and `--latency-ms 0` for
CPU-oriented comparisons. `--bandwidth-mbps 8` or `2` additionally enables gzip
and a shared 16 KiB paced link for measured responses. This is a reproducible
throughput model, not TCP, a physical mobile connection or a deployed app test.

## Results

| Workload / condition | Baseline | Candidate |
| --- | ---: | ---: |
| Paper/checkpoint, 60 ms: initialization | 475.8 ms | 268.8 ms |
| Paper/checkpoint, 60 ms: first settled compile | 4,027.8 ms | 1,769.5 ms |
| Paper/checkpoint, 60 ms: body edit | 37.0 ms | 36.3 ms |
| Paper/checkpoint, 60 ms: preamble edit | 1,580.4 ms | 873.6 ms |
| Paper/checkpoint, 0 ms: first compile | 729.8 ms | 721.2 ms |
| Paper/checkpoint, 0 ms: body edit | 36.8 ms | 36.7 ms |
| Large/checkpoint, 0 ms: first compile | 971.7 ms | 955.7 ms |
| Large/checkpoint, 0 ms: body edit | 48.7 ms | 49.8 ms |
| Note/plain, 60 ms: initialization + first compile | 988.7 ms | 604.6 ms |
| Paper/plain, 60 ms: first compile | 3,854.4 ms | 1,580.4 ms |
| Large/plain, 60 ms: first compile | 4,005.5 ms | 1,751.5 ms |
| Bibliography/plain, 60 ms: first compile | 3,543.5 ms | 1,952.0 ms |
| Paper/checkpoint, 8 Mbps + 60 ms: init + first | 10,708.7 ms | 7,886.7 ms |
| Paper/checkpoint, 2 Mbps + 60 ms: init + first | 28,065.8 ms | 27,319.8 ms |

Warm-paper results are essentially unchanged; do not interpret millisecond
noise as a CPU speedup. Startup benefits come from shortening serialized I/O.
At 2 Mbps the approximately 5.4 MB compressed startup transfer dominates.
The format alone transfers about 3.6 MB and is already internally compressed.
No new format, font subset or package snapshot is introduced to hide that cost.

Speculation trades transfer for latency. In the unthrottled 60 ms paper case,
first-compile requests rose from 52 to 95, decoded bytes from 1,168,839 to
1,698,138. A broader font palette was rejected (106 requests, about 2.15 MB).
The accepted palette is narrower, is omitted when warmup already supplies
positive entries, and runs only on the first compile. Returning with learned
warmup made zero additional requests; initialization fell from 403.8 to
207.9 ms while compilation stayed about 280 ms.

The bounded response cache retained 447,849 bytes after the paper first pass,
434,069 after the 12-point preamble edit. Its 8 MiB bound is retained data,
not a wire-transfer limit. One dedicated memory comparison sampled the sum of
RSS of the owned Chromium process tree every 50 ms: 1,123,856 KiB baseline,
1,119,312 KiB candidate. Shared pages may be double-counted, samples can miss
peaks, and this is not the complete application's memory. Plain engine WASM
capacity grew from 64 MiB to about 207.7 MiB on both sides.

## Rejected pass suppression and preservation

Recognizing `tikzcd` before automatic externalization avoided a failing discovery
pass, roughly halving the synthetic case's first-compile CPU and avoiding one
book pass. Ordinary PDFs initially matched. Adversarial probes then demonstrated
that a failed pass can create `main.aux` or a custom `probe.dat`; subsequent TeX
branches observe these files. Suppression changed text in the final PDF.
The final implementation retains the preceding discovery/fallback behavior.
The generator includes both probes so this rejected result remains reproducible.
No extra PDF normalization or source-pattern exception was used to accept it.

All non-TikZ synthetic matrix cells preserved normalized PDF bytes, auxiliary
hashes, raw SyncTeX, diagnostics, dependency graphs and success/error results.
The rejected TikZ variant's differences are not evidence for the final release.
First-pass observation does not eliminate any canonical settling pass: it sends
an independent PDF copy to an optional callback. It supplies no canonical
SyncTeX or final metadata and adds no warm-edit work when omitted. Cancellation,
observer mutation/errors, worker replacement, source replacement and resolver
visibility are covered separately from timing.

## Dao of FP replay

The public book at commit `7a03427c75c830518aa6ffdbcf1b9d131f8f4cfc` was loaded unchanged as `DaoFP.tex` plus 22 chapter sources.
A serial real-browser replay used 32 bounded chapter checkpoints (256 MiB),
three edits in `22-DependentTypes.tex`, and a 363-page preview limit. Baseline
and final candidate produced equal normalized PDFs, all auxiliary outputs and
error arrays for the initial run and all three edits. Existing unsupported
`minted` diagnostics remain; this is not a claim that highlighting works.

The initial settled compile was 89.94 s baseline and 90.73 s candidate: there
is no claimed improvement in the book's TeX CPU or complete settling time.
The candidate delivered its first successful full-pass PDF at 34.52 s, allowing
a host to display provisional pages while the remaining passes ran. Its first
run had two additional speculative upstream misses (404s); this book timing is
a real-document cross-check, not the locked-cache synthetic comparison above.
Warm edit medians were 680.1 and 689.2 ms, within about 1.4%; each side used one
checkpoint pass. The optional observer was enabled in this diagnostic harness,
including edits; an integrating host can omit it once a PDF is already visible.

Reproduce with the browser book replay harness recorded in the PR evidence:
original public source, `--main DaoFP.tex --edit 22-DependentTypes.tex
--from 'Equality elimination tells' --to 'Equality elimination says'
--repetitions 3 --checkpoints 32 --checkpoint-mib 256 --page-limit 363`, the
same immutable 2026 mirror, and explicit baseline/candidate SDK and asset roots.
The harness and raw reports remain PR artifacts, not a runtime dependency.

## Controller byte budget

Bundling the two previously separate helper requests changes the unit of the
controller size check. The old 97,000-byte per-controller ceiling did not include
those 3,812 helper bytes. The final controllers are 100,127 bytes; the combined
baseline controller and helpers were 98,933 bytes on both annual lines. The new
101,000-byte controller ceiling therefore admits approximately 1.2 KB of actual
startup-script growth and the helper relocation. All WASM, format and runtime
limits stay unchanged. The initial CI build rejected the stale ceiling; the
new ceiling is supported by the startup, compressed-bandwidth and memory results
above, not by accepting an unmeasured regression.
