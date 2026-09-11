# dvipdfmx font-map index experiment

Tracked in [#131](https://github.com/corca-ai/wasmtex/issues/131), following the
[all-engine measurements](../../docs/compile-performance.md#all-engine-font-investigation).
The [optimization policy](../../docs/engine-optimization-policy.md) governs promotion.

The build-applied patch selects the auxiliary index only for `fontmap.c`'s table.
The original 503 lists and their entry/value ownership remain intact. Indexed
lookup and cached list tails avoid scanning long collision chains during insertion.
Removal still uses upstream destruction; iteration and clear use upstream routines.
The index is per-table heap state, never a cache across compiles or worker resets.
Optional index allocation failure disables it and uses upstream operations.

`fontmap-index.h` and the C differential harness are GPL-2.0-or-later engine code,
with allocation/replacement behavior adapted from the pinned upstream `dpxutil.c`.
They are excluded from the MIT SDK package. The complete engine source unit must
include this directory, its patch, and the build scripts.

Run against each pinned annual source, not a reconstructed hash-table model:

```sh
python3 scripts/test-fontmap-index.py --source /path/to/texlive/texk/dvipdfm-x --sanitize
python3 scripts/test-fontmap-index.py --source /path/to/texlive/texk/dvipdfm-x --map /path/to/pdftex.map
```

The harness checks replacement/deletion, binary and empty keys, collision chains,
iteration, destructor order, clear/reuse, and initial/growth allocation failures.
The source runner prints the upstream hash and bounds execution time. The optional
map benchmark measures table insertion only; browser conversion and complete
compilation must be measured separately before adopting the change.

The XeTeX workflow's `dvipdfmx_only: true` input builds diagnostic assets using
`Dockerfile.dvipdfmx`, without rebuilding the unrelated native XeTeX code generator.
It runs the differential test on Linux with ASan/UBSan. These artifacts have explicit
source revisions and hashes but are not a release unit. Normal release builds still
use the full XeTeX family workflow and receipt/source qualification; original formats
and all unaffected engine artifacts must be reused during qualification/assembly.
