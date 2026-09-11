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
