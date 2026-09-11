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
| [Font parsing cache](https://github.com/corca-ai/wasmtex/issues/119) | No production cache adopted. The stripped profile cannot attribute font parsing reliably; existing font objects own streams and document-specific PDF resources. Obtain a symbolized profile and design a cache of document-independent values before claiming a gain. |
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
