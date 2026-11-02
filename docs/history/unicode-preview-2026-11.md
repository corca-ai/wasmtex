# LuaLaTeX and XeLaTeX page-prefix previews — November 2026

The [compiler API](../compiler-api.md#deferred-pdf-preview-parts) and the
[engine runtime](../engine.md) own the current contract. This record keeps the
measurements behind the XeLaTeX preview and the chapter-file previews. They use
only the 2026 engines (`engines-2026-b6584b4019bcab75`, mirror
`2026-ba38749b8714505a`) in Chromium through the browser book-edit lab
(`scripts/bench-book-edits.mjs --engine`). The 2025 line runs the same SDK code
but was not measured.

## XeLaTeX articles

The documents are 19–20 pages long. The preview limit is page 3, except page 11
for the mid edit. The table gives the median of 5 warm samples. Before this
change, each keystroke ran the full compile.

| document              | full compile | preview |
|-----------------------|--------------|---------|
| plain article (edit early) | 126 ms  | 85 ms   |
| plain article (edit p. 10) | 126 ms  | 106 ms  |
| natbib + BibTeX       | 556 ms       | 218 ms  |
| fontspec + natbib     | 370 ms       | 310 ms  |
| kotex                 | 685 ms       | 459 ms  |

## A 303-page book

The book has 24 `\include` chapters and 24 sections per chapter. Each edit is the
first paragraph of a chapter, and the limit is just past that chapter's start.
Times are the median of 3 warm samples.

| engine   | chapter (limit) | full compile | preview |
|----------|-----------------|--------------|---------|
| LuaLaTeX | 12 (p. 160)     | 2.59 s       | 1.57 s  |
| LuaLaTeX | 24 (p. 325)     | 2.58 s       | 2.57 s  |
| XeLaTeX  | 12 (p. 160)     | 1.35 s       | 0.77 s  |
| XeLaTeX  | 24 (p. 325)     | 1.35 s       | 1.33 s  |

Before this change, chapter edits had no preview on either engine. A 203-page
LuaLaTeX book previewed chapter 12 in 1.53 s, against 1.78 s for a full compile.

## Output preservation

Every preview page was rendered at 72 dpi and compared with the matching page of
the following full compile: 115 XeLaTeX article pages and 1,389 book pages, all
pixel-identical. Full compiles after previews matched the baseline build page for
page, which shows that the chapter aux restoration leaves nothing behind.

An earlier variant issued `\nofiles` from the begindocument hook instead of
restoring chapter aux files. It was dropped: `\nofiles` does not expand aux-write
arguments, which hides errors such as an undefined macro in a short caption. It
also removes `\if@filesw`-guarded write nodes, for example hyperref's index
entries, and those can move page breaks.
