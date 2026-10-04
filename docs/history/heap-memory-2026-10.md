# Initialization heap memory experiment — October 2026

Current behavior and release status belong to [compile performance](../compile-performance.md)
and [engine runtime](../engine.md). This record covers a controller candidate,
not an engine release or consumer rollout.

## Inputs and decision

The SDK checkout was `3c5abd0815b160b87c07c7f01b591674bc92149c`.
Baseline assets were downloaded with the hash-verifying asset sync script from
`https://corca-ai.github.io/wasmtex/`, separately for 2025 and 2026.
Both pdfTeX build receipts identify source revision
`7c4af55a477ab74329697d31ae735c5c47f191b1`, Emscripten 3.1.46, and these
build IDs:

- 2025: `51faed09ce37693854a569024302d5e28faf8a1950b2537c17fe09de3036f882`.
- 2026: `6f0e307c5b119d04ee1c3367b6430843ec7a4c795af2cb4cf7682f59b8116b80`.

The baseline controller SHA-256 is
`467e29f72a40c57b52a8262931f32d9f1b91c9309bb545d066877020be377a72`;
the final candidate is
`c21419f5ff26173910440e01778b924fc733c45c605588e1c8f99b2897c69e74`.
Only that controller was replaced in temporary candidate asset trees.
Generated modules, ordinary/checkpoint WASM, base formats, and all other
engine assets remained identical. Copied receipts describe the baseline;
these temporary trees are test inputs, not redistributable release assemblies.

| Year | Unchanged pdfTeX WASM SHA-256 | Reused base format SHA-256 |
| --- | --- | --- |
| 2025 | `3f668f6ae6b2aacc76a7b2afa2d3130c17a4128732b2ba50aa5f3bd86af80216` | `2c84dce536ab2c15d1430225ed6f18a10ef3d191e9c1e528557772ac1a8bf8dc` |
| 2026 | `a31424bd06c7e407053afbf117c2a18ec439d943f9f557165b38fbb651c1335e` | `fd1f4c0411b9bceb8562acd847b62da030b3b803b72799bff6c73dc095935bb5` |

Mirrors were `https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/`
and `https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/`.
HTTP caching proxies returned those exact responses without injecting files
or changing resolver aliases.

Decision: retain the source candidate for qualification. Its memory reduction
is directly observable, focused comparisons preserve output, and the small
browser probe shows similar initialization and slightly lower full-pass times.
Promotion still requires the complete [optimization policy](../engine-optimization-policy.md).

## Representation and measurements

pdfTeX previously retained a full 64 MiB initialization heap copy. The candidate
retains only the prefix through the last nonzero 8-byte block and clears every
byte after that prefix on reset, including grown pages. This preserves its
existing reset semantics and leaves resumable heap checkpoints unchanged.
`Object.is(value, 0)` identifies exactly an all-zero Float64 block: negative
zero, NaNs, and their original payload bytes must remain in the byte copy.

The 2026 ordinary and checkpoint browser probes both reported 991,200 bytes
retained instead of 67,108,864: **63.05 MiB less per worker**. This is retained
snapshot storage, not a measurement of process RSS. In the ordinary repeat
probe, linear memory still reached 356,974,592 bytes (340.44 MiB) on both sides.
Reducing the initial allocation alone therefore would not address that
document's steady-state capacity.

Timing environment: macOS arm64, Node v24.18.0, Chromium 145.0.7632.6.
`profile-font-cpu.mjs` ran without tracing, using its built-in Latin Modern,
amsmath, bold/italic/math document and fixed worker clock. Each series first
prepared its mirror cache; measured runs rejected upstream cache misses.
Loopback requests and controller/SDK setup remain included. Five fresh-context
ordinary repetitions and three checkpoint repetitions supplied the medians.
Series were separate rather than a randomized interleaved experiment; small
timing differences are descriptive, not a statistically established speedup.

| 2026 ordinary stage | Baseline median (ms) | Final candidate median (ms) |
| --- | ---: | ---: |
| Initialization | 22.6 | 22.4 |
| First compile | 320.8 | 314.9 |
| Unchanged repeat | 91.7 | 89.5 |
| Body edit | 85.4 | 82.8 |
| Preamble edit | 254.3 | 249.2 |

Median initialization-snapshot capture was 7.9 → 8.3 ms; median repeat heap
reset was 8.7 → 6.3 ms. A preliminary scalar 4-byte scan had increased
initialization from 22.6 to 24.0 ms. Scanning 8-byte blocks removed that observed
initialization regression; byte-pattern tests cover the wider scan.

