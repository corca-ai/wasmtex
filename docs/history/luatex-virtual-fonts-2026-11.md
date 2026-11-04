# LuaLaTeX virtual fonts and the rebuilt format, 5 November 2026

Current behavior belongs to the [engine guide](../engine.md). This record is the
evidence for the first release that deliberately changes format bytes, and so falls
outside the [optimization contract](../engine-optimization-policy.md).

## Problem

Three symptoms had one cause.

- A document using a virtual font failed: `\usepackage[T1]{fontenc}\usepackage{times}`
  stopped with `font ptmb8t at 720 not found`. The heap checkpoint record called this a
  Node host issue. Chromium failed the same way.
- A document using `\int`, `\sum` or a large delimiter without `amsmath` lost those
  symbols with `\textfont3 is undefined`. `amsmath` redeclares the shape, which hid this.
- A `picture` lost its lines, circles and arrows with `Missing character … in font
  nullfont`, with or without `amsmath`.

LuaTeX finds a file, then looks the returned path up again before opening it, and TFM
and VF search by suffix alone. The worker cached a VF as `/tex/ptmb8t`, and a TFM
requested by bare name the same way, so the second lookup failed:

- `font.read_vf` returned nil, the font stayed a real one with no outline, and the
  backend asked for a bitmap;
- under INITEX, the fonts `preload.ltx` loads directly failed, and `nullfont` was dumped
  into the format for `cmex10`, `line10`, `linew10`, `lcircle10` and `lcirclew10`.

XeLaTeX compiled all ten test packages cleanly and needed no change.

## Change

- [#228](https://github.com/corca-ai/wasmtex/pull/228): the cache name carries its
  format's suffix on the fetch and preload paths. This also keeps a TFM and a VF of one
  bare name apart, which the pdfTeX worker already did.
- [#229](https://github.com/corca-ai/wasmtex/pull/229): source candidates can rebuild a
  family's format.
- This registration drops `luahbtex` from `reusedFormats` on both lines, so the format
  from the build run ships with that run's receipt.

The worker fix alone cures virtual fonts and keeps every document that already compiled
byte-identical. CorTeX's owner chose to rebuild the format too and to apply it to
existing projects, because a project that lost glyphs would otherwise stay broken.

## Evidence

Ten font packages under LuaLaTeX on the Node host:

| | Replaced engines | These engines |
| --- | ---: | ---: |
| 2026, compiled without errors | 1 of 10 | 10 of 10 |
| 2025, compiled without errors | Not measured | 10 of 10 |

The packages are `bookman`, `courier`, `helvet`, `lmodern`, `mathpazo`, `mathptmx`,
`newtx`, `palatino`, and `times` in OT1 and T1.

A `picture` with `\line`, `\vector`, `\circle` and `\oval` under `amsmath` went from 21
missing characters to none on the 2026 line, and its PDF now embeds `LINE10` and
`LCIRCLE10`.

`check-output-preservation.mjs` reports every LuaLaTeX document as changed, because the
format's extra font shifts internal font numbers. These rendered comparisons replace it
for this release: 200 dpi, each annual line, replaced engines against these.

| Document | Pages per line | Pages that differ | Extracted text |
| --- | ---: | ---: | --- |
| Plain paper | 19 | 0 | Same |
| `fontspec` paper | 20 | 0 | Same |
| kotex paper | 19 | 0 | Same |
| `article.tex` | 1 | 0 | Same |
| `amsmath` display equations | 1 | 0 | Same |

`e2e/luatex-virtual-fonts.spec.ts` and `e2e/luatex-heap-checkpoints.spec.ts` passed in
Chromium and Firefox on both lines, and the Node checkpoint smoke passed on both. In
CorTeX on Chromium, a `times` paper that had no PDF before reached p50 127 ms from key to
paint with a heap checkpoint.

## Artifact and source identities

| Annual line | Replaced | Candidate | Source publication |
| --- | --- | --- | --- |
| 2025 | `2025-8bd02eae82d829b9` | `2025-2d95644e29895a31` | [41860981585](https://github.com/corca-ai/wasmtex/actions/runs/41860981585) |
| 2026 | `2026-a2ba15ed61241a24` | `2026-dbaca62a3a06cebd` | [41860974636](https://github.com/corca-ai/wasmtex/actions/runs/41860974636) |

LuaHBTeX and its format come from build
[41850257797](https://github.com/corca-ai/wasmtex/actions/runs/41850257797) of main
`c8b5f0d`. pdfTeX/BibTeX stay on run 41777480728, and the pdfTeX and XeTeX formats stay
reused. Against the replaced engines, only `wasmtex-luatex.worker.js`,
`wasmtex-luatex.fmt.gz`, the LuaHBTeX receipt and the manifests change.

## Limits

- The rendered comparison covers the corpus above, not every package.
- A font that exists only as Metafont, such as `bbm`, still fails under LuaLaTeX: this
  worker has no bitmap path, unlike the pdfTeX worker.
- The Node host and this corpus can't show every effect of a font number shift on
  tools that read PDF internals.
