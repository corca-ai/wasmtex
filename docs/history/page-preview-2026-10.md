# Disposable page-prefix preview qualification — October 2026

The [compiler API](../compiler-api.md) exposes an optional bounded-page preview
for interactive hosts. The [engine runtime](../engine.md) owns its state and
cleanup contract. This record qualifies native source `fc79d52` against the
compact-capacity releases; it does not claim arbitrary TeX edits finish in 50 ms.

## Design decision

After the requested number of pages ships, pdfTeX returns at a main-control
boundary. Normal PDF/font/xref finalization still runs. The bounded exit skips
`finalcleanup()`, which assumes a scanned end-of-job token and otherwise emits
an emergency-stop diagnostic. Generated-code shape checks fail closed on drift.
Ordinary full compilation is unchanged.

The worker snapshots and restores the working directory, including auxiliary
files, after success or failure. A prepared heap checkpoint before the edit may
be reused. Preview results never advance the canonical result or checkpoint
baseline. Changed preambles, non-main inputs, unsupported engines and failed
attempts return no preview, allowing the host to compile normally. Hosts must
reconcile references and publish/export only a subsequent full result.

## Immutable inputs

The two annual lines retain their original formats, upstream source pins,
mirrors and all unaffected engine families. New pdfTeX/BibTeX outputs come from
source `fc79d525014393fc316ed29f884f3ef6a667943e`.

| Year | Baseline release | Candidate release | Native build | Source qualification | Source publication |
| --- | --- | --- | --- | --- | --- |
| 2025 | `2025-4c1c9e827f353ba6` | `2025-c1f6c5e694a6cd42` | `38206083929` | `38207129610` | `38207621424` |
| 2026 | `2026-9147f5703951082b` | `2026-16ccfa65e8c6e919` | `38206288513` | `38207525097` | `38208001098` |

Mirrors remain `2025-0d3fc73b65e39905` and `2026-ba38749b8714505a`.
The pdfTeX format SHA-256 values remain
`2c84dce536ab` and `fd1f4c0411b9` (prefixes, respectively); full hashes and
original generation receipts are retained in the composed release receipts.
Original format artifacts come from runs `33882993861` and `33885489901`.

Public source archives are attached to the matching `engine-<release-id>` tags.
Downloaded qualification archives match the publication digests and public
SHA-256 sidecars:

| Year | Corresponding-source SHA-256 |
| --- | --- |
| 2025 | `193e0cb7bef31167f7bf9cf2f8f39873ea5e98a1b791b1aaf7482bb433e42256` |
| 2026 | `451a2a28a06033844d8eb8f060afcad914da82d5431b1f9a6d6cc9e2490bf241` |

The registered 2026 distribution profile is `2026-20260826-16ccfa6`.
Source assemblies include every revision named by composed receipts and no
integrating-application source. Release-mode license checks and all 118
license-tool tests pass after registration.

## Behavior and performance evidence

`e2e/page-preview.spec.ts` runs four naturally paginated fixtures: prose,
mathematics/footnotes, hyperlinks/references, and two-column floats. Each uses
plain or checkpoint pdfTeX, three repeated body edits, a two-page preview and
full reconciliation. It checks pixel hashes, SyncTeX page/input inventory,
unchanged auxiliary state, prepared checkpoint use, rejected errors and recovery.
Plain fixtures use a nested main file.

All eight cases pass on each year in Chromium. All four plain cases also pass
on each year in WebKit. Annual Golden Canary run `38207506982` passes both
years, including page preview and heap checkpoint cases, existing structural
goldens, Node/browser parity, lifecycle and persistent-cache tests. No golden
was changed. CI run `38207506873` passes annual nested-output checks, coverage,
package consumers and generated-library freshness. Its intermediate build
correctly rejects the old distribution binding; final registration corrects it.

`scripts/check-output-preservation.mjs` compares each candidate with its actual
preceding release, using the unchanged mirror, explicit year and `pdflatex`.
Both article and Times/microtype fixtures match at root and nested paths in
both years. Normalization removes only PDF creation/modification dates and IDs.
These small Node fixtures complement, rather than replace, the browser corpus.

On an Apple M5 Max, 128 GiB, macOS 26.6.2 and Node 24.18.0, warm two-page SDK
generation was roughly 69–94 ms in Chromium. WebKit plain-engine samples were
roughly 79–86 ms. Concurrent qualification load affects these ranges; they are
not input-to-paint percentiles. First-body heap checkpoints retained 28,639,232
bytes in 2025 and 28,704,768 bytes in 2026, bounded by one 64 MiB entry in this
test. Working-directory snapshots add transient copies proportional to project
files. Later visible pages still require compiling the preceding prefix.

The capability increases the pdfTeX worker from 82,668 to 84,993 bytes and gzip-9
from 22,402 to 22,866 bytes. Its two annual worker ceilings explicitly account
for this new capability; native binary and other runtime ceilings are unchanged.
Application input scheduling, reader reuse, process memory and export behavior
are separately qualified by the integrating host.