| 2026 checkpoint stage | Baseline median (ms) | Final candidate median (ms) |
| --- | ---: | ---: |
| Initialization | 25.1 | 24.6 |
| First compile | 426.6 | 413.5 |
| Unchanged repeat | 33.7 | 34.6 |
| Body edit with required heap resume | 32.0 | 32.0 |
| Preamble edit | 292.3 | 285.1 |

The 0.9 ms checkpoint-repeat increase is retained in the evidence. Initial
snapshot storage is separate from the sparse resumable checkpoint used by
that path; the unchanged resume timing does not establish a general speedup.

## Verification and reproduction

Use separate baseline/candidate public trees, replace only the candidate
`wasmtex-pdftex.worker.js` with the authored controller, and reuse the baseline
formats. Run each year with the matching mirror:

```bash
node scripts/check-output-preservation.mjs \
  --baseline "$BASELINE_PUBLIC" --candidate "$CANDIDATE_PUBLIC" \
  --texlive-version "$YEAR" --texlive-url "$MIRROR" --engine pdflatex

WASMTEX_HEAP_BASELINE_DIR="$BASELINE_PUBLIC" \
WASMTEX_SMOKE_PUBLIC_DIR="$CANDIDATE_PUBLIC" \
WASMTEX_SMOKE_TEXLIVE_VERSION="$YEAR" \
WASMTEX_SMOKE_TEXLIVE_URL="$MIRROR" \
npx vitest run src/engine/unicode-heap-restore.smoke.test.ts -t pdflatex

node scripts/profile-font-cpu.mjs \
  --assets "$ASSETS" --year 2026 \
  --texlive-url https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/ \
  --engine pdflatex --trace false --repetitions 5 \
  --cache-dir "$CACHE" --out "$REPORT"
```

Repeat the last command for each side. For the checkpoint comparison, use
`--engine pdflatex-checkpoint --checkpoint-probe true --repetitions 3`.
Raw reports were retained locally under `/tmp/wasmtex-memory-*`; they are
session artifacts, not a published qualification bundle.

Final-controller checks:

- Both years: the article and font/microtype fixtures matched at root and
  nested main-file paths, eight baseline/candidate PDF comparisons in total.
- Both years: real-core differential passed body edits, project-local
  preamble-input edits, restoration of the original project, and repeats;
  PDFs, SyncTeX, auxiliary output and diagnostics matched. The test rejects
  regenerated base formats and verifies unchanged WASM/module/format hashes.
- Final 2026 ordinary and checkpoint browser reports matched normalized PDF
  hashes, auxiliary/SyncTeX hashes, diagnostics, dependencies and logs across
  their measured stages. The checkpoint probe required actual body-edit resume.
- The scalar intermediate controller also passed the 2025 cold-format fallback
  smoke with preamble snapshots enabled and disabled. That real-core test was
  not repeated after changing the scan width; final-controller unit tests cover
  format fallback and bit-exact heap restoration.
- Final unit suite: 1,785 passed, 33 skipped; typecheck and source/worker lint passed.

No real-browser RSS measurement, broad project-switch/image corpus, full annual
browser/Node parity matrix, 2025 browser timing series, release/source assembly,
or consumer rollout was qualified here.

## Remaining three-engine candidates

A direct 2026 worker-boot screening counted nonzero 64 KiB pages. XeTeX retained
37,740,512 prefix bytes but only 1,179,648 bytes of nonzero pages; LuaHBTeX
retained 39,280,608 versus 2,031,616; dvipdfmx retained 33,939,424 versus 327,680.
The page count rounds up every page containing any nonzero word; it is not
a measured compressed representation or process memory reduction. XeTeX was
measured **before ICU registration**, so these counts cannot describe its
post-compile snapshot.

These results suggest omitting internal zero runs, beyond the zero suffixes
already omitted by Unicode controllers. That representation was not implemented
or timed. Qualification must include capture cost, restoration, ICU re-snapshot,
the existing grown-page boundary, and real browser/Node output comparisons.

Reducing `texmf.cnf` capacity limits or discarding warm package/font caches is
not a demonstrated transparent optimization: the former can reject documents
that previously compiled and the latter can increase repeat latency or change
file-existence behavior. Dynamic allocation that preserves the original limits
requires a separate source-level investigation.

## Unicode continuation: sparse snapshots and ICU ownership

This continuation supersedes the preceding unimplemented-candidate status and
RSS limitation for Unicode engines. The earlier pdfTeX evidence remains as
recorded. The source now packs occupied regions from 64 KiB pages, dropping
all-zero pages and each page's zero suffix. Adjacent regions share a range;
the representation stores one byte payload and one Uint32 range table.
Restoration writes those bytes and clears every omitted gap within the original
snapshot extent. Later-grown memory keeps the existing Unicode reset behavior.
All-zero Float64 detection preserves negative zero and original NaN payloads.

