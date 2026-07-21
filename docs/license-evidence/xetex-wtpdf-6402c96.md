# XeTeX WTPDF build evidence (`6402c96`)

This record covers the first full XeTeX WebAssembly build after replacing its
`pplib` dependency with the WasmTex WTPDF adapter over Xpdf. It is build evidence,
not a release-clearance statement or a full compatibility approval.

The XeTeX portion is superseded by the fail-loud build evidence in
[`xetex-wtpdf-23f2ce1.md`](xetex-wtpdf-23f2ce1.md). This older record remains useful
for its same-run dvipdfmx build and hashes.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex commit | `6402c96ff5da8523eb06d898054a005647acf6d4` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live's Xpdf 4.04 source at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build environment | x86_64 Linux, Docker 24.0.2 |
| Date | 2026-07-21 UTC |

The exact Git commit was transferred as a verified Git bundle and checked out in
a clean directory in the recorded build environment.

## Command and gates

```sh
bash scripts/build-xetex-fromsource.sh wasm-build/dist-xetex
```

The build performed these checks before reporting success:

- `git apply --check` applied `wasm-build/patches/texlive-wtpdf.patch` to the
  pinned TeX Live source without fuzz;
- web2c autoconf/automake outputs were regenerated;
- Xpdf was built as `/build/wasm/libs/xpdf/libxpdf.a`;
- the WTPDF WebAssembly smoke test passed file and copied-memory input, size
  limits, page count, page boxes and fallback, and rotation normalization;
- the final XeTeX link emitted a map and required `libxpdf.a` in it;
- the XeTeX map, JavaScript, and WebAssembly contained no `libpplib` or
  `ppdoc_`/`ppdict_`/`pparray_`/`ppstream_`/`ppref_` pattern;
- the XeTeX and dvipdfmx WebAssembly modules passed `WebAssembly.validate`.

The Phase 1 native build intentionally stopped at the native XeTeX executable's
unresolved WTPDF calls after generating the C sources and native code-generation
tools. It used Xpdf rather than `pplib`, and the required native tools and
`libkpathsea.a` were present. Replacing the broad tolerated failure with explicit
native targets remains a separate fail-loud build-hardening task.

## Artifact hashes

These hashes identify this evidence build only. They are not published release
hashes and must not be copied into a release manifest for a different build.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `wasmtex-xetex.js` | 107070 | `f8d03b13b64f5b0fa302bff04bab09edbf6438971bb9a929c89e6a871273ec45` |
| `wasmtex-xetex.worker.js` | 10985 | `e998fa8c7897f30806685899bfd5a46e0075e7dd7c02ba739c330900856a61b6` |
| `wasmtex-xetex.wasm` | 3411292 | `eea8841b74612242e3856d278065228ea31b39f9bf59a7c2dc0ef6a9c0ebe28e` |
| `wasmtex-xetex.map` | 1939606 | `4ae192ac74a4368584168ad61497b086d92358c93b948abd5fefb45ba13017a6` |
| `wasmtex-dvipdfm.js` | 86724 | `d781e79dfc02d40b9a2ce11cfa8178a1376623cafe74c48751f1ab331ced1d65` |
| `wasmtex-dvipdfm.worker.js` | 11280 | `116b11ada20f365311e38cf8dca1a5b471d4b07e11127f9d5ed0c91d7361504f` |
| `wasmtex-dvipdfm.wasm` | 831819 | `46ff1aa179c32760b16db1a2a2e64e1f4e95e0b4a34fdb1a9efcc503e0dad318` |

## Remaining scope

This build does not clear the overall 2025 engine release. In particular:

- at the time of this build, the old-parser versus WTPDF differential corpus
  had not run; the later geometry and self-generated visual subsets are recorded in
  [`xetex-geometry-differential-aa23fbb.md`](xetex-geometry-differential-aa23fbb.md),
  and
  [`xetex-visual-differential-77fef0c.md`](xetex-visual-differential-77fef0c.md),
  while extended PDF coverage remains open;
- LuaHBTeX still uses `pplib`;
- complete corresponding source, relink compliance, component notices, and
  TeX Live/ICU/package/font provenance are not yet complete.
