# License evidence

Commit-bound audit records backing the claims in
[`docs/licensing.md`](../licensing.md). Each file is a snapshot tied to the
revision in its name; they are records, not living documents — supersede them
with a new snapshot instead of editing history. `npm run check:licenses`
requires the load-bearing set to stay tracked.

## TeX Live 2025 final profile (`e7cfc9d`)

| File | What it evidences |
| --- | --- |
| `engine-release-2025-final-e7cfc9d.md` | The receipt-bound x86_64 build, immutable final mirror, and browser/Node qualification |
| `corresponding-source-2025-e7cfc9d.md` | The deterministic source archive, official checker result, publication, and public hash binding |

## TeX Live 2026 engine line (`9b43b39`)

| File | What it evidences |
| --- | --- |
| `link-inventory-2026-9b43b39.json` | The 82 archive occurrences selected by the seven 2026 linker maps |
| `engine-sbom-2026-9b43b39.spdx.json` | The annual component inventory as a freshness-checked SPDX SBOM |
| `corresponding-source-2026-9b43b39.md` | Native x86_64 source assembly, verification, publication, and public hash binding |
| `engine-performance-2026-9b43b39.json` | Cold Node-host runtime measurements checked against the 2026 artifact/runtime budgets |

## TeX Live 2026 dated profile (`df228a6`)

| File | What it evidences |
| --- | --- |
| `engine-release-2026-dated-df228a6.md` | The mirror-bound x86_64 builds and dated R2 qualification |
| `corresponding-source-2026-dated-df228a6.md` | The checked source archive, publication, and public SHA-256 binding |

## TeX Live 2026 initial mirror-bound profile (`e4bc652`)

| File | What it evidences |
| --- | --- |
| `engine-release-2026-initial-e4bc652.md` | The exact initial mirror identity, native builds, and browser/Node qualification |
| `corresponding-source-2026-initial-e4bc652.md` | The checked initial source archive, publication, and public SHA-256 binding |

## Current release (`57ad3e9`)

| File | What it evidences |
| --- | --- |
| `engine-release-2025-57ad3e9.md` | The release build: single-revision receipts, runtime gates, and clean rebuild |
| `link-inventory-57ad3e9.json` | The 81 static archive occurrences actually selected by the seven linker maps |
| `engine-sbom-2025-57ad3e9.spdx.json` | SPDX SBOM generated from the current component inventory (freshness-checked in CI) |
| `format-inputs-xetex-2b58db3.json`, `format-inputs-luahbtex-2b58db3.json`, `format-inputs-pdftex-23ee539.json` | Prior observed fetch inventories for the unchanged pinned TeX Live inputs and format-generation procedures; format bytes themselves are nondeterministic |
| `corresponding-source-2025-baa63e6.md` | Published source archive, verification, and the clean-builder rebuild |
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

The `2b58db3` and `9f7c7d4` inventories, SBOMs, engine-release record, and
`corresponding-source-2025-3a630ec.md` are retained as the immediately prior
published-release audit trail. The current `57ad3e9` link inventory has the
same archive-path/component classification; pdfTeX selects one additional
member from the already classified libc archive for completion tracing.