XeTeX additionally releases its fetched JS ICU buffer only after C registration
and the subsequent heap capture succeed. Registration failures retain the
original bytes for retry. The registered C copy and pointers remain in the
snapshot; subsequent compilations neither refetch nor register ICU again.
Build scripts concatenate the helper before the three Unicode controllers,
preserving self-contained worker URLs without adding a runtime asset fetch.

The candidate uses the same baseline annual trees and mirrors as above.
Only authored controllers were replaced. Generated JS, ordinary/checkpoint
WASM and existing annual base formats remained unchanged. Receipts copied into
temporary trees still describe baseline files; these trees must not be released.

| Year/family | Baseline source revision | Baseline build ID | Reused compressed format SHA-256 |
| --- | --- | --- | --- |
| 2025 XeTeX | `4f3062161edd452dfd96b4b75b807b0234f63689` | `f5a1e7771c33ba32a8756763ee75d352a82cf04fc92b7402c8b94339f1d72642` | `258e48b659a8bff856137085635995395a837463031f01699b6c98d19f25e360` |
| 2025 LuaHBTeX | `53abbd1a636e27b41f1ee11967a8b7e1cae289b0` | `dbb27ea6d44d90139fefd4d11f17f7b7885b9d2b6b28393ca46ab3635ca9c687` | `a4be34ba99e674de1ccac776a8fd2ee484818d6ed5990994b03a9f9b5f8052f2` |
| 2026 XeTeX | `4f3062161edd452dfd96b4b75b807b0234f63689` | `b9f3c132f703c5444e7561c745ba3176df09f124293387590eb17f349cfe443c` | `0b2bb28f6de7793488fdc11cfc1f6ff42c631d93486530f879036ec4b5307513` |
| 2026 LuaHBTeX | `74554154804d40c3282dccdc865e0b486f5ccbd3` | `cbd23c05ecc462a2c21a55f520635239c200d85e22ef250a4c06abeafd0e417b` | `f27efefbfc90dca3b564e726e653c22b3d54e943c397d0500162eeca3139ce97` |

Helper SHA-256:
`7e9718aa8afac3801fd9baedc8900c6a4be8b98cefc07b162e548a421aafe553`.
Final emitted controller SHA-256 values, identical across staged years:

- XeTeX: `1694efccaae1dd6466ae6028d3c46bb4414795e2af3161014ee7fd48dc208d35`.
- LuaHBTeX: `dbaad9f2414b37a974a776aba92e76a000e801ce28987b8a192ad23a4c129bfb`.
- dvipdfmx: `64f570480bab7870caf45dbd39525d8631450bd4a3820655b86f916d458bd979`.

### Retained storage and process RSS

The 2026 browser probes reported the following snapshot storage, including
range metadata. XeTeX values below include its real ICU registration.

| Worker | Baseline bytes | Candidate bytes | Saved MiB |
| --- | ---: | ---: | ---: |
| XeTeX after ICU registration | 66,306,016 | 29,677,048 | 34.93 |
| dvipdfmx | 33,939,424 | 286,960 | 32.09 |
| LuaHBTeX | 39,280,608 | 1,894,800 | 35.65 |

XeLaTeX's combined retained snapshot storage was 95.60 → 28.58 MiB.
Its separate raw ICU JS buffer went from 28,566,176 bytes (27.24 MiB) to zero.
The expected retained-storage reduction across both workers and that buffer
is therefore 94.27 MiB. The WASM copies of ICU data remain required.
LuaHBTeX's snapshot was 37.46 → 1.81 MiB.

WASM capacity remained identical on both sides: the XeTeX repeat reached
520,355,840 bytes, with dvipdfmx at 268,435,456; LuaHBTeX reached 278,396,928.
XeTeX's reset extent remained 134,217,728 bytes and the converter's remained
268,435,456. This changes retained copies, not engine allocation limits.

Separate three-repetition memory runs used `sample-browser-rss.mjs` around the
browser harness with `--trace false --heap-stats true`. XeLaTeX's final sampled
aggregate peak RSS was 1,236.06 → 1,144.19 MiB (33/32 samples, 91.88 MiB lower).
LuaLaTeX was 787.0 → 750.7 MiB (69/68 samples, approximately 36.3 MiB lower).
This includes Chromium renderer, GPU and utility processes; shared mappings may
be counted more than once. It excludes unrelated Chrome instances and the Node
mirror-response cache. Polling is at least 100 ms apart and can miss short peaks.
These paired observations are not guaranteed private physical-memory budgets.
Timing claims use separate unsampled runs.

