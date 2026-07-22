# XeTeX extended PDF differential evidence (`2d87107`)

This record compares the internal, pre-WTPDF `pplib` baseline with the
Xpdf/WTPDF candidate on XeTeX's extended PDF-inclusion corpus: xref streams,
object streams, an encrypted input, a damaged-but-repairable input, deep
nesting, and a real engine-produced document. It supplements the geometry
(`aa23fbb`) and visual (`77fef0c`) differentials. It does not clear an engine
release.

## Fixed inputs

| Input | Baseline | Candidate |
| --- | --- | --- |
| Baseline image | `wasmtex-xetex-pplib-baseline-c879d8b` (pplib) | — |
| Candidate | — | `wasmtex-xetex-wasm` built from WasmTex `923b196e82d0a8e55d38264ebda9deae91531775` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` | same |
| Invocation | native XeTeX, `-ini -etex -no-pdf`, `SOURCE_DATE_EPOCH=946684800` | same |
| XDV→PDF | `xdvipdfmx` from `texlive/texlive@sha256:a78cd779…ef25ea282` | same binary, same image |
| Rasterizer | `pdftoppm -png -r 144` (poppler) | same |
| Build environment | x86_64 Linux, Docker 24.0.2 | same |
| Date | 2026-07-22 UTC | same |

The probe was `scripts/test-xetex-pdf-extended.mjs` with SHA-256
`2fb49b2bacef26c8921eefe2aa0d1061f85b223b63a508e9dfd5bdee1d340d4b`, driven by
the comparison procedure of `scripts/test-xetex-pdf-extended-differential.sh`
(SHA-256 `c96385bf0581bbfe7fa2e164e0b2136ac3a2e5dc2bba09a21627560cf79ea62e`).
Synthetic fixtures came from `scripts/generate-pdf-compat-fixtures.mjs`
(`430d3a06761fb1e90f2017e47313d64f1fb975720bb752c601b09cd030bf5465`); their
SHA-256 values are listed in
[`luahbtex-pdfe-differential-923b196.md`](luahbtex-pdfe-differential-923b196.md).
The candidate `wasmtex-xetex.wasm` includes the WTPDF adapter fix from commit
`8e5d27b`; its build passed the geometry and visual fixture gates during the
same from-source run.

## Compared behavior

Through the public `\XeTeXpdfpagecount` and `\XeTeXpdffile` primitives:

- page counts for the classic-xref, xref-stream/object-stream, deep-nesting,
  encrypted, and damaged fixtures;
- media-box inclusion geometry and shipped XDV output for the classic and
  xref-stream fixtures;
- the XDV converted to PDF by the same pinned `xdvipdfmx` and rasterized at
  144 dpi.

A real document was added on top of the script's corpus: `real.pdf` (64,829
bytes, SHA-256
`fbc5d336afc0b328435c36d13e5fd36ed449dbfd05a94373967a98882a8e3cd5`), a
two-page PDF 1.7 with compressed object streams produced by stock pdfLaTeX
(TeX Live 2026 Docker image) from an amsmath test document. Both parsers were
probed for its page count, page-1 media box, page-2 crop box, and the shipped
XDV.

## Results

| Artifact | Outcome | Baseline SHA-256 |
| --- | --- | --- |
| `clean.json` (counts + boxes) | byte-identical | `8beb7261e9bfdda7b842346565c28e8f869d08f9d33a3c7f1bb958c8b63c7ecb` |
| `extended-probe.xdv` | byte-identical | `80cb5261fbc4818813ffaaff3098e2d249d564589adc5ae74064f5485a65b6a0` |
| `extended-probe.pdf` (xdvipdfmx) | byte-identical | `dae49ad97fe02976404676f496442a638a4174d6755527a77b815d6ac79e3c88` |
| rasterized pages 1–2 (144 dpi PNG) | byte-identical | — |
| real-document probe lines | identical (2 pages, `597.5083pt × 845.04706pt` both pages) | — |
| real-document XDV | byte-identical | `bfa0940ba40a1b087f554e2ab03c869ad4c26d850cd910a3615f0b5ee5245aa0` |

Diagnostics: the encrypted fixture reports zero readable pages in both
parsers (no password was supplied). The damaged fixture (blanked `startxref`)
reports zero pages in the baseline and one page in the candidate — the same
approved Xpdf xref-reconstruction improvement recorded for LuaHBTeX in
[`luahbtex-pdfe-differential-923b196.md`](luahbtex-pdfe-differential-923b196.md);
no previously-supported input regressed.

## Remaining scope

This evidence does not cover password-supplied encrypted inclusion through
XeTeX (the primitive surface accepts no password), raster comparison of
arbitrary third-party documents, browser/Node parity, or performance budgets.
It compares native binaries; the release gates bind the same sources to the
WebAssembly artifacts through the from-source Docker build.
