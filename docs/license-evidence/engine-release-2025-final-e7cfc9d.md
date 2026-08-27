# TeX Live 2025 final engine release evidence (`e7cfc9d`)

This record covers engine release `2025-e7cfc9d2bc434fd3` for the immutable
TeX Live 2025 `tlnet-final` mirror `2025-0d3fc73b65e39905`. All six build
receipts name WasmTex revision
`a3dab435c3c780b736086744584ae1dc01f72fc5` and TeX Live source revision
`143f1723353b20202645f241db429b080a8adcdf`. Every receipt also names mirror
revision `2025-0d3fc73b65e39905`, its immutable public URL, and provenance
SHA-256 `f43c385400b1f5ecdc8708ee73519ddcd618a13d649dccfde86ceea6f3534697`.

## Build and mirror identity

The GitHub Actions build jobs ran their Docker build and format-generation
paths on Linux x86_64 (`linux/amd64`). The receipt-bound release contains 32
files across pdfTeX, BibTeX, BibTeX8, MakeIndex, XeTeX/dvipdfmx, and LuaHBTeX.
`scripts/gen-asset-manifest.mjs 2025 --release` accepted every file and derived
release ID `2025-e7cfc9d2bc434fd3`.

The official frozen input is
`systems/texlive/2025/tlnet-final`. Its `texlive.tlpdb` SHA-256 is
`74b5744d2ff1386138d5361d3af49179f921dbbc953e449324d99448af092f41`.
The generated mirror provenance records 157,460 flattened TeX Live files,
4,267 packages, 60 byte-identical or reviewed collisions, and no unreviewed
package. Its five mirror-coupled runtime artifacts all name mirror revision
`2025-0d3fc73b65e39905`; the provenance SHA-256 recorded by the artifact
manifest is
`f43c385400b1f5ecdc8708ee73519ddcd618a13d649dccfde86ceea6f3534697`.

R2 publication verified all 164,778 release objects by exact key, size, and
SHA-256 under
`snapshots/2025-0d3fc73b65e39905/2025/`. The older 2025 mirror remains at its
separate immutable identity and was not overwritten.

## Runtime qualification

The freshly assembled engine assets and final R2 mirror passed:

- all seven browser golden cases (pdfLaTeX, XeLaTeX, LuaLaTeX, Xe/Lua PDF
  import, BibTeX, and MakeIndex);
- all seven Node/browser cross-host parity cases; and
- the real Node pdfLaTeX smoke, including PDF production and runtime completion
  observations.

The browser corpus retained the committed structural signatures, so the final
snapshot changed neither page counts nor stable diagnostic/geometry output.

The complete corresponding source and its independent archive check are
recorded in
[`corresponding-source-2025-e7cfc9d.md`](corresponding-source-2025-e7cfc9d.md).
