# Recorder inputs after a heap-checkpoint resume, 3 November 2026

Current behavior belongs to [compile performance](../compile-performance.md),
[the headless compiler](../headless.md) and the
[compiler API](../compiler-api.md#heap-checkpoints-arbitrary-line-incremental-compilation).
This record is qualification evidence for a controller-only correctness fix,
not a latency promise.

## Failure

CorTeX's typing benchmark on a 303-page pdfLaTeX book (24 `\include`
chapters, Chrome, the checkpoint build) found that no canonical compile
committed during a whole typing session. About 550 ms after each burst the
viewer repainted the warm-up revision on the edited page.

The first canonical compile after the warm-up resumed from a heap checkpoint.
Its result reported `inputFilesComplete: true` with 13 project inputs:
`main.tex`, `refs.bib` and chapters 1–11. Chapters 12–24, read after the
resume point, were missing. The SDK built a complete dependency manifest from
it, and CorTeX classified every later edit to chapter 12 as unrelated content,
reused the rendered PDF and skipped the compile.

## Cause and fix

web2c opens the recorder as `pdftex<pid>.fls` and renames it to `<job>.fls`
while it is still open. An Emscripten stream keeps the path it was opened with,
so `hcSnapshotFS` stored the old name. `hcRestoreFS` then reopened that name as
a new, empty file on every resume. The resumed run's recorder lines went there,
and `<job>.fls` kept only what was flushed before the checkpoint.

The controller now snapshots each open stream at its node's current path and
advertises `resumeRecorder`. On a worker without it, the SDK marks a resumed
compile's recorder incomplete, so its manifest is `recorder-unavailable` and
never a reuse proof. Hosts then compile conservatively.

## Observations

Local CorTeX benchmark, the 303-page book, released SDK `6856f34` plus this
SDK:

| Worker | Resumed manifest | Canonical compiles skipped as unrelated |
| --- | --- | ---: |
| Released (`b67b8b12`) | complete, 13 inputs, chapter 12 missing | all |
| Released, with this SDK | incomplete (`recorder-unavailable`) | 0 |
| This controller | complete, 26 inputs | 0 |

Over two 16-burst runs, stale repaints fell from 32 to 0 and the final revision
was reconciled in 2 of 2 runs instead of 0 of 2. These are individual
benchmark runs, not percentiles.

## Standalone qualification

Unit tests cover the snapshot path of a renamed open stream and the manifest of
a cold compile, a resume on an older worker and a resume on a fixed worker.

Golden Canary [41585479990](https://github.com/corca-ai/wasmtex/actions/runs/41585479990)
ran the registered candidates of both annual lines in Chrome: golden outputs,
heap checkpoints, page previews and cross-host parity passed. The indexed
`\include` and `\subfile` books resume the edited chapter with PDF, `.aux`,
`.toc`, `.ind`, `.out` and SyncTeX equal to a full compile, and now also require
the resumed dependency manifest to be complete and equal to the full compile's.

`check-output-preservation.mjs` compared each assembled candidate with its
annual baseline on `article.tex` and `fonts-and-microtype.tex`, at root and
nested paths. All four comparisons per year matched using only the existing
date/ID removal. This small corpus is scoped evidence. The plain build the
check runs never takes heap checkpoints; the controller change is confined to
checkpoint snapshots and the capability message. Both annual builds preserve
every preceding native module, glue and format byte; only the controller,
its receipts and the manifest change.

## Artifact and source identities

| Annual line | Baseline | Candidate | pdfTeX/BibTeX build | Source publication |
| --- | --- | --- | --- | --- |
| 2025 | `2025-da0c245993679764` | `2025-7ffc4e4d90b9b963` | [41581885255](https://github.com/corca-ai/wasmtex/actions/runs/41581885255) | [41582873183](https://github.com/corca-ai/wasmtex/actions/runs/41582873183) |
| 2026 | `2026-b6584b4019bcab75` | `2026-47ff73bab1a2e548` | [41579714648](https://github.com/corca-ai/wasmtex/actions/runs/41579714648) | [41581888421](https://github.com/corca-ai/wasmtex/actions/runs/41581888421) |

Both lines keep their exact immutable mirrors and original format-generation
receipts (`0dddc924cc6e69bd2a4b4630e02efe414f84515e`). Unaffected families reuse
their exact artifacts and receipts.

The first 2025 candidate, `2025-d0c89e19cb43c7e8`, built the same controller
but its source never reached its release: the repository now publishes
immutable releases, and the workflow created the release before uploading the
archive. Its empty release was deleted (the protected tag remains, unused) and
the line rebuilt after the workflow began creating each release together with
its archive. Both published tags point at main `6856f34` because the workflow
did not yet pass `--target`; the receipts name the controller commits
(`cc70034` for 2026, `c16d824` for 2025), which this branch's merge preserves.

The controller grows from 102,088 to 102,316 bytes (gzip-9: 27,531 to 27,620),
within the unchanged 103,000-byte ceiling. Its SHA-256 is
`ff3497f5ac9e7595d529280a788f4d941fa45b132870a0ed7866a861b12093c6`.

Source archive SHA-256 values:

- 2025: `ac1710a10efd42cd6c055dfcb1831960d207b7374e32aab821445c5622f8f31e`.
- 2026: `feb99c1a339643f5711487f75e86505df904df0686b2e71e10750c2766afa225`.
