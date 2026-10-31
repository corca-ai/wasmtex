# Foreground preview fallback, 31 October 2026

Current behavior belongs to [compile performance](../compile-performance.md),
[the engine](../engine.md#disposable-page-prefix-previews) and the
[compiler API](../compiler-api.md#deferred-pdf-preview-parts). This record is
qualification evidence for the bounded two-state fork, not a latency promise.

## Failure and decision

A fork previously copied only its nearest checkpoint. An ordinary prose edit
before that state's consumed prefix correctly invalidated it, but also left the
fork without an earlier state while its canonical parent was occupied. The host
then waited for the complete book. A missing fresh caret was a separate host
admission issue; keeping an existing session cannot make an invalid checkpoint safe.

Keep the nearby state and an independently proven state before the hinted file
in the same worker. Copy the parent's actual package/font caches once during
setup; switching checkpoints never reimports or rolls back those caches. Source
prefixes, dependency proof, cancellation and canonical authority remain checked.
If the extra state exceeds the existing 192 MiB copied-state ceiling, omit it
and retain the primary state. Fork admission still refuses heaps above 512 MiB.
This adds no second preview worker and makes no browser RSS claim.

Always starting at the beginning of the chapter was rejected: the integration
experiment improved an earlier edit but slowed nearby edits from about 1.2 s to
6.6 s. Preserving both independently valid states avoids that deliberate loss
of the nearby fast path.

## Integration observations and limits

The integration prototype used DaoFP revision
`7a03427c75c830518aa6ffdbcf1b9d131f8f4cfc`, 76 source files, a complete 363-page
PDF, Chrome 156 and a 1280 by 900 viewport on macOS. The application baseline
was `659c7ab23`; its native engine was `2026-4c355db2ef1c4f65`. A normal settled
edit prepared a checkpoint near the end of `15-Monads.tex` (physical page 218).
Editing the first paragraph on page 195 during the next canonical compile
reproduced the delay without injecting a missing hint.

| Last accepted input to edited-page paint | Single-state baseline | Two-state prototype |
| --- | ---: | ---: |
| Nearby paragraph | 1,463 ms | 1,473 ms |
| Earlier paragraph during canonical work | 17,298 ms | 1,564 ms |
| Shift/ArrowLeft selection and Backspace | Not compared in this run | 860 ms |

These are individual controlled observations, not percentiles. The prototype
was installed after the baseline had already invalidated its sibling; its first
warmup fell back to a 33.6 s full result. That sample is retained as a limit and
is not evidence of improved cold setup. Independent application adoption must
use a fresh compiler and the released SDK/assets, and measure setup separately.

A subsequent local application test used the actual SDK bundle from `83c08c2`,
the new authored controller and unchanged native binaries. It settled an edit
in the later paragraph, held canonical replies, edited the earlier paragraph,
typed a second word, selected both words with native Shift/ArrowLeft, deleted
with Backspace, retyped and switched chapters. Visible pixel reversion and the
final downloaded PDF passed. This two-chapter host test is separate from the
full-book prototype and from deployment/profile-transition qualification.

## Standalone qualification

The SDK candidate source is `83c08c2d585bfd26eb740b5cbe4de16facd3ba04`, based on
`5542486`. Unit tests passed (2,010 tests; 36 environment-gated cases skipped),
normal pre-commit/pre-push gates passed, and the committed bundle was rebuilt.
Protocol tests execute the authored controller and verify shared-buffer counting,
oversized fallback omission, primary rejection and lookup-map transfer. Headless
tests require proof only for states actually admitted by the worker.

Chrome tests ran `e2e/page-preview-fork.spec.ts` on both annual native engines:
include/subfile books, chapter-boundary/local forks, nearby edits, earlier edits,
new font use, exact reversion, canonical PDFs, auxiliary files and decompressed
SyncTeX comparisons. All eight cases passed. The tested controller bytes equal
the receipt-bound built controller exactly. Both annual builds preserve every
preceding native module/WASM byte; the controller alone changes.

`check-output-preservation.mjs` compared the assembled candidate to each annual
baseline on `article.tex` and `fonts-and-microtype.tex`, at root and nested paths.
All four comparisons per year matched using only the existing date/ID removal.
This small corpus is scoped evidence; it is not the integrating application's
complete template or feature matrix.

## Artifact and source identities

| Annual line | Baseline | Candidate | pdfTeX/BibTeX build | Source publication |
| --- | --- | --- | --- | --- |
| 2025 | `2025-050beaf228ed29fe` | `2025-da0c245993679764` | [41147367656](https://github.com/corca-ai/wasmtex/actions/runs/41147367656) | [41148088352](https://github.com/corca-ai/wasmtex/actions/runs/41148088352) |
| 2026 | `2026-4c355db2ef1c4f65` | `2026-b6584b4019bcab75` | [41147364318](https://github.com/corca-ai/wasmtex/actions/runs/41147364318) | [41149121048](https://github.com/corca-ai/wasmtex/actions/runs/41149121048) |

Both lines keep their exact immutable mirrors and original format-generation
receipts (`0dddc924cc6e69bd2a4b4630e02efe414f84515e`). Unaffected families reuse
their exact artifacts and receipts. Corresponding source excludes host application
code and is verified against the assembled receipts before promotion.

The controller grows from 100,519 to 102,088 bytes (gzip-9: 27,175 to 27,506).
Its SHA-256 is
`b67b8b1205ee889f2b730a7a88b31b5581e509cca11f8e6eeaa69ae239830ddc`.
Both annual controller ceilings move from 101,000 to 103,000 bytes; the live
heap/copy admission limits and other artifact budgets remain unchanged.

Source archive SHA-256 values:

- 2025: `d9e398931cd5b76a99b22cccc329dee92907c477147e242e80e2a524e9262e6f`.
- 2026: `4d497f7bf92e9def57d7ed0c51f238578d16dba4ef4830b8f16237786d1e310f`.