A direct real-heap screening separately measured capture/reset medians over
15 recorded iterations after five warmups, alternating implementations, before
the final raw ICU ownership change:

| Snapshot | Capture baseline → sparse (ms) | Reset baseline → sparse (ms) |
| --- | ---: | ---: |
| XeTeX before ICU | 9.756 → 8.548 | 0.935 → 0.530 |
| XeTeX after real ICU registration | 7.442 → 5.544 | 1.203 → 0.829 |
| LuaHBTeX | 9.763 → 8.433 | 0.959 → 0.538 |
| dvipdfmx | 21.780 → 17.020 | 1.393 → 1.023 |

Dirty-fill followed by restoration matched every byte across the original
128/256 MiB extent. These are microbenchmarks, separate from compile timings.

### Browser timing and noise

The environment, document and warmed immutable mirror cache match the earlier
pdfTeX measurements. No native validation jobs ran during the final latency
series. Each series uses five fresh contexts and includes init, first compile,
repeat, body edit and preamble edit. Comparisons retain fixed worker clocks.

For the final XeTeX controller, two candidate and two baseline series supplied
ten observations per stage. Series order was candidate, baseline, candidate,
baseline, with the separate RSS pair between the first and second pairs.

| XeLaTeX stage | Pooled baseline median (ms) | Pooled candidate median (ms) |
| --- | ---: | ---: |
| Initialization | 50.95 | 42.75 |
| First compile | 362.35 | 360.35 |
| Repeat | 173.60 | 173.40 |
| Body edit | 169.10 | 168.90 |
| Preamble edit | 185.15 | 187.15 |

The first pair's repeat was 171.4 → 177.0 ms and preamble edit 182.9 → 191.0 ms;
the second pair was 175.2 → 172.8 ms and 187.1 → 184.5 ms. Retain those
differences: pooling does not prove that every workload has unchanged latency.
The small pooled preamble increase is approximately 1.1%.

LuaLaTeX used baseline/candidate/candidate/baseline series (ten samples per side):

| LuaLaTeX stage | Pooled baseline median (ms) | Pooled candidate median (ms) |
| --- | ---: | ---: |
| Initialization | 48.25 | 47.25 |
| First compile | 736.85 | 709.00 |
| Repeat | 397.40 | 381.90 |
| Body edit | 387.95 | 378.45 |
| Preamble edit | 589.05 | 572.55 |

The first adjacent Lua pair's repeat was 383.4 → 383.7 ms; baseline repeat
medians drifted from 383.4 to 410.1 ms across the sequence. An earlier pair
overlapped native compatibility jobs and suggested a substantial candidate
slowdown; it is excluded from latency conclusions. Quiet repetitions did not
reproduce that slowdown. This is evidence of similar small-corpus compile cost,
not a statistically established speedup or a universal no-regression guarantee.

### Verification and reproduction for the continuation

