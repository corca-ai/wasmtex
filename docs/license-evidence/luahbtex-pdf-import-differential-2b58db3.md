# LuaHBTeX package-level PDF import differential evidence (`2b58db3`)

This record compares package-level PDF import — `graphicx`, `pdfpages`, and
TikZ in one LuaLaTeX document — between a pplib-era WebAssembly engine and the
`2b58db3` WTPDF release candidate. Both engines ran the identical document
under the Node worker host with the same pinned TeX Live 2025 CDN tree.

## Fixed inputs

| Input | Baseline | Candidate |
| --- | --- | --- |
| WasmTex commit | `f4eed86b55420bbce28b1bdc02ec737e401fa42a` (last pplib LuaHBTeX tree) | `2b58db337f9917925988dc51fbebd9e457f76128` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` | same |
| PDF parser | `pplib` | WTPDF over Xpdf 4.04 |
| `wasmtex-luatex.wasm` | 5,344,681 bytes, SHA-256 `bbf20e66087748a05a487b360a54e3032ff84a59fc35c74f634660668facadac` (non-distributed test build) | the receipt-bound release candidate |
| Host | Node worker host (`installNodeWorkerHost`), darwin arm64, Node 24 | same |
| Date | 2026-07-22 UTC | same |

The document is the shared golden corpus (`e2e/golden-corpus.ts`
`pdfImportFiles`): `\includegraphics` of a project PDF, a TikZ picture, and a
`\includepdf` page import. The imported `figure.pdf` is byte-identical to the
compat fixture `classic.pdf`
(`abe8458a0a4babb63017d3267c4e953ad4256e23c6b8bf4c0c86a47c1f783610`). The
baseline built its LuaLaTeX format in-session with its own binary; the
in-session format build emits the same preload font-metric diagnostics on both
engines and does not affect the output comparison.

## Results

| Comparison | Outcome |
| --- | --- |
| structure (poppler `pdfinfo`) | identical: 2 pages, letter, PDF 1.7, `LuaTeX-1.22.0` |
| structure (mupdf `mutool info`) | both parse cleanly; same media boxes and embedded font model |
| text and layout (`pdftotext -layout`) | byte-identical |
| position (144 dpi `pdftoppm` raster, both pages) | pixel-identical |

Output PDFs: baseline SHA-256
`1dfb6526f5a91aaa64acdadbee3fc8fc698b3168c0f2b8c691de8cf0ef8f24ca`, candidate
`b35cead571481ddb3c36c32da26fd90a5471a120df77e23dbdabceb98ea08933` (raw bytes
differ only by embedded timestamps and the import machinery's object layout;
every extracted text byte and rendered pixel matches).

Two independent PDF structure checkers (poppler and mupdf) accepted both
outputs without diagnostics, in addition to the pdf-lib parsing already
performed by the golden and cross-host parity suites. The same corpus is
locked as browser goldens (`pdf-import-lualatex.json`,
`pdf-import-xelatex.json`) and verified browser-vs-Node by the cross-host
parity smoke.

## Remaining scope

The baseline is a non-distributed internal comparison build; no pplib bytes
ship in any release artifact. This evidence covers LuaLaTeX package-level
import; the XeLaTeX import path is covered by the XDV-level differentials and
the shared goldens.
