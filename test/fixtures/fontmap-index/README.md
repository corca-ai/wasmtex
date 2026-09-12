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

`missing-subfont.json` deliberately omits `Unicode.sfd`. Both pinned upstream
versions free its name before printing the missing-SFD warning (#133). The initial
`evidence-20260912.tar.gz` comparison fails on `log`, which held #132. After the
separate #134 correctness fix, fixed-baseline versus indexed comparison must pass
with exact logs. Both generations of evidence are retained; no warning is normalized.

`evidence-20260912.tar.gz` is immutable experiment evidence, not a golden-output
update. It contains complete raw reports for five alternating timing pairs per
year, three additional projects per year, the rejected missing-SFD pairs, and
build revision/hash records. Absolute supplied-asset paths in the metadata identify
the measurement host; the harness itself requires only explicit asset directories.

To inspect and verify the recorded evidence with Node 24:

```sh
mkdir -p /tmp/fontmap-evidence
tar -xzf test/fixtures/fontmap-index/evidence-20260912.tar.gz -C /tmp/fontmap-evidence
node scripts/compare-fontmap-reports.mjs \
  /tmp/fontmap-evidence/timing/2025/0/baseline/report.json \
  /tmp/fontmap-evidence/timing/2025/0/candidate/report.json
# Expected nonzero exit: the existing use-after-free changes the warning.
node scripts/compare-fontmap-reports.mjs \
  /tmp/fontmap-evidence/rejected/2025/baseline/report.json \
  /tmp/fontmap-evidence/rejected/2025/candidate/report.json
```

Timing reports predate the final addition of structured diagnostics/geometry to
the harness; the separate compatibility reports include those fields. Each pair
records matching harness hashes. The comparator also verifies original format and
unaffected engine bytes, actual preloaded-format use and zero upstream misses.
The small corpus has no returned XeTeX SyncTeX; geometry equality is recorded
separately. Neither the raw reports nor the diagnostic build constitute a release.


`requalification-20260912.tar.gz` records the fixed baseline (`67ee33d`) versus
fixed-plus-index (`ce7ba66`): five alternating timing pairs and four compatibility
projects per year, Node root results, and both artifact hash sets. All 40 timing
and 64 compatibility pairs match. This includes `missing-subfont.json`, whose
warning was the initial blocker. Extract it and run the same strict comparator
with `fixed/report.json` and `indexed/report.json`; the initial archive instead
uses `baseline` and `candidate` names. See the current decision and limits in
[compile performance](../../../docs/history/compile-performance-2026-09.md#font-map-index-qualification).
