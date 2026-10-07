# Compact pdfTeX working capacity

These standalone fixtures exercise the plain engine's smaller initial working
allowance and automatic promotion to the original allowance. They require the
published baseline formats and the same immutable package mirror on both sides.

`tiny.tex` is a ten-line document. `capacity-lookup.tex` exhausts the compact
main-memory allowance with an unshipped box, but fits the original allowance.
Before exhaustion it probes an available package, a missing package, and a
project output file. Its first successful output must match the baseline;
failed-attempt output must not change the file-existence branch. Subsequent
compiles observe the completed output normally.

`project.json` starts with the tiny document, exercises promotion in a body edit,
then returns to a small document. Promotion is sticky for the worker lifetime.
The controller tests separately verify original-capacity exhaustion, unrelated
capacity errors, heap-checkpoint admission, project replacement and retry timing.

From a repository checkout, output preservation accepts public asset roots
containing `wasmtex/<year>/`; CPU profiling accepts the flat annual directory:

```sh
node scripts/check-output-preservation.mjs --baseline BASELINE_PUBLIC --candidate CANDIDATE_PUBLIC \
  --texlive-version 2026 --engine pdflatex --texlive-url IMMUTABLE_MIRROR \
  --corpus test/fixtures/compact-capacity
node scripts/profile-font-cpu.mjs --assets CANDIDATE_PUBLIC/wasmtex/2026 --year 2026 \
  --engine pdflatex --texlive-url IMMUTABLE_MIRROR --trace false --heap-stats true \
  --project test/fixtures/compact-capacity/project.json --out test-results/compact-capacity
```

Repeat for 2025 with its matching assets, formats and mirror. Run the standard
output corpus and checkpoint/cross-host suites as well; these fixtures are not a
replacement for full [engine qualification](../../../docs/engine-testing.md).
