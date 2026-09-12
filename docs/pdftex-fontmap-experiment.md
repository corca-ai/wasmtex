# pdfTeX font-map insertion experiment

The single-probe font-map candidate is **not adopted**. It preserves the measured
outputs but falls short of the predeclared 5% whole-compile improvement threshold.
[Issue #138](https://github.com/corca-ai/wasmtex/issues/138) tracks the experiment;
the [optimization policy](engine-optimization-policy.md) governs promotion.

## Candidate and scope

pdfTeX already uses AVL trees. Unlike dvipdfmx's former chained hash table, it
does not justify the same auxiliary-index change. Its append path nevertheless
searches once with `avl_find` and again with `avl_probe` for a new record.
The candidate uses one probe, distinguishing insertion by the tree-count change.
It keeps AVL layout, insertion order, duplicate warnings, PS-name eligibility,
replace/delete paths and ownership rules. No objects survive additional resets.

The SDK baseline is `08c1394b278d35bfa07132a6a49d33b4fd221740`.
Both annual source pins have identical `mapfile.c`, SHA-256
`349e3078008137395ed59a9c4694c2708a0cc5fcceea4263bcd46f6f8b20b051`.
A fresh named profile confirms AVL searches and string comparisons remain hot
in the released 2026 pdfTeX. Its non-custom WASM sections match the release;
traced timings are excluded from the speed comparison.

## Build and compatibility evidence

The paired builds use the pinned 2025 source
`143f1723353b20202645f241db429b080a8adcdf`, Emscripten 3.1.46 and the same O2
build inputs. The baseline ordinary and checkpoint WASM match the published
workflow `33882993861` artifacts byte for byte. The patch is applied with zero
fuzz before rebuilding. Both browser variants retain the original release fmt,
worker and immutable `2025-0d3fc73b65e39905` mirror.

A native differential compiles the actual upstream registration functions,
comparators, structures, macros, destructors and AVL implementation. Four reset
cycles execute 48,000 operations per variant, comparing results, warnings and
ordered tree contents. Plain macOS and Linux GCC ASan/UBSan pass. macOS ASan
stalls before `main` inside sanitizer initialization; the sample is retained,
and that run is not counted as engine coverage or a pdfTeX defect.

All 60 measured browser compile pairs match normalized PDFs, SyncTeX, auxiliary
files, diagnostics, logs, dependency evidence and file requests. The comparator
also checks unchanged format/unaffected-asset hashes and actual format use.
This is focused experimental coverage, not a complete engine-release gate.

## Performance result

Chromium 145.0.7632.6 on macOS arm64 runs five alternating baseline/candidate
pairs for each document. Each run prepares mirror responses before one measured
fresh context. Measured requests cannot go upstream; repeat/body stages have
zero HTTP requests. First/preamble stages still include local cached transfers.
Tracing is disabled and worker clocks are fixed for output comparison.

| Document | First compile | Repeat compile | Body edit | Preamble edit |
| --- | --- | --- | --- | --- |
| Article, Latin Modern | 336.6 → 334.6 ms (0.6%) | 123.2 → 119.9 ms (2.7%) | 119.9 → 115.6 ms (3.6%) | 270.4 → 268.7 ms (0.6%) |
| Palatino fonts and math | 352.4 → 347.5 ms (1.4%) | 123.9 → 118.9 ms (4.0%) | 119.7 → 115.7 ms (3.3%) | 268.8 → 266.7 ms (0.8%) |
| Multi-file report | 462.3 → 453.3 ms (1.9%) | 122.5 → 117.8 ms (3.8%) | 122.2 → 118.6 ms (2.9%) | 274.4 → 266.8 ms (2.8%) |

Values are stage medians, not production edit-to-PDF percentiles. No compilation
stage reaches 5%. Initialization variation is unrelated to font-map insertion
and does not qualify the candidate. Ordinary WASM grows by 212 bytes; checkpoint
WASM grows by 390 bytes. The patch adds no persistent cache or tree allocations;
this is a code observation, not a measured peak-memory claim.

## Decision and reproduction

The candidate fails the performance gate despite preserving the measured output.
Do not promote it, change engine-release components, or register a CorTeX
successor. The experimental patch is retained only in the
[evidence archive](../test/fixtures/pdftex-fontmap/README.md), outside active
build inputs. No SDK runtime, engine, format, mirror or application release changes.

A 2026 candidate, actual checkpoint-resume comparison, complete release corpus,
Node engine qualification and corresponding-source publication are not pursued
after this rejection. Successful 2025 checks must not be described as those
unperformed gates. Revisit only if a distinct map-reading/parsing change can
produce a larger whole-compile benefit; another search-only microbenchmark does
not justify reopening this candidate.
