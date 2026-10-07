# Compact pdfTeX capacity screening, 2026-10-07

Current owner: [compile performance](../compile-performance.md).

This record covers authored-controller screening through source `21cc1d4`,
against controller source `cd1a9a9`. Immutable artifact release and integrator
adoption are separate qualification steps; these measurements alone do not claim
that production has changed.

## Decision and compatibility boundary

The plain pdfTeX controller starts with `extra_mem_top = extra_mem_bot = 0`.
It retains `main_memory = 12000000`, the original maximum WASM capacity, and all
other TeX limits. Main-memory exhaustion rolls back the working directory and
retries once with the original ten-million-word allowances. Promotion is sticky.
The whole attempt's time is retained. Heap-checkpoint engines, INITEX format
builds and page-break checkpoint operations retain the original allowances.

Working-directory snapshots protect arbitrary project inputs, prior auxiliary
files and user outputs, including nested paths. `FS.readFile` already returns an
independent buffer, so snapshots omit its redundant second copy. Every compact
attempt copies the working directory: large resource projects can incur a
transient allocation and latency cost. No general large-project speedup is
claimed. Downloaded package caches remain warm; forced-promotion lookup fixtures
check available/missing packages and first-run versus existing user output.

The bundled controller grows from 81,607 to 82,668 bytes. The two annual worker
asset ceilings change from 82,000 to 83,000 bytes to accommodate rollback and
capacity-preserving retry. WASM, formats and other asset ceilings stay unchanged.

## Native Safari integration screening

macOS 26.6.2, Safari 26.6.2, original immutable mirrors and formats:

| Year | Baseline engine profile | Mirror revision | Original pdfTeX format SHA-256 |
| --- | --- | --- | --- |
| 2025 | `tl2025-final-f3303ee` | `2025-0d3fc73b65e39905` | `2c84dce536ab2c15d1430225ed6f18a10ef3d191e9c1e528557772ac1a8bf8dc` |
| 2026 | `tl2026-20260826-76825fe` | `2026-ba38749b8714505a` | `fd1f4c0411b9bceb8562acd847b62da030b3b803b72799bff6c73dc095935bb5` |

The authored `pdftex-worker.js` SHA-256, excluding the shared-file prefix and
diagnostic suffix, was
`78d7c970627b637991cd05cc7cc934a5ed67e2a90d102da6b3f8e1f75f8d3617`.
Concatenating the unchanged 1,833-byte `shared-file.js` prefix gives the
82,668-byte bundled controller, before diagnostic instrumentation, SHA-256
`de032ed61ae290fd516141ac87e71159dfe631e5484ef0b600d4ae7837609ca2`.
Generated JavaScript, WASM, packages and base format bytes were reused unchanged.
Both annual native corpora passed PDF, decoded SyncTeX and auxiliary comparisons,
with original format acceptance and no rebuild. The forced-capacity fixture
actually promoted from zero to ten million extra words on both annual lines and
preserved package/file lookup output. Standalone fixtures live in
[compact-capacity](../../test/fixtures/compact-capacity/README.md).

Four alternating baseline/candidate pairs on the ten-line 2026 document gave:

| Metric | Baseline median | Candidate median |
| --- | ---: | ---: |
| Initialized WebContent physical footprint | 142.86 MiB | 142.66 MiB |
| First compile physical footprint | 444.10 MiB | 433.65 MiB |
| First compile time | 320.0 ms | 320.5 ms |
| Repeat compile physical footprint | 483.45 MiB | 383.20 MiB |
| Repeat compile time | 485.5 ms | 305.5 ms |
| WASM extent after first/repeat compile | 340.44 MiB | 207.69 MiB |

First physical-footprint differences varied, including one pair with a small
increase. Repeat savings were consistent in these four pairs. Earlier screening
of source `7e214cd` measured a 13.5 ms first-compile median increase; the final
controller's measurements above supersede that timing claim, not its raw data.
These small samples are not production percentiles or universal latency promises.

The integration probe used CorTeX checkout `a945eb0718a5b2174acf47e380b2f9bfb36864ad`
and installed headless SDK SHA-256
`4210885663ca40a57018effd1d179d710910288ed41666fa1a8537c93538e765`.
It served the candidate controller diagnostically beside the unchanged published
core and fixed `Date.now` only to compare output metadata. PDF comparison removes
only creation/modification dates and document IDs. Proxy package caching made
these warm-package probes. Physical footprint came from `proc_pid_rusage`;
all Safari WebContent processes were retained in the raw reports and the active
PID was estimated by greatest growth. WASM extent, RSS and physical footprint
are separate measurements.

The Mac was locked during screening: native worker compilation remained
measurable, but Safari's hidden page did not paint Monaco. Accordingly these are
headless compiler measurements, not active-editor or total-workspace RAM claims.
Whole-workspace qualification must use visible pages and record that limitation.
The SDK's standalone verification does not depend on the integrating checkout.

## Rejected first-restore shortcut

A diagnostic candidate omitted only the first untouched pdfTeX heap restore.
Against the compact controller, four alternating pairs showed first physical
medians of 423.59 versus 428.14 MiB, while first compile medians were 341.5 versus
330.5 ms. There was no demonstrated retained baseline-memory reduction. The
shortcut is not adopted. Later restores still clear grown memory, and Unicode
initialization can modify the heap through ICU registration; neither contract
was weakened to make this experiment pass.
