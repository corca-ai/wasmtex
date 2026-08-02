# TeX Live 2025 engine release evidence (`57ad3e9`)

This record covers engine release `2025-baa63e6bbe940dc1`, built from WasmTex
commit `57ad3e9cced8a7c0bb281251d9356be1faa3f4f9` and TeX Live source commit
`143f1723353b20202645f241db429b080a8adcdf`. The release adds the
output-neutral runtime completion trace while preserving the established
engine, format, PDF-import, and bibliography behavior.

Every WebAssembly compilation and format-generation command ran on the
`neverland` x86_64 Linux host. No WebAssembly engine was compiled on the macOS
development host. All five Docker build paths used the Emscripten 3.1.46 image
pinned by digest in `scripts/corresponding-source-2025.json`.

## Build receipts

| Build family | Build ID | Release files | Total bytes |
| --- | --- | ---: | ---: |
| pdftex | `1eba695ee1fb995fa876705a14958a6286c7b88ac91af120dd85d1bdd28382c6` | 5 | 5,161,423 |
| bibtex | `f23f7719c9cd49970eff2ea9acb52ef8973503952a2cfcdcdcd6c545195afb29` | 3 | 291,069 |
| bibtex8 | `602e77309aeb1c5c7468c498d4019478ff8ea40870465ce95ba53dd6c249bc7c` | 3 | 308,143 |
| makeindex | `4d5950d9c952bb0dcf5b1e8a03724bbe7a46a2478fbaac1853979ea9cd58d8da` | 3 | 211,944 |
| xetex | `0230a61623b3cab47432439df0ed20efa6579c57a4bd723c006f153ebaf52c03` | 7 | 8,069,405 |
| luahbtex | `4d09b8d5eede915bfaab611471aac22518d4ef922d933ed1f413d57bcf090967` | 4 | 9,099,886 |

The six receipts bind all 32 release-directory files to one WasmTex source
revision, the pinned TeX Live and Emscripten commits, the digest-pinned build
image, and per-file size and SHA-256. `scripts/gen-asset-manifest.mjs` accepted
the complete set and derived release ID `2025-baa63e6bbe940dc1`.

## Link and component evidence

[`link-inventory-57ad3e9.json`](link-inventory-57ad3e9.json) records seven
linker maps and 81 static archive occurrences across pdfTeX, BibTeX, BibTeX8,
makeindex, XeTeX, dvipdfmx, and LuaHBTeX. The archive paths and component
classification are unchanged from the prior release. The only member-count
change is one additional object selected from pdfTeX's already classified
libc archive for the completion trace.

The engine inventory checker classified all 81 occurrences into 20 components
and seven executable families. The current machine-readable result is
[`engine-sbom-2025-57ad3e9.spdx.json`](engine-sbom-2025-57ad3e9.spdx.json).

## Build and runtime gates

The from-source builds re-ran the native and WebAssembly SHA-2/WTPDF smoke
tests, XeTeX geometry and visual-XDV checks, LuaHBTeX repeated PDF-inclusion
and `pdfe`/`pdfscanner` API checks, and the map/byte scans that reject pplib and
legacy SHA symbols.

The freshly staged assets then passed real compile behavior checks:

- pdfLaTeX Node-host compile and golden-output parity;
- a complete BibTeX bibliography cycle and an independent BibTeX8 AUX/BIB to
  BBL run;
- a real MakeIndex IDX to IND run with three accepted entries;
- XeLaTeX and LuaLaTeX cross-host golden output, including PDF geometry and
  import behavior; and
- the seven-case browser golden corpus for pdfLaTeX, BibTeX, MakeIndex,
  XeLaTeX, LuaLaTeX, and the Xe/Lua PDF-import fixtures.

These are provider/protocol/runtime assertions against executed artifacts;
none treats source-text string inspection as behavioral evidence.

## Independent rebuild

The corresponding-source archive was extracted into a new directory on
`neverland`. All six engine families were rebuilt there with
`docker build --no-cache --pull`. The 22 runtime outputs covered by the clean
builders — the seven executable triplets plus the pdfTeX kpathsea helper —
were byte-identical to the receipt-bound release files. The regenerated
formats remained engine-produced release artifacts and were exercised by the
browser corpus above.

Archive construction, verification, and the public source binding are recorded
in [`corresponding-source-2025-baa63e6.md`](corresponding-source-2025-baa63e6.md).
