# TeX Live run files, Metafont fonts and extra lists, 5 November 2026

Current behavior belongs to the [engine guide](../engine.md), the
[mirror operations guide](../texlive-mirror-operations.md) and the
[compiler API](../compiler-api.md). This record is the evidence for the mid-cycle
snapshots the [lifecycle](../texlive-2026-snapshot-lifecycle.md) allows only for a severe
compatibility reason.

## Problem

The mirror selected twelve kpathsea formats, the engines could not make a bitmap font,
and the SDK ran makeindex and BibTeX on the main job only. A document that compiles
under TeX Live failed, or lost content without an error.

- XeLaTeX never converted quotes and dashes: `tex-text.tec` was missing, so ``` `` ```
  and `--` stayed literal in every document.
- 1,344 fonts that exist only as Metafont source failed on all three engines, among them
  `bbm`, `dancers`, `concmath`, `feyn` and `skull`.
- `luamplib` and `.mps` figures failed.
- `\usepackage[IL2]{fontenc}` failed, because `il2enc.def` sits under `tex/cslatex`.
- A misspelled font under XeLaTeX made about 350 requests and ran into the 150-second
  limit: `XeTeXFontMgr_FC` read every font to find the name.
- nomencl, glossaries, named indexes, multibib, bibunits and chapterbib came out empty.
  `\printindex` in an `\input` file did too, and a nested main file lost its BibTeX and
  index, because the stages looked for the job's files in the file's directory.

## Decision

Formats, engines and mirrors move together, on both annual lines, for the current
profiles. The mirror keeps every file it had, byte for byte, so a document only sees a
name it could not find before. Formats keep their bytes through `formatMirrorAncestors`.

Prebuilt PK files were rejected. They cover only the sizes someone generated, and
Metafont makes a font in about 23 ms. Running it in the worker covers every size and a
project's own `.mf`.

Lambda stays out: it needs Omega, and TeX Live records no license for it. So does
`DNP.sfd`, for the same license reason, with no font map naming it. `dvipdfmx.cfg` stays
out on purpose: it sets the PDF version, paper and permissions of every XeLaTeX PDF.

## Evidence

The built `wasmtex-metafont.js` against the real `mktexpk` of each pinned installation,
for every Metafont-only font, with one fixed date:

| | Byte-identical PK | Fail on both | Differ |
| --- | ---: | ---: | ---: |
| 2026, 600 dpi | 1,332 | 12 | 0 |
| 2025, 600 dpi | 1,332 | 12 | 0 |
| 2026, 720 dpi | 1,329 | 15 | 0 |

Metafont and GFtoPK together take 23 ms at the median, 48 at p90, 105 at p99 and 166 at
worst, on Node. Comparing against the real tool found what review could not: `callMain`
returns the exit status rather than throwing it, and `cioptic` scales itself past the
size asked for.

Twelve list documents on three engines in Chromium, old SDK, engines and mirror against
the new ones. A case passes when the list's text is in the PDF:

| | Before | After |
| --- | ---: | ---: |
| Correct | 0 of 36 | 36 of 36 |

A corpus of 77 runs across three engines on 2026 went from 45 compiled to 73, with no
regression. The four that still fail also fail under TeX Live: `fontspec` under pdfLaTeX
twice, and `.pfa` fonts under xdvipdfmx, which refuses them.

Mirrors, against the revisions they follow:

| | `2026-d26706764b740276` | `2025-2e1df8aa17d29d66` |
| --- | ---: | ---: |
| Files kept byte for byte | 161,360 | 157,460 |
| Files added | 8,305 | 8,294 |
| Bytes added | 95.5 MB | 95.5 MB |
| Published objects verified | 177,317 | 173,142 |

## Traps

- A case-insensitive volume silently keeps one of `Cherokee` and `cherokee`.
- web2c's bootstrap cannot run as wasm, and `make -k -j` deadlocks on it: build kpathsea
  first, then web2c serially, and let it stop at the bootstrap.
- pdfLaTeX's preamble snapshot drops every list opened in the preamble.
- `icudt68l.dat` is stored gzipped, and its recorded digest is of those bytes.
- kpathsea passes `1+57/600`, not `magstep(0.5)`, for 657 dpi: real pdfTeX shows it.
