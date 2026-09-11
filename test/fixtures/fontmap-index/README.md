# Font-map index differential projects

These are explicit projects for `scripts/profile-font-cpu.mjs --project <file>`.
Run both released assets and candidate assets against the same immutable mirror.
The four compile stages run in one worker pair; `stages` changes the main source
and `expectedSuccess` specifies deliberate conversion failures.

- `map-operations.json`: local map file, replace/append/remove mapline operations,
  real Type 1 embedding, subfont expansion/removal, and changed/restored maps.
- `conversion-error-recovery.json`: missing embedded font fails twice, then the
  source is repaired and compiled twice in the same workers.
- `multifile-reference.json`: input file, references, TOC, hyperlinks, math and
  multiple native font styles, followed by body and preamble edits.

Compare normalized PDF hashes (dates/ID only), auxiliary output hashes, diagnostics,
conversion inputs and dependency evidence. The harness records whether SyncTeX is
actually returned; a null result is not source-navigation qualification. These
projects supplement the native table differential test and standard output corpus;
they do not alone qualify an engine release.
