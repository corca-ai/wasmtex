# Missing-SFD recovery

`recovery.json` supplies a mapline whose `MissingSFD.sfd` does not exist. It runs
twice, removes the invalid mapline, then restores it in the same worker pair.
All four conversions succeed; the missing-file stages must name `MissingSFD`
exactly, and the recovered stage must have no missing-SFD warning.

```sh
node scripts/profile-font-cpu.mjs --engine xelatex --year 2025 \
  --assets /path/to/fixed/2025 --texlive-url https://mirror.example/snapshot/2025/ \
  --project test/fixtures/dvipdfmx-missing-sfd/recovery.json \
  --trace false --repetitions 2 --out /tmp/missing-sfd
node scripts/check-missing-sfd-recovery.mjs /tmp/missing-sfd/report.json
```

Repeat for 2026 and original format bytes. The warning expectation is the
intentional correctness change in #133, not a relaxation of the strict
optimization comparator. The native test must reproduce the original ASan failure.

`evidence-20260912.tar.gz` retains the original/fixed browser reports, the explicit
correctness comparison (only the missing-SFD warning changes), ASan red/green CI
log and both fixed diagnostic build hashes. Eight paired conversions per year
preserve PDFs, auxiliaries, structured errors, geometry, dependencies and all
unaffected engine/format hashes. The original engines fail the exact-warning
expectation; fixed engines pass, including recovery and recurrence.

Fixed diagnostic source: `67ee33d`; workflows
[2025](https://github.com/corca-ai/wasmtex/actions/runs/34655489308) and
[2026](https://github.com/corca-ai/wasmtex/actions/runs/34655491226).
The original releases are `2025-d89c008b0cfdd8ca` and `2026-189e605bad83d618`,
with unchanged mirrors `2025-0d3fc73b65e39905` and `2026-ba38749b8714505a`.
Only dvipdfmx JS/WASM are replaced. The diagnostic does not generate formats.
These records qualify the targeted correctness fix, not a published engine unit.

For Node output comparisons, use the diagnostic clock with `--require` (CommonJS
eval workers did not inherit the ESM `--import` clock in Node 24.18.0):

```sh
node scripts/profile-font-cpu.mjs --serve-only true --year 2025 \
  --texlive-url https://mirror.example/snapshot/2025/ --cache-dir /tmp/mirror-cache
# Use the printed loopback mirror URL below. This serves hash-verified cached
# bytes from that exact snapshot; it does not create aliases or change packages.
node --require ./scripts/lib/fixed-engine-clock.cjs scripts/check-output-preservation.mjs \
  --baseline /path/to/original-public --candidate /path/to/fixed-public \
  --texlive-url http://127.0.0.1:PORT/mirror/ --texlive-version 2025 \
  --engine xelatex --scope root --report /tmp/node-comparison.json
```

The two standard root documents match for original → fixed and fixed → indexed
on both years. `--scope all` remains the default: it still fails the existing
nested-output defect [#135](https://github.com/corca-ai/wasmtex/issues/135), which
also fails identical-engine A/A controls. Root-only evidence does not establish
nested support. `--report` retains PDF bytes and diagnostics so a failed comparison
can be investigated. The Node run through the remote mirror was interrupted on a
stalled font curl; the completed runs use the exact-byte loopback proxy.
No PDF normalization was expanded to accommodate compressed creation dates.
