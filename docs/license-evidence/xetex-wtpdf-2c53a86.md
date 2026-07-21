# XeTeX WTPDF build evidence (`2c53a86`)

This record supersedes the XeTeX portion of
[`xetex-wtpdf-e57a2d6.md`](xetex-wtpdf-e57a2d6.md). It verifies the fail-loud
native build and the corrected Xpdf version banner. It is not a release-clearance
statement or a full compatibility approval.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex commit | `2c53a8683f1c01c9c13dade3fa8f07de5b81d5f1` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live's Xpdf 4.04 source at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build host | `remote-builder`, x86_64 Linux, Docker 24.0.2 |
| Date | 2026-07-21 UTC |

The exact commit was transferred as a verified Git bundle and checked out cleanly.
All WebAssembly compilation ran on `remote-builder`.

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

The old-parser geometry comparison that followed this build is recorded in
[`xetex-geometry-differential-dba9069.md`](xetex-geometry-differential-dba9069.md).

## Remaining scope

- fixed-renderer visual and extended PDF corpus differential testing;
- LuaHBTeX removal of `pplib`;
- complete corresponding source, relink compliance, notices, and provenance.