Stage each controller by concatenating the helper and authored controller;
retain all baseline modules, WASM and formats. Run the documented
[heap and annual compatibility probes](../engine-testing.md#cross-host-node-engine-tests)
with the matching immutable mirror and both annual asset trees. For the broad
corpus use:

```bash
WASMTEX_UNICODE_COMPAT=1 \
WASMTEX_HEAP_BASELINE_DIR="$BASELINE_PUBLIC" \
WASMTEX_SMOKE_PUBLIC_DIR="$CANDIDATE_PUBLIC" \
WASMTEX_SMOKE_TEXLIVE_VERSION="$YEAR" \
WASMTEX_SMOKE_TEXLIVE_URL="$MIRROR" \
npx vitest run src/engine/unicode-compatibility.smoke.test.ts
```

Use the earlier browser command with `--engine xelatex` or `--engine lualatex`,
`--trace false`, five repetitions, identical cache and separate report paths.
For retained-storage and RSS counters follow the
[separate memory-run instructions](../engine-testing.md#engine-cpu-diagnostics).
Raw Unicode reports remain session artifacts under `/tmp/wasmtex-sparse-*` and
`/tmp/wasmtex-final-*`; they are not a published qualification bundle.

Both years passed the real-core edit differential for XeLaTeX and LuaLaTeX.
Both years also passed the broader Unicode feature corpus: unicode math,
embedded PDF, TikZ, project fonts, Korean glyphs, bibliography, index, nested
main paths, expected TeX errors, recovery and repeats. Comparisons check PDFs,
auxiliary files, SyncTeX, diagnostics, dependencies and glyph geometry using
baseline formats, rejecting regenerated formats. The ICU ownership change was
followed by another annual XeLaTeX corpus pass; Lua's runtime code was unchanged.
Final browser reports matched all measured normalized PDFs, auxiliary/SyncTeX
hashes, diagnostic/error objects, dependencies, converter inputs, geometry and
logs, while unaffected core/format hashes matched.

The authored-controller unit suite covers exact byte restoration, zero heaps,
separated ranges, negative-zero/NaN payloads, repeated runs, engine-specific
memory-growth boundaries, and ICU registration success, failure/retry and
capture after growth. Build scripts passed shell syntax checks; worker lint
includes all 14 authored controllers/bridges, including the shared helper.
The final default unit suite passed 1,793 tests with 33 skipped; typecheck and
source/worker lint passed. License-tool tests passed 99 checks, and the annual
license inventories and release-notice check passed against unchanged releases.

Decision: retain the source candidates with measured storage reduction and
similar small-corpus timing. No annual browser/Node parity matrix, broad
project-switch/image qualification, source rebuild/release assembly, 2025
browser timing or consumer rollout is claimed. The optimization policy still
governs promotion.

## Annual release qualification

The source-only decision above describes the experiment before promotion.
Subsequent release qualification rebuilt all affected families from
`544ade05da6c87959b5253f7b097a8fe0fbe31dc` and preserved the original formats.
Source PR [#184](https://github.com/corca-ai/wasmtex/pull/184) passed CI,
CodeQL, annual browser goldens, nested output and Node/browser parity before
merging. The release assembler pins these successful builds:

| Year | pdfTeX / BibTeX | XeTeX / converter | LuaHBTeX | Original format runs: pdf / Xe / Lua |
| --- | --- | --- | --- | --- |
| 2025 | 37180497408 | 37180499923 | 37180502805 | 33882993861 / 33882993816 / 33882993731 |
| 2026 | 37180498587 | 37180501256 | 37180504675 | 33885489901 / 33885502236 / 33885505118 |

Unchanged BibTeX8 and MakeIndex families retain their previous build pins.
Schema-2 receipts record engine and format provenance separately. The releases
are `2025-6d7baaeed54984d4` and `2026-b614b6f4378863d1`; complete corresponding
source is published on their matching `engine-<releaseId>` tags. The SDK
release registration owns archive hashes and workflow-run identities.

Both annual rebuilt sets preserve ordinary/checkpoint pdfTeX, LuaHBTeX,
BibTeX and dvipdfmx core bytes. Emitted controllers match those measured in
the source experiment. XeTeX relinking changed core bytes, so both rebuilt
annual engines repeated the real-core output/edit/abort/recovery differential
and the broad Unicode feature comparison using the original formats. All
four selected tests passed. No output goldens or format files were refreshed.
The rebuilt 2026 XeTeX browser probe also preserved all 16 normalized outputs,
auxiliary/SyncTeX hashes, diagnostics, dependencies, converter inputs, glyph
geometry, logs and file requests against the baseline memory probe.

Annual controller qualification additionally passed browser golden/nested
output (11 tests per year), Node/browser parity, project-switch images,
headless lifecycle and missing-format fallback (12 tests per year).
Checkpoint and headless incremental SyncTeX passed all three tests per year.
Those test harnesses now honor the annual smoke profile and asset override;
the previous hardcoded public directory/year prevented annual staging.
Release PR gates repeat output and host-parity checks against assembled builds.

Separate rebuilt-asset memory runs sampled aggregate browser peak RSS of
940.70 → 868.72 MiB for pdfLaTeX (28/27 samples) and 1,144.9 MiB for XeLaTeX
(32 samples). The prior same-harness XeTeX baseline was 1,236.06 MiB.
The rebuilt XeTeX/converter retained 29,677,048 + 286,960 snapshot bytes and
zero fetched ICU bytes after first compilation. Linear-memory capacities and
reset extents stayed unchanged. Lua's controller and core bytes match its
measured candidate. These sampled RSS runs are memory evidence, not latency
benchmarks; shared-page accounting and missed short peaks still apply.

The quiet small-corpus timing evidence above remains the performance basis.
It does not prove universal speedup or production latency: the pooled XeTeX
preamble edit was approximately 1.1% slower, within observed run variability.
Consumer adoption must qualify its canonical annual profiles, browser cache
lifecycle and deployment separately. CorTeX owns that adoption and rollback;
its checkout is not needed to build or use these WasmTex releases.
