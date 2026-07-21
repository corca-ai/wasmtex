# XeTeX WTPDF build evidence (`23f2ce1`)

This record supersedes the XeTeX portion of
[`xetex-wtpdf-6402c96.md`](xetex-wtpdf-6402c96.md). It verifies the fail-loud
native build and the corrected Xpdf version banner. It is not a release-clearance
statement or a full compatibility approval.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex commit | `23f2ce1bc42cb8c5dc710258ea87b3cf729243a0` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live's Xpdf 4.04 source at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build environment | x86_64 Linux, Docker 24.0.2 |
| Date | 2026-07-21 UTC |

The exact commit was transferred as a verified Git bundle and checked out cleanly
in the recorded build environment.

## Results

- `git apply --check` and web2c regeneration passed.
- The native build produced `xetex`, all required tangle/web2c helpers, and
  `libkpathsea.a`; missing any listed output now fails the Docker build.
- Native `xetex --version` reported `Compiled with PDF backend xpdf version 4.04`.
- The WebAssembly WTPDF smoke test required and observed backend version `4.04`.
- The final link map contained both `libxetex_a-wtpdf-xpdf.o` and `libxpdf.a`.
- The map, JavaScript, and WebAssembly contained no `libpplib` or
  `ppdoc_`/`ppdict_`/`pparray_`/`ppstream_`/`ppref_` pattern.
- `wasmtex-xetex.wasm` passed `WebAssembly.validate`.

## Artifact hashes

These identify the evidence build only and are not published release hashes.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `wasmtex-xetex.js` | 107070 | `f8d03b13b64f5b0fa302bff04bab09edbf6438971bb9a929c89e6a871273ec45` |
| `wasmtex-xetex.worker.js` | 10985 | `e998fa8c7897f30806685899bfd5a46e0075e7dd7c02ba739c330900856a61b6` |
| `wasmtex-xetex.wasm` | 3411277 | `b3b2c1474203737a26851056731f5a88ac14f8b2164fc7d433d91471c9e9cca6` |
| `wasmtex-xetex.map` | 1939813 | `7528b94a686e3f17fb819d233f8925bb3977a7315ad99ae089f272f8cd5f49bb` |

The dvipdfmx path was not modified by the commits between the earlier full-pipeline
evidence and this XeTeX-only rebuild. A release must nevertheless rebuild and hash
the whole engine set from its final exact commit.

The old-parser comparisons that followed this build are recorded in
[`xetex-geometry-differential-aa23fbb.md`](xetex-geometry-differential-aa23fbb.md)
and
[`xetex-visual-differential-77fef0c.md`](xetex-visual-differential-77fef0c.md).

## Remaining scope

- extended real-world, malformed, and encrypted PDF corpus testing;
- LuaHBTeX removal of `pplib` (later completed at the build-audit level in
  [`luahbtex-wtpdf-666663b.md`](luahbtex-wtpdf-666663b.md));
- complete corresponding source, relink compliance, notices, and provenance.
