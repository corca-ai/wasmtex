# License evidence

Commit-bound audit records backing the claims in
[`docs/licensing.md`](../licensing.md). Each file is a snapshot tied to the
revision in its name; they are records, not living documents — supersede them
with a new snapshot instead of editing history. `npm run check:licenses`
requires the load-bearing set to stay tracked.

## Current release candidate (`9f7c7d4`)

| File | What it evidences |
| --- | --- |
| `engine-release-2025-2b58db3.md` | The candidate build: single-revision receipts, reproducibility, gates |
| `link-inventory-9f7c7d4.json` | The 81 static archives actually selected by the seven linker maps |
| `link-inventory-2b58db3.json` | The prior binding of the same maps (engine bytes unchanged) |
| `engine-sbom-2025-9f7c7d4.spdx.json` | SPDX SBOM generated from the component inventory (freshness-checked in CI) |
| `format-inputs-xetex-2b58db3.json`, `format-inputs-luahbtex-2b58db3.json` | Observed inputs of the format dumps |
| `format-inputs-pdftex-23ee539.json` | Observed inputs of the pdfTeX format (bytes unchanged since that build) |
| `corresponding-source-2025-3a630ec.md` | Source archive creation, verification, and the clean-builder rebuild |
| `engine-performance-2b58db3.json` | Runtime performance measurements behind the budget gate |
| `repository-audit-3ec3290.md` | Pre-publication secret/blob/header audit of the repository history |

## WTPDF compatibility differentials (vs non-distributed `pplib` baselines)

| File | Coverage |
| --- | --- |
| `xetex-geometry-differential-aa23fbb.md` | Page selection, page boxes, rotation, XDV geometry |
| `xetex-visual-differential-77fef0c.md` | 11-page self-generated vector corpus, fixed-renderer rasters |
| `xetex-pdf-extended-differential-2d87107.md` | Xref/object streams, encrypted, damaged, deep, and a real document |
| `luahbtex-pdfe-differential-923b196.md` | `pdfe`/`pdfscanner` API surface, authentication, memory release |
| `luahbtex-pdf-import-differential-2b58db3.md` | Package-level `graphicx`/`pdfpages`/TikZ import |

## Port and audit records

| File | What it evidences |
| --- | --- |
| `xetex-wtpdf-23f2ce1.md` | The XeTeX WTPDF/Xpdf port build and its `pplib`-absence scans |
| `luahbtex-wtpdf-666663b.md` | The LuaHBTeX WTPDF/Xpdf + independent SHA-2 port build and scans |
| `texlive-2025-metadata-audit-124bfca.md` | TeX Live mirror metadata audit |

## Prior candidate snapshot (`23ee539`)

`engine-release-2025-23ee539.md`, `link-inventory-23ee539.json`,
`engine-sbom-2025-23ee539.spdx.json`, `linked-components-2025-23ee539.md`, and
the `format-inputs-*-23ee539.json` files record the superseded first candidate.
They are retained as the audit trail for how the current candidate differs
(two WTPDF fixes changed the XeTeX/LuaHBTeX bytes; everything else reproduced
bit-identically). `linked-components-2025-23ee539.md` remains the human-readable
archive-to-component mapping; the component set is unchanged in the current
inventory and is machine-checked by `scripts/check-engine-license-inventory.mjs`.
