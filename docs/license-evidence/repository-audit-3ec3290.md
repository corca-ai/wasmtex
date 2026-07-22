# Repository history and pre-publication audit (`3ec3290`)

Audit of the full local Git history and working tree ahead of source-repository
publication, run 2026-07-22 at commit
`3ec3290` on the only branch (`main`, 68 commits, no remote configured).

## Secret scan

- Tool: gitleaks 8.30.1 (default ruleset, `--redact`).
- `gitleaks git .` scanned all 68 commits (`git rev-list --objects --all`
  coverage of every reachable blob, ~3.19 MB): **no leaks found**.
- `gitleaks dir .` scanned the working tree including gitignored files
  (~17.87 MB): **no leaks found**.
- Both JSON reports are the empty finding set (SHA-256
  `37517e5f3dc66819f61f5a7bb8ace1921282415f10551d2defa5c3eb0985b570`).

## Large blob, binary, and archive audit

- No blob in the entire history exceeds 200 KB except text files; the largest
  reachable blobs are `package-lock.json` (161 KB), tracked revisions of
  `wasm-build/patches/texlive-wtpdf.patch` (≤146 KB), and the link-inventory
  evidence JSONs (89 KB) — all human-readable text with in-repo provenance.
- Zero files with binary/archive extensions (`.wasm`, `.fmt`, `.gz`, `.zip`,
  `.tar`, `.pdf`, `.png`, `.ttf`, …) exist anywhere in history: engine bytes,
  formats, and demo outputs never entered version control.
- No tags, no stash entries, no Git LFS objects, and no additional branches
  exist; there is no configured remote.

## Third-party source header audit

- The only file ported from third-party source is
  `src/synctex/synctex-parser.ts`; its header names the upstream author and
  copyright (Jérôme Laurens, 2008–2017) and points at the retained
  `LICENSES/SyncTeX.txt` permission and non-endorsement notice.
- `wasm-build/pdf-backend/` (WTPDF adapter) and `wasm-build/sha2/` are
  WasmTex-authored MIT sources carrying SPDX identifiers; the TeX Live patch
  is a diff against the pinned upstream tree and ships no third-party file
  bodies beyond the modified hunks.
- Remaining WasmTex-original TypeScript/C glue is covered by the root MIT
  `LICENSE`; no file carries a conflicting notice.

## CI enforcement

`npm run check:licenses` (the repo's fail-closed license scanner: unapproved
binary tracking, `pplib` reintroduction, notice/inventory/manifest coherence,
and SPDX SBOM staleness via `gen-engine-sbom.mjs --check`) runs in
`.github/workflows/ci.yml` and in every `wasm-*.yml` engine workflow; the
engine workflows additionally run `--release` strict mode before artifact
upload or Pages deployment.

## Scope

This audit covers the repository as of `3ec3290`. Re-run the secret and blob
scans on the final pre-publication commit before creating a public remote.
