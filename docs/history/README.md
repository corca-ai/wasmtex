# Historical engineering records

These records preserve experiments and past qualification results. Their pins,
timings, failures and intermediate decisions apply to the recorded revision;
they do not describe the current API or release status. Current guides live one
level up, starting with the [documentation index](../README.md).

| Record | Scope | Current guide |
| --- | --- | --- |
| [September 2026 compile experiments](compile-performance-2026-09.md) | Memory/warmup, font investigation, dvipdfmx index, build flags, fmt cache and transfer decisions. Later sections supersede earlier holds. | [Compile performance](../compile-performance.md) |
| [pdfTeX AVL experiment](pdftex-fontmap-2026-09.md) | Rejected single-probe optimization and its limited qualification. | [Compile performance](../compile-performance.md) |
| [HTTP compression experiment](http-compression-2026-09.md) | Point-in-time response sizes and rejected extra wrappers. | [Compression diagnostics](../http-compression.md) |
| [Early warmup measurements](warmup-legacy.md) | Legacy timings without a complete pinned reproduction record. | [Warmup](../warmup.md) |
| [Nested output fix](nested-output-2026-09.md) | Failure investigation and original release qualification. | [Nested output](../nested-output.md) |

Name new records by topic and date. Retain the original qualification limits;
append a clearly dated correction rather than silently rewriting results.
Every record links to its current guide, and that guide summarizes the decision
without duplicating the log. Raw reports remain in fixture/release evidence
bundles. Commit-bound legal/source audits stay in the separate
audited [license evidence collection](../license-evidence/README.md).
