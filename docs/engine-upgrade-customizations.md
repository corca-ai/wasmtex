# Engine customizations to review on a TeX Live upgrade

This is the maintenance inventory for our engine changes, checked against the
2025/2026 releases adopted in [compile experiment #140](https://github.com/corca-ai/wasmtex/issues/140).
Use it with the [annual upgrade procedure](texlive-upgrade.md),
[optimization policy](engine-optimization-policy.md), and
the [corresponding-source release procedure](corresponding-source.md).
Update this inventory whenever an engine customization is added, removed, or
changes its upstream assumptions. Release receipts remain authoritative for the
exact source revisions and files shipped; this document is not a replacement lockfile.

## Adopted customization inventory

| Change and purpose | Maintained inputs | Upgrade review and regression coverage |
| --- | --- | --- |
| Bounded decoded-format read reuse: avoid repeated gzip decoding in pdfTeX (ordinary and checkpoint) and XeTeX. | `wasm-build/fmt-cache.c`; linkage in `wasm-build/Makefile` and `wasm-build/build-xetex2.sh`; `flushcache` cleanup in `pdftex-worker.js` and `xetex-worker.js`. | Verify zlib `gzdopen`/`gzread`/`gzclose` interposition still intercepts actual format reads; Emscripten MEMFS stream identity and heap views still work. Run the real WASM/zlib differential and repeated compile/state tests. No upstream format layout patch is involved. |
| LuaHBTeX O3 + LTO: improve whole compilation. | `wasm-build/build-luatex.sh` configures, compiles glue/libraries and links with `-O3 -flto`; `.github/workflows/wasm-luatex.yml`. | Rebuild the complete family with one pinned toolchain; check bitcode archive classification, imported PDFs, Unicode/fonts, output, peak memory, download size and alternating whole-compile timings. Do not copy these flags to pdfTeX or XeTeX. |
| dvipdfmx font-map auxiliary index: accelerate lookup/insertion while retaining original table ownership and iteration. | `wasm-build/fontmap-index/fontmap-index.patch`, `fontmap-index.h`; applied in `wasm-build/build-dvipdfm2.sh`. | Check upstream `fontmap.c`/`dpxutil.c` ownership, replacement, deletion and destruction. Run the upstream-source differential with allocation failure and sanitizer coverage, then full conversion/output comparisons. See the [font-map implementation](../wasm-build/fontmap-index/README.md). |
| dvipdfmx missing-SFD filename lifetime fix. | `wasm-build/dvipdfmx-fixes/missing-sfd.patch`, applied before the index patch by `build-dvipdfm2.sh`. | Check whether upstream already fixes the use-after-free; remove an obsolete patch deliberately instead of forcing it to apply. Retain missing-SFD warning/recovery and sanitizer tests. This intentional diagnostic correction is separate from performance qualification. See the [correctness fix](../wasm-build/dvipdfmx-fixes/README.md). |
| Unicode-engine PDF import adapter. | `wasm-build/patches/texlive-wtpdf.patch`, `texlive-wtpdf-2026.patch`, `wasm-build/pdf-backend/`; applied by `Dockerfile.xetex` and `Dockerfile.luatex`. | Review the year-specific patch selection and regenerated configure/Makefile inputs. Verify the PDF parser interface, link inventory, adapter smoke, and Xe/Lua PDF-import goldens. The 2026 patch selection is not automatically appropriate for the next year. |
| Engine/host boundary and restartable execution. | `wasm-build/*-entry.c`, `wasm-entry.c`, `kpse-hook.c`, `*-worker.js`, JS libraries; `Makefile` and engine build scripts. | Verify entry exports, kpathsea wrapping, native code generation/wasm32 header fixups, CDN lookup, nested output, abort/recovery, project switching, checkpoints and Node/browser parity. The [engine guide](engine.md) and [execution model](execution-model.md) own the broader architecture. |

These changes are tracked glue, build settings and build-applied patches around
pinned upstream sources. There is no separate source fork to merge wholesale.
A patch applying cleanly is only a syntax/context check, not proof that its
ownership or state assumptions remain valid.

### Format-cache invariants

The cache stores one byte-compared compressed source and successful decoded
read chunks: at most 8 MiB source, 32 MiB decoded payload and 65,536 chunks.
It caches bytes before TeX byte swapping, not reconstructed engine state.
A different source invalidates reuse; a different read size resumes native gzip
at the consumed offset. Noneligible streams retain the native path.

Only JS-owned byte copies survive a heap reset. A recycled `gzFile` address is
not a valid stream identity: the abort fix also checks the live MEMFS FD stream.
Keep `flushcache` invalidation and replace the worker on engine transitions.
Never restore an old engine build's heap checkpoint under new WASM, or weaken
the persistent-preamble build-identity key to force a cache hit.

Run `wasm-build/tests/check-fmt-cache.sh` inside the matching built Emscripten
container: it requires that build's `/build/wasm/libs/zlib/libz.a` and compiles
both native-path and wrapped probes. It covers changed read sizes, corrupt/plain
input, nested streams, replacement, abort/FD reuse and memory growth. Also verify
real format-cache hits and output in the full engine; a standalone probe alone
does not establish that a new upstream format loader uses the wrappers.

### Build and release machinery changed with #140

- `wasm-build/Dockerfile` requires the pdfTeX/BibTeX native generated inputs to
  exist and be nonempty even when unrelated native targets fail. An annual
  code-generator change must be handled explicitly, not bypassed with stale C files.
- `scripts/lib/link-inventory.mjs` and `scripts/gen-link-inventory.mjs` account
  for LTO archive members. Review actual linked components and SBOM provenance;
  absence of ordinary object symbols is not evidence that a library was unlinked.
- `scripts/lib/engine-build-receipt.mjs`, `scripts/reuse-engine-formats.mjs` and
  `scripts/engine-release-components.json` retain original format-generation
  provenance when assembling an optimization release. Copied formats must not
  be attributed to the new binary build.
- The 2026 Lua WASM size budget is 8,300,000 bytes (qualified artifact:
  8,076,867 bytes). Other runtime and memory ceilings were not relaxed. Review
  the new year's `scripts/engine-performance-budgets-<year>.json` explicitly.

## Rejected variants: do not carry them forward accidentally

| Variant | Reason it is absent from the adopted release |
| --- | --- |
| pdfTeX LTO, with or without the format cache | Memory-access failure after varied project switches followed by embedded PDF, despite faster small benchmarks. pdfTeX retains O2. |
| Ordinary O3 alone; XeTeX LTO; Lua decoded-format reuse | Did not meet the predeclared whole-compile performance gate. XeTeX retains O2 and Lua has no decoded-format cache. |
| SDK transfer plus worker MEMFS ownership changes | Actual SDK-to-worker experiment improved initialization plus first compile by at most 1.8%, below the 5% gate. Existing transfer paths remain. |

Keep the complete [13-document project-switch regression](../test/fixtures/project-switch-images/README.md).
The final image alone and shortened prefixes passed the rejected PDF LTO build.
These decisions apply to the tested pins; a future retry needs new independent
qualification, not reuse of the rejected experiment's faster timing numbers.
[Compile performance](compile-performance.md) records results, costs and raw evidence.

## Upgrade sequence and completion record

1. Record the old annual source/toolchain pins, released assets, mirrors, format
   hashes and generation receipts. Add a new immutable annual source ref; review
   all supported-year validators, workflow matrices, catalog/profile configuration
   and year-specific patches. Do not repoint an existing immutable snapshot.
2. Review every inventory row against the new upstream source. Record
   **retained**, **adapted**, or **removed because upstream now provides it**, with
   source links and reasoning. Preserve loud patch/interface drift failures.
3. Build an unoptimized comparison and the selected candidate against the same
   new-year source, toolchain, mirror and format set. For an actual annual
   upgrade generate new matching formats; old-year format compatibility is not
   promised. Within that new-year optimization comparison, reuse the exact same
   format bytes. Keep existing annual lines and their goldens unchanged.
4. Run source-based patch differentials, real WASM format probes, and each affected
   family's full Node/browser output and feature corpus. Include ordinary and
   checkpoint PDF, XeTeX plus dvipdfmx, LuaHBTeX, fonts/images/bibliography,
   errors, nested projects, repeated edits, project switching, abort/reset,
   cache flush, heap growth, and persistent-cache transition/rollback.
5. Measure whole-pipeline cold/repeat/body/preamble stages without tracing, using
   alternating pairs; record memory and compressed asset costs separately.
   #140 used five pairs, at least 5% gain and no unrelated stage regression above
   `max(5%, 5ms)`. Requalify on the new pin rather than promising the old speedup.
6. Complete independent clean rebuilds, inventories/SBOMs, receipts, source
   archive verification and annual goldens. An annual semantic difference needs
   explicit review; never refresh old-year goldens or broaden normalization to
   conceal an optimization regression. Publish new immutable engine assets.
7. The integrating application separately qualifies its profile resolution,
   templates, cache retirement, rollback and deployment. WasmTex must neither
   import CorTeX code nor require its checkout/schema to build or test. A genuine
   new TeX Live year may add an integrator-selected annual option; a transparent
   engine successor within an existing year must preserve stored selections,
   labels, snapshot dates and choice count.

Record the inventory decisions, exact pins, patch checks, baseline/candidate
identities, commands, environment, comparison outcomes, measured costs, release
links and integrator adoption evidence in the upgrade tracking issue. Link that
record here when the upgrade completes. The completed 2025/2026 optimization
record is [#140](https://github.com/corca-ai/wasmtex/issues/140), with releases
[2025-6d8b01c3a4570ad1](https://github.com/corca-ai/wasmtex/releases/tag/engine-2025-6d8b01c3a4570ad1)
and [2026-52bd7d6287f2a826](https://github.com/corca-ai/wasmtex/releases/tag/engine-2026-52bd7d6287f2a826).
