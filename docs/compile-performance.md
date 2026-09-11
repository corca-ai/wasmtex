# Compile performance experiments

The September 2026 program adopts measured memory and warmup improvements
under the [engine optimization policy](engine-optimization-policy.md).
Its [tracker](https://github.com/corca-ai/wasmtex/issues/113) records each
experiment's decision. Application adoption is a consumer-owned follow-up;
WasmTex builds and qualifies independently of any integrating application.

## Adopted changes

| Change | Evidence and limits |
| --- | --- |
| Compact initial heap snapshots; XeTeX/LuaTeX initial memory 768 → 128 MiB | Restore copies the retained prefix and clears the omitted suffix. Growth remains enabled. A nine-run XeTeX/dvipdfmx experiment reduced peak RSS from 1178.02 to 948.45 MiB; warm median 245.81 → 241.77 ms. Cold time did not improve. |
| Supplied warmup for XeTeX and LuaTeX | Five alternating pairs per engine, 120 total compiles, all 60 paired PDF hashes match. Prefetch + initialization + first PDF median: XeTeX 17309.60 → 5700.50 ms; LuaTeX 13244.90 → 6231.30 ms. Warm medians: 237.00 → 238.10 ms and 452.30 → 452.40 ms. |
| Observe successful dvipdfmx file opens | Five alternating pairs, 60 compiles, all 30 paired PDF hashes match. Warm median 241.0 → 241.9 ms. Nine actually opened map/font keys become visible on native-cache hits; unused preloads stay absent. |
| Profile-bound dependency union | The public `mergeTexliveDependencySets` helper retains prior observed inputs only within the same profile/year/mirror. Applications choose persistence and storage bounds. |
| Independent Node worker HTTP headers | Temporary response-header filenames include the worker thread identity, preventing concurrent workers in one process from consuming each other's headers. |

Warmup figures are controlled Chromium measurements on the unchanged 2026
mirror through a read-only local proxy. They include prefetch cost and apply
to dependency replay into a fresh compiler. They are not production network
percentiles or an application-wide speed guarantee. The acceptance threshold
was fixed before measurement: at least 10% median preparation-through-first-PDF
improvement; investigate warm regressions above 10%.

`e2e/compile-pipeline-probe.ts` separates SDK preparation and compile spans.
Worker round-trips include synchronous I/O and messaging; they are not CPU
profiles. A consumer must measure its own queue, cache lifecycle, and PDF paint.
See [development measurements](develop.md) and [warmup](warmup.md).

## Withdrawn Unicode startup experiment

[PR #123](https://github.com/corca-ai/wasmtex/pull/123) added runtime preloads
and was published prematurely as `sdk-20260911-unicode-startup`. That release
is **withdrawn** and must not be adopted. Its immutable tag/assets remain as
audit evidence, with prerelease status and an explicit withdrawal notice.
The runtime change has been reverted; existing engine and mirror releases stay
unchanged. The consumer adoption was not merged.

Both preload variants violate the optimization compatibility policy. Injecting
extensionless aliases makes a plain document's `\IfFileExists` succeed too
early. Injecting canonical names avoids creating demand-time aliases, so the
same check becomes false after fontspec where the baseline returns true.
This affects `lmroman10-bold` in XeTeX and `fontspec` in LuaTeX. Ordinary
fontspec PDFs matching is insufficient: both states and their transition must
be covered. `src/engine/unicode-warmup.smoke.test.ts` tests that contract with
unchanged engine assets on both annual lines.

Retry only with a design that preserves resolver state transitions as well as
file bytes, including existing cache behavior. A transport-only prefetch or
format-scoped deferred byte cache may be a candidate, but neither is qualified
here. Startup gains from the rejected variants are not an adopted optimization.

## Deferred experiments

| Experiment | Decision and retry condition |
| --- | --- |
| [Skip intermediate PDF conversion](https://github.com/corca-ai/wasmtex/issues/118) | Rejected by a concrete compatibility counterexample: a missing-image error in the first pass disappears when conversion is skipped and a later pass omits that image. Retry only with an execution design that preserves existing failures. |
| [Font parsing cache](https://github.com/corca-ai/wasmtex/issues/119) | No production cache adopted. The [all-engine profile](#all-engine-font-investigation) resolves function attribution for four released binaries and qualifies XeTeX separately. Font-map construction is a better next target than sharing whole font objects; preserve map updates, iteration, diagnostics, and file-lookup behavior. |
| [XeTeX resume point](https://github.com/corca-ai/wasmtex/issues/120) | No production checkpoint port adopted. Both current annual XeTeX builds lack the resume ABI. A complete stack, stream, input, font, and XDV lifecycle design is required; pdfTeX's checkpoint measurements do not prove a XeTeX benefit. |

## Release qualification

The release candidates are `2025-d89c008b0cfdd8ca` and
`2026-189e605bad83d618`. They retain the original compressed formats and
immutable mirrors, without adding a TeX Live year or snapshot choice.
The [release evidence](license-evidence/compile-performance-de011da.md)
records exact build runs, source archive hashes, compatibility scope, and
clean rebuild results.

The corpus deliberately preserves and identifies existing defects. Nested
XeTeX main-file output can return an earlier PDF in a reused worker; this is
not successful nested-project support. An injected LuaTeX font-map warmup
failure also fails on the baseline. Neither behavior was silently changed to
make an optimization pass. Such fixes need their own correctness qualification.


## All-engine font investigation

[PR #130](https://github.com/corca-ai/wasmtex/pull/130) supplies the standalone
[CPU diagnostic commands](develop.md#engine-cpu-diagnostics) for
[issue #119](https://github.com/corca-ai/wasmtex/issues/119). This is measurement
infrastructure and a retry direction, not an adopted engine optimization.

The September 12 probe uses the released `2026-189e605bad83d618` assets and
`2026-ba38749b8714505a` mirror. Diagnostic build revision `b1c9f2d` retains the
same upstream pin and O2/toolchain settings. Its manual workflow runs are
[pdfTeX](https://github.com/corca-ai/wasmtex/actions/runs/34620766420),
[XeTeX/dvipdfmx](https://github.com/corca-ai/wasmtex/actions/runs/34620769331), and
[LuaHBTeX](https://github.com/corca-ai/wasmtex/actions/runs/34620771902).
These runs are not registered as release components.

Every non-custom WASM section matches the released binary for pdfTeX,
checkpoint pdfTeX, dvipdfmx, and LuaHBTeX (1,595, 1,615, 1,134, and 6,190 named
functions respectively). Only the named WASM replaces those baseline assets in
the diagnostic. XeTeX does **not** pass that identity test: imports, function
indices, code, and data differ. Its 3,783 names describe its own diagnostic
build, never the released function indices. Its generated JS and WASM are
therefore used together; its worker and formats remain the baseline files.
The reason for the XeTeX binary difference remains unproven.

The Chromium 145 probe uses an article with Latin Modern regular/bold/italic and
math, three fresh contexts per variant, then initialization, first compilation,
repeat, body edit, and preamble edit. Preparation downloads every exercised
input before measurement prohibits upstream misses. Loopback transfers still
occur in init/first/preamble stages; all repeat/body stages have zero HTTP
requests. Fixed worker clocks remove output metadata drift. All 48 measured
PDFs from named builds match the corresponding baseline normalized hashes.
This is one corpus's diagnostic consistency evidence, not release qualification
for other documents or for 2025.

| Path | Repeated-compilation observation | Interpretation |
| --- | --- | --- |
| Ordinary pdfTeX | About 38% of non-idle worker samples are under `fm_read_info`; 24% under `do_undump`. | Map construction and format loading dominate this small document more than font embedding. |
| Checkpoint binary, without a resumable prefix | About 42% under map loading and 20% under format loading. | Loading the Asyncify binary alone does not eliminate these costs. |
| Actual pdfTeX heap resume | A separate naturally paginated document resumes on all three body edits, median about 46 ms; no map-loading or inflate samples occur in that stage. | Existing checkpoint preparation already avoids those costs where resume is eligible. Count first-compilation/preparation costs separately. |
| XeTeX diagnostic build | About 5% under native-font loading; macro/token work and format loading are larger. | This corpus does not justify broad native-font-object caching. This is not byte-identical release profiling. |
| dvipdfmx | About 78% under `pdf_load_fontmap_file`; 41% under `ht_insert_table`. | Map-table construction is the strongest narrow follow-up for this stage. |
| LuaHBTeX | About 18% under format loading, 10% under `lua_load`, and 8% under map loading. | Lua interpreter samples alone do not identify luaotfload functions or reusable font values. |

These are inclusive sampling counts with idle samples removed, not exact CPU
timers or additive percentages. Profiler overhead prevents using the timings as
optimization speedups. The reports retain artifact hashes and requests; raw
traces must remain available alongside a measurement report.

Lua already retains generated `.lua`/`.luc` font caches across compiles: this
fixture has 15 files (5,420,415 bytes) after its first compile. Its names database
remains a 3,406,791-byte source chunk. A separate real-clock microbenchmark,
10 loads per observation over three contexts, measures about 24.3 ms to load
that source, 1.1 ms to load its 2,849,674-byte bytecode, 2.6 ms to execute the
chunk, and 1–3 ms to dump it. Those loops are not normal compile timings.
A private bytecode cache is only a candidate: no new names `.luc` is installed,
no pointers cross heap resets, and no filesystem-visible lookup is changed.

The next preferred experiment is dvipdfmx's font-map index. The exact mirror map
has 46,659 lines (5,609,407 bytes); the pinned source's hash table has 503
buckets and scans collision chains during insertion. Do not simply cache whole
font objects or enlarge every hash table: map replacement/deletion, subfont
expansion, freeing, and iteration order must stay equivalent. A map-specific
auxiliary index that preserves the existing record/iteration order is a narrower
design to investigate. Only a measured candidate passing the optimization policy
can be promoted. CorTeX adoption and its actual checkpoint/paint behavior remain
separate integrator measurements.
