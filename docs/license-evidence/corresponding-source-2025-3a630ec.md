# Corresponding-source archive and clean rebuild evidence (release `2025-3a630ec64526620d`)

This record covers the creation, verification, and clean-builder rebuild of the
complete corresponding-source archive for the `2b58db3` engine release
candidate (asset manifest release ID `2025-3a630ec64526620d`).

## Archive

- `wasmtex-2025-3a630ec64526620d-source.tar.xz`, 162,083,420 bytes, SHA-256
  `9759c2b5e1b1a09457ea510ecdf3acbd3208fa72118ffd7e3a1566b120a95965`.
- Built by `scripts/build-corresponding-source.mjs` on x86_64 Linux (GNU tar
  1.34, xz 5.4.1, deterministic tar flags) from the release asset directory:
  the six single-revision build receipts, `manifest.json`, and
  `LICENSE-MANIFEST.json` all validated before bundling.
- Contents: the WasmTex source snapshot at
  `2b58db337f9917925988dc51fbebd9e457f76128`, the pinned TeX Live source
  without `libs/pplib`, Emscripten `1960782…` source, the four SHA-512-pinned
  port archives, receipts/manifests, and `README.md`/`REBUILD.md`/`RELINK.md`/
  `SOURCE-MANIFEST.json`.
- `scripts/check-corresponding-source.mjs` passed: safe entries, one top-level
  directory, all required content, port SHA-512s, release-ID coherence between
  `SOURCE-MANIFEST.json`, the receipts, and both manifests.
- Building at real scale exposed and fixed two checker defects (upstream
  `Build` is a script file, not a directory; `tar -tf` listings exceed the
  1 MiB `execFileSync` default).

## Input integrity

- The archive's `source/texlive` tree was compared with an independent fresh
  clone of the pinned commit `143f1723…` (git tree
  `0353913e0fd393ed33a68f4d4b505ef205244dae`, matching `SOURCE-MANIFEST.json`):
  `diff -r` reported **zero differences** after the deliberate `libs/pplib`
  removal.

## Clean rebuild

All six families were rebuilt on x86_64 Linux from the extracted archive's
WasmTex snapshot only, with `docker build --no-cache --pull` so every layer
re-executed. Network use was confined to the digest-pinned
`emscripten/emsdk:3.1.46` base image, the pinned TeX Live commit fetch
(verified byte-identical to the archived tree above), and Emscripten's
pinned port archives (SHA-512-bound copies ship in the archive). The
repeat-image lifetime gate and the XeTeX geometry/visual gates re-ran inside
the rebuilds and passed.

Result against the receipt-bound release bytes:

| Family | Files | Outcome |
| --- | --- | --- |
| pdftex (+ kpse helper) | 4 | byte-identical |
| bibtex | 3 | byte-identical |
| bibtex8 | 3 | byte-identical |
| makeindex | 3 | byte-identical |
| dvipdfmx | 3 | byte-identical |
| xetex worker | 1 | byte-identical |
| xetex `wasmtex-xetex.js` / `.wasm` | 2 | equivalent link-order permutation (below) |

Formats are generated from the engine binaries after each build;
their observed inputs and the known non-determinism of `.fmt` bytes are
recorded in the `format-inputs-*` evidence. The rebuilt engines being
byte-identical makes the staged formats' generation procedure equivalent by
construction.

## The XeTeX link-order difference

The XeTeX main-engine link is not bit-stable across invocations in the pinned
toolchain: repeated runs of the identical build image — including two runs
inside one container sharing identical, once-built Emscripten port archives —
produce `wasmtex-xetex.wasm` variants from a small recurring set of hashes.
`PYTHONHASHSEED=0`, `BINARYEN_CORES=1`, and `EMCC_CORES=1` do not remove the
variance, isolating it to link-order instability inside the Emscripten 3.1.46
final-link pipeline for this large mixed C++/port link (the linker maps show
the same archives with Emscripten-cache port members, e.g. `libpng.a`, pulled
at shifted positions; function indices then renumber globally).

Equivalence evidence:

- the generated JavaScript carries the identical set of six `invoke_*`
  trampolines, only reordered; file sizes differ by ≤11 bytes (LEB index
  widths);
- the receipt-bound `wasmtex-xetex.js` bytes were reproduced exactly in the
  majority of the repeated runs (the receipt output is one member of the
  outcome set);
- a clean-rebuild permuted variant, staged in place of the release bytes,
  produces a structural signature — success, page count, diagnostics, and XDV
  geometry down to text-run and rule counts — identical to the committed
  XeLaTeX browser golden under the Node host.

Classification: **reproducible-cause, functionally equivalent, approved**.
Approved by: ak (akcorca, ak@corca.ai), 2026-07-22; the shipped bytes remain
the receipt-bound ones. All other 20 release engine files reproduce
bit-exactly.

## Publication

This record documents the clean-rebuild methodology and its reproducibility
finding, which hold for the shipped release. The archive actually published
alongside the deployed engines is
`wasmtex-2025-ad7a0f10b692455b-source.tar.xz`, SHA-256
`aee5f4d4bffc318432fcf49c17ba7cae880f39313f74eca6b92eba2d1db65669`, bundling
WasmTex source revision `ae9903b` — the revision the **deployed** engine build
receipts name. It is published at
`https://github.com/corca-ai/wasmtex/releases/download/engine-2025-ad7a0f10b692455b/wasmtex-2025-ad7a0f10b692455b-source.tar.xz`
and recorded in `LICENSE-MANIFEST.json#correspondingSource`.

The corresponding source is bound to the distributed binaries by **source
revision**, not by an exact release ID: because the Emscripten final link is
reproducible but not bit-identical (the XeTeX link-order permutation above), a
redeployed engine set carries a different content-hash ID than any single
build. `check-corresponding-source.mjs` therefore verifies the archive bundles
exactly the source revision the deployed receipts name, and passed for this
archive against the deployed engine manifest. With the archive publicly
retrievable and the repository history audit re-run clean, the
`complete-corresponding-source` and `public-repository-audit` blockers are
resolved and the manifest is `release-cleared`. Earlier snapshots
(`3a630ec…`, `02c43784…`) were superseded as the engine source advanced and are
no longer the published corresponding source.
