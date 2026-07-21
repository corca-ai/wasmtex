# XeTeX PDF geometry differential evidence (`aa23fbb`)

This record compares the internal, pre-WTPDF `pplib` baseline with the Xpdf/WTPDF
candidate. It covers XeTeX's PDF page selection and inclusion geometry only. It
does not approve visual rendering compatibility or clear an engine release.

## Fixed inputs

| Input | Baseline | Candidate |
| --- | --- | --- |
| WasmTex commit | `b8843dc0d14c2f194c8c22492ef1b49f35cd46fb` | `23f2ce1bc42cb8c5dc710258ea87b3cf729243a0` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` | `143f1723353b20202645f241db429b080a8adcdf` |
| PDF parser | `pplib` | WTPDF over Xpdf 4.04 |
| Initialization | native XeTeX, `-ini -etex -no-pdf` | native XeTeX, `-ini -etex -no-pdf` |
| Build environment | x86_64 Linux, Docker 24.0.2 | same |
| Date | 2026-07-21 UTC | same |

The comparison used `scripts/test-xetex-pdf-geometry.mjs` at commit
`aa23fbb2f7adf1ec507bc038c2c7510143391358`. Its SHA-256 in the build environment was
`0c6db5db5fea57b36b2ac49ca0c3d870651a8dbb42a0e096b59e31080630b2f1`.
The script creates its classic-xref PDF inputs itself and does not contain or
redistribute `pplib` code or headers.

The old binary was retained only as a non-distributed internal comparison
baseline. The baseline contained `/build/native/libs/pplib/libpplib.a` with
SHA-256 `293fbd4d1118ea3f733fa3eea7bfea0a36656ae5432c898e8cb5799756a8c563`
and exported `pparray_*` symbols. The candidate reported
`Compiled with PDF backend xpdf version 4.04`.

## Compared behavior

The probe made 16 measurements through XeTeX's public `\XeTeXpdffile`
primitive:

- MediaBox, CropBox, BleedBox, TrimBox, and ArtBox dimensions;
- CropBox fallback for missing BleedBox, TrimBox, and ArtBox;
- rotations 0, 90, 180, and 270;
- first- and last-page clamping for page values `0`, `999`, and `-1` in a
  two-page input.

Both output files were 1,569 bytes and were byte-for-byte identical. Their
SHA-256 was
`63f09d7c2b8bd499d8bca70d464f91f5dbe4fc9b3f47677830bf24e5f0f1a14f`.
That output is checked in as
`wasm-build/pdf-backend/fixtures/xetex-geometry.expected.json`, and the XeTeX
build runs the same probe against the native code-generation build before it
exports WebAssembly artifacts.

## Remaining scope

This evidence does not cover xref streams, object streams, encrypted or
malformed PDFs, raster pixel comparison, text-position comparison, browser/Node
parity, or LuaHBTeX's `pdfe` and `pdfscanner` APIs. It also does not compare
byte-level output PDFs: dvipdfmx remains the embedding implementation, and a
fixed-renderer visual corpus is still required before visual compatibility is
approved.
