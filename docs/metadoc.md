# Documentation Guide

This document defines how to write and maintain project docs.

## Goal

Keep docs easy to scan and easy to trust for both humans and agents.

## Principles

- Treat docs like code.
- Keep intent explicit and concise.
- Prefer small focused docs over long mixed docs.
- Link related docs, but keep navigation short.
- Do not version control auto-generated docs.

## Structure

- Keep `README.md` as the user-facing entry point: a short intro, install/quick-start, an entry-point overview, and links into `docs/`.
- Keep `AGENTS.md` (the contributor/agent guide) minimal and link to detailed docs; link it from `README.md` for contributors.
- Keep living project documents directly under `docs/` so the documentation graph stays flat and easy to navigate.
- Use a subdirectory only for a cohesive collection with lifecycle or naming
  rules that differ from the living docs. Give each exception a `README.md`
  that explains those rules. [History](history/README.md) holds dated experiments;
  [license evidence](license-evidence/README.md) holds
  immutable commit-bound audit records; see
  the [licensing guide](licensing.md) for their role.
- Keep skill-specific docs inside each skill and link shared rules.

## Linting

Run `awiki lint -root docs` from the repository root. The non-recursive scan is
intentional: it checks the flat graph of living project documents, while
exceptional collections retain their own governance. The command must exit
successfully before a documentation change is submitted.

## Source of truth and document lifecycle

- Use [the documentation index](README.md) to identify the guide that owns a topic.
  Keep API behavior in the reference, procedures in how-to/development/operations
  guides, and architecture in design guides. Link to the owner instead of copying it.
- Verify commands/exports against `package.json`, options against public types,
  behavior against implementations and tests, and release status against pinned
  components/receipts. Separate shipped support from architectural goals.
- Keep current guides free of session logs, temporary paths, intermediate PR
  holds and superseded "next step" recommendations. Summarize the final decision
  and link to a dated history record or issue for evidence.
- History must state its baseline/revision, environment, scope and final decision.
  If an older measurement lacks these, label that limitation; do not invent them.
  Preserve rejected results and qualification limits. Legal/source evidence has
  its own immutable lifecycle and must not be rewritten as current status.
- When moving a section, update incoming relative links and heading fragments.
  Keep a short forwarding page where an externally referenced document path
  remains useful. Check history links too; the flat `awiki` scan alone does not
  establish that file paths or heading anchors resolve.
- Avoid unqualified performance promises. Separate preparation, compile, paint,
  network, WASM capacity and process RSS; dated benchmarks are not live metrics.

## Writing Rules

- Use stable terms consistent with current architecture.
- Remove outdated architecture terms immediately.
- Prefer examples that match current runtime behavior.

Note: `CLAUDE.md` is a symlink to `AGENTS.md`.
