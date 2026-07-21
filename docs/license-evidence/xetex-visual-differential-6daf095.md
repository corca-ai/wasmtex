# XeTeX PDF visual differential evidence (`6daf095`)

This record compares the internal, pre-WTPDF `pplib` baseline with the Xpdf/WTPDF
candidate through XeTeX, XDV, a fixed xdvipdfmx container, and a fixed raster
renderer. It approves the self-generated XeTeX visual subset only; it is not an
overall engine release clearance.

## Fixed inputs

| Input | Value |
| --- | --- |
| Baseline WasmTex commit | `c879d8b06e3fea496539955dca8b6c3169cdefe8` |
| Candidate WasmTex commit | `2c53a8683f1c01c9c13dade3fa8f07de5b81d5f1` |
| TeX Live source commit in both engines | `143f1723353b20202645f241db429b080a8adcdf` |
| Differential scripts commit | `6daf095f7f266d5de9dbc417b45ccf34e1ec1e3e` |
| Fixture script SHA-256 | `cc6552621f754ea1239681d8c1caf7d4b6bd8fc850e45c1d843375b62b428e84` |
| Driver script SHA-256 | `598bb5204d86aaccf14b3da28c2cdabeeb1279ddd0aa4964ba85bc51b75a274b` |
| xdvipdfmx image | `texlive/texlive@sha256:a78cd7792625e4245dc73cd5db390f0b9e6c2c7c14ac8b6ca59f023ef25ea282` |
| xdvipdfmx version | `20260317` |
| Raster renderer | Poppler `pdftoppm` 22.02.0, PNG, 144 DPI |
| Reproducible time | `SOURCE_DATE_EPOCH=946684800`, `FORCE_SOURCE_DATE=1` |
| Build/test environment | x86_64 Linux, Docker 24.0.2 |
| Date | 2026-07-21 UTC |

The baseline image was used only as a non-distributed internal comparator. The
scripts accept image names at runtime and do not contain or redistribute the
baseline, `pplib` source, binary, header, or API expressions.

## Corpus and results

The MIT-licensed fixture generator creates three classic-xref PDFs containing
only vector drawing commands. They exercise all five page boxes, 0/90/180/270
rotation, asymmetric page content, and valid page 1/page 2 selection. The
generated inputs were identical for both engines:

| Input | Bytes | SHA-256 |
| --- | ---: | --- |
| `all-boxes.pdf` | 779 | `43912aed31f6a4eab3f81d42247418a5b481104113250c491a84710bb44ffdf9` |
| `rotations.pdf` | 1485 | `fa17757fb1de0dbc1a4a753764f44e59e74aa44e79233289e67d7795af1a252f` |
| `multipage.pdf` | 760 | `5a7c843c32e89ace2276d35bbc977c403f94de3776f8d320e5131140eb658c4a` |
| `visual-probe.tex` | 845 | `a8e9ecdabaa3f1fa1bff07f4153e3cb9ea29a096a9feccb6604b627b02ea33e0` |

The baseline and candidate produced byte-for-byte identical artifacts:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `visual-probe.xdv` | 1848 | `625e741e165cb461147ee5b311c4c1eaed568b0e463e7f2a80237ebe6874429a` |
| `visual-probe.pdf` | 5214 | `6914d1ae4b14efeb60a7fe812bae9fb723c1f0083c17a0f8e559988d774729f5` |

All 11 rendered PNG pages were byte-for-byte identical. The SHA-256 of the
ordered per-page `sha256sum` manifest was
`95e9131a9b045bd4e188ce51625ed3baab1bdbd06cea48832d3e36fa18509a45`.
Two consecutive full runs produced the same XDV, PDF, and raster-manifest hashes.

The public build does not need or contain the old parser. It regenerates the
candidate fixture and checks the deterministic XDV against
`wasm-build/pdf-backend/fixtures/xetex-visual.expected.sha256`. The full raster
differential remains an internal release/upgrade gate because its baseline image
cannot be redistributed without resolved `pplib` rights.

## Observed existing edge case

An initial visual probe also used out-of-range page values. Both XeTeX builds
produced identical XDV, but xdvipdfmx rejected `page=999` during actual image
inclusion. The geometry-only test retains these values to compare XeTeX's
dimension lookup behavior; the visual corpus uses valid page numbers. This is an
existing pipeline behavior, not a WTPDF regression.

## Remaining scope

This corpus does not cover xref streams, object streams, encrypted or malformed
PDFs, transparency, annotations, form XObjects, nested resources, text-position
comparison, or browser/Node parity. Those remain open compatibility and security
gates, as does all LuaHBTeX coverage.
