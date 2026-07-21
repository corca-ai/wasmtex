# Compatibility harness

Measures **what fraction of real LaTeX documents WasmTex compiles**, and buckets
the failures by root cause. It turns the vague goal "handle more `.tex` files" into
a ranked, data-backed backlog.

It drives the **real** headless engine (`WasmTexCompiler`) in headless Chromium
against the **live** TeX Live CDN, then classifies each compile log with the pure
classifier in [`src/compat/classify.ts`](../src/compat/classify.ts).

## Run it

```bash
# Built-in seed corpus (one case per failure class) + self-test
node scripts/compat/run.mjs --self-test

# Point at a large external corpus (e.g. unpacked arXiv source dumps)
node scripts/compat/run.mjs --corpus /path/to/corpus --limit 500

# Tuning
node scripts/compat/run.mjs --timeout 90000 --reset-every 50 --out compat
```

Outputs `compat/report.json` (full per-case data + log excerpts) and
`compat/report.md` (human summary: success rate, a failures-by-cause table, the
top missing packages / fonts / project files, the documents needing
XeLaTeX/LuaLaTeX, a per-case results table, and per-failure log excerpts). Both
are git-ignored — they are generated artifacts.

> In a git worktree, first ensure `node_modules` resolves (the runner starts a Vite
> dev server). A symlink to the primary checkout works:
> `ln -s ../../../node_modules node_modules`.

## What a "case" is

A directory containing at least one `.tex` file (searched recursively). The main
file is `main.tex`, else the `.tex` that contains `\documentclass`, else the first
`.tex`. So both the seed corpus and an arXiv-style "one directory per paper" dump
work without extra configuration. Text files (`.tex/.bib/.cls/.sty/...`) are sent
as UTF-8; small binaries (`.png/.jpg/.pdf/.otf/...`) as base64.

## Failure taxonomy

Defined in `src/compat/classify.ts` (and unit-tested in `classify.test.ts`):

| Class | Meaning | Fixed by |
|---|---|---|
| `ok` | Compiled to a PDF | — |
| `needs-xelatex-lualatex` | fontspec / unicode-math / CJK — needs a Unicode engine | Stage 2 |
| `needs-biber` | biblatex requires Biber (also flagged on a "successful" but unresolved compile) | Stage 3 |
| `needs-shell-escape` | minted / external tool (also flagged on degraded success) | Stage 5 |
| `image-format` | EPS/SVG/… pdfTeX cannot embed (usually a *signal*: pdfTeX recovers and emits a figure-less PDF) | Stage 5 |
| `missing-package` | A `.sty/.cls/...` is not on the CDN mirror | Stage 1 |
| `missing-font` | A font file is not on the CDN mirror | Stage 1 |
| `missing-file` | A referenced image/input is absent from the project | (author error) |
| `memory-exhausted` | TeX capacity / WASM OOM | Stage 4 |
| `undefined-control-sequence` | Often a downstream symptom of a missing package | — |
| `compile-timeout` / `engine-crash` | Runner-level signals | — |
| `tex-error` / `unknown` | Anything else | — |

A "successful" compile can still be **silently wrong**: biblatex emits a PDF with
unresolved citations, minted emits one with un-highlighted code. Those are elevated
out of `ok` (see `DEGRADED_ON_SUCCESS`). A merely-missing figure is **not** elevated
(too noisy), but its `image-format` cause is still recorded in `signals`.

## Self-test

Each seed case carries an `expect.json` (`{ "class": ..., "signal": ..., "note": ... }`).
`--self-test` exits non-zero on any mismatch (a `class` that differs, or an
`expectedSignal` absent from `signals`), so the seed corpus doubles as a living
spec of current engine behaviour. Expectations encode **today's reality**: e.g.
`needs-xelatex-cjk` (Korean via `xeCJK`) now expects `needs-xelatex-lualatex`
because the multi-engine router (`detectEngine` in `src/engine/engine-select.ts`)
reads the XeTeX requirement straight from the source — independent of mirror state
— and returns an actionable "requires XeLaTeX" result up front. Its note records
that before that router shipped it failed as `missing-package`, since `xeCJK.sty`
was not yet on the mirror.

## CI note

The harness is **network-dependent and slow** (live CDN). It is a manual /
diagnostic tool, not a CI gate. The deterministic guard for the classifier is the
Vitest suite `src/compat/classify.test.ts`, which runs offline.
