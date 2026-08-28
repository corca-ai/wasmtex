# TeX Live mirror coverage

- R2 prefix: `corca-texlive-production/snapshots/2025-92e10d3241a312f0/2025/pdftex/`
- Served by: `https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/`
- Total: **155976 objects**, **3.0 GB**

| fmt | kpathsea format | objects | size | status |
|---:|---|---:|---:|---|
| 3 | TFM font metrics (.tfm) | 78477 | 551.2 MB | present |
| 4 | AFM font metrics (.afm) | 3182 | 188.1 MB | present |
| 6 | BibTeX databases (.bib) | 77 | 10.4 MB | present |
| 7 | BibTeX styles (.bst) | 395 | 14.3 MB | present |
| 11 | font maps (.map) | 836 | 42.6 MB | present |
| 26 | TeX sources (.sty/.cls/.tex/...) | 26961 | 471.7 MB | present |
| 32 | Type1 fonts (.pfb) | 7576 | 715.9 MB | present |
| 33 | virtual fonts (.vf) | 28657 | 223.4 MB | present |
| 36 | TrueType fonts (.ttf) | 513 | 351.3 MB | present |
| 44 | encodings (.enc) | 5483 | 17.0 MB | present |
| 47 | OpenType fonts (.otf) | 2110 | 427.0 MB | present |
| 51 | Lua files (.lua) | 1709 | 57.2 MB | present |

## Notes

- pdfTeX-critical formats: 3, 6, 7, 11, 26, 32, 33, 44.
- XeLaTeX/LuaLaTeX additionally need 4 (afm), 36 (truetype), 47 (opentype), 51 (lua).
- The sync mirrors `tex/{latex,generic,plain,xetex,xelatex,luatex,lualatex}` — so
  engine-specific packages (`xeCJK`, `xetexko`, `luatexja`, …) are included.
- Run `--check` to gate a curated common-package set (catches per-tree gaps).
