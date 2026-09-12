# Nested XeLaTeX output

The SDK transfers XeTeX's XDV under its job basename, matching the file XeTeX
actually produced. For `nested/main.tex`, that name is `main.xdv`. The original
source path remains unchanged for compilation, project inputs and diagnostics.

Previously the SDK transferred `nested/main.xdv`. The dvipdfmx C entry retained
that directory in its explicit `-o nested/main.pdf`, but the Worker read
`/work/main.pdf`. The PDF existed and the SDK reported failure. This is
[#135](https://github.com/corca-ai/wasmtex/issues/135).

The SDK also truncates the current job's generated XDV before typesetting and
its generated PDF before conversion. Existing workers can report an old output
as successful after a fatal no-output compile. Empty outputs are rejected, so
the two-stage path cannot return a previous document as a fresh success.
Formats, auxiliary reference files, project source and package caches remain
available. No engine or mirror file changes; consumers update the SDK only.

## Regression evidence

The new real-worker regression fails before the fix: the 2025 converter logs
`nested/main.xdv -> nested/main.pdf` and 9,430 bytes written, but returns no PDF.
The first corrected path run additionally exposed stale output after a missing
class; the XeTeX freshness fix addresses that failure as part of the handoff.

The [shared corpus](../test/fixtures/nested-output.ts) exercises nested-first
compilation, root/nested/deep switches with identical basenames, repeated
compiles, shared TeX inputs and an imported PDF. Expected page counts distinguish
the documents, and dependency evidence must retain the real source paths.
XeLaTeX additionally checks fatal failure followed by recovery on the same
compiler. Failure freshness for pdfLaTeX/LuaLaTeX is not qualified by this test.

Both 2025 and 2026 pass in Node and Chromium using the published
`2025-df051f6f6b50575f` and `2026-ef72b734a6c387d0` assets: 124 successful
compile calls and four expected XeLaTeX failures. Each compile call may perform
automatic reference reruns. CI runs both hosts and all three engines for each
annual line; this is not an opt-in-only local guard.

## Reproduction

Install the pinned release assets as described in the [engine guide](engine.md).
For each annual line, set its matching immutable mirror and run:

```sh
NESTED_OUTPUT_SMOKE=1 WASMTEX_SMOKE_TEXLIVE_VERSION=2026 \
WASMTEX_SMOKE_TEXLIVE_URL=https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/ \
npx vitest run src/engine/nested-output.smoke.test.ts

TEXLIVE_VERSION=2026 \
TEXLIVE_URL=https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/ \
npx playwright test nested-output --workers=1
```

The [development guide](develop.md) describes broader golden and cross-host
verification. Historical font-map evidence in [compile performance](compile-performance.md)
retains its original failed nested cases; this later SDK fix does not rewrite
those results or the engine release receipts.
