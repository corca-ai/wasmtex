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
  that explains those rules. `license-evidence/` is the current exception: its
  commit-bound audit records are immutable and are indexed by its README; see
  the [licensing guide](licensing.md) for their role.
- Keep skill-specific docs inside each skill and link shared rules.

## Linting

Run `awiki lint -root docs` from the repository root. The non-recursive scan is
intentional: it checks the flat graph of living project documents, while
exceptional collections retain their own governance. The command must exit
successfully before a documentation change is submitted.

## Writing Rules

- Use stable terms consistent with current architecture.
- Remove outdated architecture terms immediately.
- Prefer examples that match current runtime behavior.

Note: `CLAUDE.md` is a symlink to `AGENTS.md`.
