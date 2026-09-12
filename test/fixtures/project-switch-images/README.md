# Project switches before embedded PDF images

Compile these numbered LaTeX documents in order using one compiler, with
`loadProject` between documents. They cover math, bibliography, geometry,
tables, cross-references, generated input files, fonts, and an embedded PDF.
They require only the selected immutable TeX Live mirror, not an application
checkout, registry, or project schema.

The 2026 pdfTeX LTO experiment passed a small repeated-image probe but crashed
when the final figure followed this varied sequence. Both halves of the prefix
tested separately passed. Keep the sequence when changing engine build flags
or state restoration; testing only the final document misses the regression.

Run `src/engine/project-switch-images.smoke.test.ts` with `NODE_COMPILE_SMOKE=1`,
`WASMTEX_SMOKE_PUBLIC_DIR`, and the usual annual smoke mirror settings. Set
`WASMTEX_HEAP_BASELINE_DIR` to compare every normalized PDF to the released
engine. Only PDF dates and document IDs are normalized.
