# Nested XeLaTeX output

The SDK transfers XeTeX's XDV under its job basename, matching the file XeTeX
actually produced. For `nested/main.tex`, that name is `main.xdv`. The original
source path remains unchanged for compilation, project inputs and diagnostics.

The SDK also truncates the current job's generated XDV before typesetting and
its generated PDF before conversion. Existing workers can report an old output
as successful after a fatal no-output compile. Empty outputs are rejected, so
the two-stage path cannot return a previous document as a fresh success.
Formats, auxiliary reference files, project source and package caches remain
available. No engine or mirror file changes; consumers update the SDK only.

## Coverage

The [shared corpus](../test/fixtures/nested-output.ts) exercises nested-first
compilation, root/nested/deep switches, repeated runs, shared inputs and PDF
imports. Both Node and browser CI run it for both supported annual lines and
all three engines. XeLaTeX additionally checks fatal failure and recovery;
this test does not qualify PDF/Lua failure freshness.
The [original investigation and qualification](history/nested-output-2026-09.md)
records the old failure and exact baseline releases.

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
