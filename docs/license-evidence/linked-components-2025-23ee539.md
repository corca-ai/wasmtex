# TeX Live 2025 linked-component and notice evidence

This record applies to the release-candidate artifacts built from WasmTex commit
`23ee539b04f41b53e5bed715fbb077e14e46ec24` and TeX Live source commit
`143f1723353b20202645f241db429b080a8adcdf`.

It is a technical compliance record, not legal advice. The selected terms and final
public distribution should still receive specialist legal review.

## Exact link coverage

`scripts/engine-components-2025.json` (SHA-256
`42ced0ea781c92809b318fd7e560df27a6ae6f9097198bb1a3543c102b65d800`)
maps all 81 static-archive occurrences in the seven release link maps to 20 component
entries. `node scripts/check-engine-license-inventory.mjs 2025` passed. Its fail-closed
tests also proved that an unknown archive and an LGPL archive without a relink method
are rejected.

The same inventory is emitted as the deterministic SPDX 2.3 document
`engine-sbom-2025-23ee539.spdx.json` (SHA-256
`5fd9668ea0502272a39c539e70c792d7dfc8c0d0dba10a26af8dd8d320b86e89`). The source
license gate regenerates it in memory and rejects a stale committed SBOM.

The release selections are:

| Unit or component | Selected treatment |
| --- | --- |
| pdfTeX | GPL-2.0-only for this combined unit, because Xpdf 4.04 is selected under GPLv2 only. |
| XeTeX | GPL-2.0-only plus the XeTeX notice. Xpdf 4.04 and FreeType both use their GPLv2 options. |
| LuaHBTeX | GPL-2.0-only for this combined unit, because Xpdf 4.04 is selected under GPLv2 only. |
| dvipdfmx and BibTeX8 | GPL-2.0-or-later, with linked-component notices. |
| BibTeX | The BibTeX/TeX and Web2C notices, plus LGPL-2.1-or-later kpathsea. |
| MakeIndex | The identical MakeIndex permission notice for the modified port, plus LGPL-2.1-or-later kpathsea. |
| kpathsea, Graphite2, TECkit, zziplib | Their selected LGPL alternatives; the complete-source bundle supplies replacement-library source and a relink procedure. |
| Emscripten runtime | MIT/NCSA, musl notices, dlmalloc's public-domain/CC0 grant, and Apache-2.0 WITH LLVM-exception for the linked LLVM runtime archives. |

The FreeType License alternative is deliberately not selected for the GPLv2 XeTeX
combined work. Its text remains in `LICENSES/FreeType.txt` only as upstream provenance.

## Notice and source checks

- Added exact BibTeX, Lua 5.3, LLVM-exception, musl, and LuaHBTeX embedded-library
  notices to `LICENSES/`.
- Kept the original Xpdf README and both upstream GPL texts, while recording GPLv2 as
  the release selection.
- Added a conspicuous MakeIndex modified-port notice and a source-obtainment statement
  that points recipients to the adjacent manifest's corresponding-source URL.
- Every generated Emscripten JavaScript module begins with the retained `@license`,
  Emscripten copyright, and MIT SPDX header. The release notice checker passed for all
  seven executable modules.
- `THIRD_PARTY_NOTICES.md`, `LICENSES/README.md`, `docs/licensing.md`, and the engine
  license manifest now describe the same license boundary and selections.

The corresponding-source builder now emits `RELINK.md` and
`release/ENGINE-COMPONENTS.json`. The source bundle contains the exact TeX Live,
Emscripten, port, WasmTex glue, patch, and build inputs rather than relying on an
upstream download link. Actual archive generation and clean rebuild are recorded in
the corresponding-source evidence separately.

## Format inputs

The release receipts bind the distributed format bytes:

| Format | Release SHA-256 |
| --- | --- |
| `wasmtex-pdftex.fmt` | `c38b2b19721fcff83ea7e14e6401d44e1bb7ebc47f83b192cf3191a38d24800e` |
| `wasmtex-xetex.fmt.gz` | `98007e66455cabec8b34877b8da8704902923f16da5a18317c8ece9822805c30` |
| `wasmtex-luatex.fmt.gz` | `7972ee9381a8ee72a4c1aaee63b606a92859498d582981b77846da43bd6d9ef0` |

The exact observed TeX Live/ICU request lists and procedures are stored in:

- `format-inputs-pdftex-23ee539.json`: 246 fetched inputs, SHA-256
  `45596d5019ad9cbcaa7f70d3a3cffe2d6ee39ed3d4d74b3f9ce28ab39053f231`;
- `format-inputs-xetex-23ee539.json`: 249 fetched inputs, SHA-256
  `82637aed2311551a00c4f9ee5504fd9137a90c4ebdd3b3d5c7483aa40584364b`;
- `format-inputs-luahbtex-23ee539.json`: 98 fetched inputs, SHA-256
  `7c2cc8d931cfc8d49c96df22c8b7ea098d4449d0edfdd0e404df8b964948dc90`.

Those JSON files are marked `observationOnly`: rerunning format generation with the
same fetched inputs exposed creation-time/serialization nondeterminism, especially in
LuaHBTeX. They therefore record exact input names without pretending that their
observed output hash is the receipt-bound release hash. The final corresponding-source
rebuild must record this known difference rather than falsely claim bit-for-bit format
reproducibility.

## SDK and standalone demo peers

`npm run build:lib` externalized Monaco Editor, PDF.js, and pdf-lib, so npm's MIT SDK
package does not copy their implementation bytes. `npm run build` produced a standalone
demo containing Monaco, PDF.js, and the optional pdf-lib path. The build also copied
`THIRD_PARTY_NOTICES.md` and the Monaco, Apache-2.0/PDF.js, and pdf-lib notices into
`dist/LICENSES/`. `node scripts/check-release-notices.mjs --assets
public/wasmtex/2025 --demo dist` passed.
