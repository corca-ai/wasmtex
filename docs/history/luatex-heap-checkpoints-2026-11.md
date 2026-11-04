# LuaLaTeX heap checkpoints, 4 November 2026

Current behavior belongs to the [compiler API](../compiler-api.md#luatex-heap-checkpoints)
and the [engine build guide](../engine-build.md#luahbtex-checkpoint-build-wasmtex-luatex-checkpoint).
This record is the qualification evidence for the first engines that ship the
LuaHBTeX checkpoint build, together with the pdfTeX `mkdir` reply of
[#223](https://github.com/corca-ai/wasmtex/pull/223).

## Problem

Every LuaLaTeX keystroke preview started from the format: 357 ms for a plain
paper, 620 ms for a `fontspec` paper, before a page of the edit. On 3 November a
probe linked LuaHBTeX with the same Asyncify settings as the pdfTeX checkpoint
build. With every caller of `invoke_*` instrumented, frames slowed by 22–38%
before any checkpoint was taken, and the probe was rejected.

## Selective instrumentation

A heap checkpoint suspends TeX inside the read of a project line. A Node
harness recorded the call stack at every `.tex` line read in four documents: a
plain paper, a `fontspec` paper, a kotex paper and a 24-chapter `\include` book.
On both annual lines, every stack held the same 14 functions, from `__stdio_read`
through `main_control` to `compileLaTeX`. No stack exceeded 11 frames, and no
`invoke_*`, Lua or JavaScript frame sat between WebAssembly frames.

An `ASYNCIFY_ONLY` link of those 14 functions was relinked locally from the CI
link inputs in the pinned `emscripten/emsdk:3.1.46` image. A plain relink there
was byte-identical to CI. The selective link added 10.5 KB of WebAssembly and
left gzip size unchanged. Against the same toolchain's plain link, frames were
0.1–5% slower: 10 interleaved warm edits per cell, medians.

A probe of 30 functions (the 14 plus 16 common expansion routines) cost 0.5–6%.

## Lab evidence

A prototype controller took one checkpoint and resumed it. All 16 resumed
compiles produced PDFs byte-identical to fresh compiles on the shipped engine,
with dates and document IDs removed. Previews resumed from the checkpoint and
stopped by a text hook took 34–50 ms against 380–680 ms for the prefix job.

Sparse images were 119–155 MiB for Latin-script documents and 464 MiB for the
kotex paper with its CJK fonts. Deflate shrank them 6–7×, but inflating cost
190–950 ms per resume, so compression was rejected.

Two independent plan reviews changed the design:

- previews stop through an engine page limit rather than a text hook;
- the budget is checked before copying;
- the stack guard fails closed;
- the checkpoint build loads only through its own option.

## Released design

- `wasmtex-luatex-checkpoint.{js,wasm}` is the same link with Asyncify limited to
  `wasm-build/luatex-checkpoint-frames.json`. The workflow records the listed
  functions' indices in the glue and strips names. The build fails when a listed
  function is missing.
- The worker refuses a checkpoint whose stack holds any other WebAssembly frame,
  or whose trace it cannot parse.
- `texlive-luatex-preview-limit.patch` stops `ship_out` after a host-set page
  count, as `tex.finish()` does. Plain builds carry it with a limit of zero.
- An image over `maxBytes` is refused before it is copied, without evicting
  checkpoints that fit.

## Measurements (SDK, Node worker host, 2026 line)

These use the merged SDK with `luatexHeapCheckpoints: { maxCheckpoints: 1,
maxBytes: 200 MiB }`, compared against the same assets without it. Each cell
has 10 warm edits from two interleaved rounds; previews run to the edited page.

| Document | `previewPages` | `compile()` | Retained |
| --- | ---: | ---: | ---: |
| Plain paper, edit on p. 10 | 357 → 32 ms | 407 → 86 ms | 94 MiB |
| `fontspec` paper | 620 → 41 ms | 714 → 140 ms | 107–121 MiB |
| 24-chapter book, edit in ch. 12, cursor hint | 595 → 135 ms | 2,677 → 1,262 ms | 115–122 MiB |
| kotex paper, image refused | 822 → 846 ms | 890 → 932 ms | — |

These are compile-to-bytes figures. Application input-to-paint and process
memory belong to the integrating host.

## Qualification

- **Unit tests:**
  - the driver's capabilities and forwarded fields;
  - engine commands and refusal parsing;
  - the compiler's opt-in, resume, preview fallback, plain build,
    secondary-source edits and helper compilers;
  - the frame-index script.
- **Node smoke** (`luatex-heap-checkpoints.smoke.test.ts`) on CI-built 2025 and
  2026 assets:
  - a resumed compile equals a fresh compile byte for byte;
  - a preview stops at its page limit;
  - a line read while a macro scans an argument is refused (`stack`);
  - a tight budget is refused (`budget`);
  - the format survives a preview.

  CI now runs the smoke on both registered lines.
- **Output preservation:** `check-output-preservation.mjs` compared each
  assembled candidate with its annual baseline at root and nested paths. Only
  dates and document IDs were removed before comparing.

  | Engine | Documents | Result |
  | --- | --- | --- |
  | pdfLaTeX | `article.tex`, `fonts-and-microtype.tex` | All identical |
  | LuaLaTeX | `article.tex` and the plain, `fontspec` and kotex papers | All identical |
  | LuaLaTeX, checkpoint build run as a plain engine | The same LuaLaTeX documents | Identical on CI-built branch assets |

  `fonts-and-microtype.tex` under LuaLaTeX fails to typeset on the Node host
  with the shipped engines too: Times bold falls back to a PK font. It is
  therefore evidence of neither outcome.
- **Code review:** two independent reviews, one of the engine and worker and one
  of the SDK. Their findings were fixed before merge:
  - helper compilers inherited the option;
  - a crashed resume replied with a stale PDF, or did not reply;
  - line offsets were computed on decoded text;
  - file copies happened before the budget check.

## Artifact and source identities

| Annual line | Baseline | Candidate | pdfTeX/BibTeX build | LuaHBTeX build | Source publication |
| --- | --- | --- | --- | --- | --- |
| 2025 | `2025-7ffc4e4d90b9b963` | `2025-060d2a2f96025172` | [41777480728](https://github.com/corca-ai/wasmtex/actions/runs/41777480728) | [41777480731](https://github.com/corca-ai/wasmtex/actions/runs/41777480731) | [41781142119](https://github.com/corca-ai/wasmtex/actions/runs/41781142119) |
| 2026 | `2026-47ff73bab1a2e548` | `2026-0e90bf793d9d36c3` | [41777480728](https://github.com/corca-ai/wasmtex/actions/runs/41777480728) | [41777480731](https://github.com/corca-ai/wasmtex/actions/runs/41777480731) | [41781138877](https://github.com/corca-ai/wasmtex/actions/runs/41781138877) |

Both builds come from main `79a68b6`. Both lines keep their exact immutable
mirrors, every format byte, and original format-generation receipts
(`0dddc924cc6e69bd2a4b4630e02efe414f84515e`). Families whose inputs did not
change reuse their exact artifacts and receipts.

What changed against the baselines:

- pdfTeX: only the worker controller and its receipts.
- LuaHBTeX:
  - the glue;
  - the engine binary, +80 bytes from the page-limit patch;
  - the worker;
  - the new checkpoint variant: +10 KB over the plain engine on 2026, +11 KB on 2025.

## Limits

These are single-machine Node measurements, not field percentiles.

- The integrating host decides admission and budget. CorTeX enables one
  checkpoint of 200 MiB on desktop, so kotex-sized images keep the prefix job.
- A book gains only when the host passes the edit's location as a hint.
- Firefox and WebKit stack formats are handled by the guard but were not
  measured here.
