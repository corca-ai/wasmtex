# LuaHBTeX WTPDF build evidence (`b1888f4`)

This record verifies that the LuaHBTeX WebAssembly build uses the independently
named WTPDF adapter and TeX Live's Xpdf 4.04 instead of `pplib`. It also verifies
the independent SHA-256/384/512 implementation that replaces LuaTeX's hidden use
of `pplib`'s `utilsha`. This is build and dependency evidence, not release
clearance or full Lua PDF API compatibility approval.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex commit | `b1888f45cc990222516c2a13047a6be126097e81` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live's Xpdf 4.04 source at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build host | `remote-builder`, x86_64 Linux, Docker 24.0.2 |
| Docker image | `sha256:21cc63ae3c47f22ff58cfaa48a164c45c6bd42e3b372211168dcd0d6dc642875` |
| Date | 2026-07-21 UTC |

The commit was transferred to `remote-builder` as a Git bundle. Its local and remote
SHA-256 was
`79ba6d424d8cff01a5aff4ea770ce104fbc0cfb2226531070afe430638742ed4`,
and the clean remote checkout resolved to the full commit above. All WebAssembly
compilation ran on `remote-builder`; none ran on the local macOS workspace.

## Audited source inputs

| Source | SHA-256 |
| --- | --- |
| `wasm-build/Dockerfile.luatex` | `c83189a974a71284a4adc62df7f70af59287233330991e8bca632b4b17415ef8` |
| `wasm-build/build-luatex.sh` | `1a8a7700f19b01fc82a45e4cc8446779a45770d3c955837c0758fa655cd7614e` |
| `wasm-build/patches/texlive-wtpdf.patch` | `e9f13f837e89bb6d257dec2f3d762a3971fc2b04d3d6d220b112aff8aba21f9f` |
| `wasm-build/pdf-backend/wtpdf.h` | `eeb3c9c77076aaf0a4470cab5864c2056a6de559295327e4432ea66bf1c9e510` |
| `wasm-build/pdf-backend/wtpdf-xpdf.cc` | `8baf6fbb9853ace225729444d20710e1b80762eca24d0ba8417ff520b0925dbb` |
| `wasm-build/pdf-backend/wtpdf-smoke.cc` | `bf487858297804bb7181fab6d6a66fa114b63abb14b5cfc937191df2171f8d89` |
| `wasm-build/sha2/wasmtex-sha2.h` | `5f7c8e54563cf25550b22d28cc2ae86677ff0f4eb3b7b5b4478eb2254cf97192` |
| `wasm-build/sha2/wasmtex-sha2.c` | `f44dcee7e85acc649eaa797dba9225d60a101b94ac4ac9b5bdb3adb79e2257ae` |
| `wasm-build/sha2/wasmtex-sha2-smoke.c` | `787bcf753cd73044bf1c30e217309c78a9122d7ea10c72ed500c3cbbd16b199f` |

## Results

- The exact patch passed `git apply --check` against the pinned TeX Live commit,
  followed by web2c `reautoconf`.
- The source audit rejected old parser identifiers in `epdf.h`, `pdftoepdf.c`,
  `lpdfelib.c`, `lpdfscannerlib.c`, `luainit.c`, `md5lib.c`, and the relevant
  automake inputs.
- The native SHA-2 smoke test passed under strict C99 warnings. It covered the
  standard SHA-256, SHA-384, and SHA-512 `abc` vectors and padding-boundary
  vectors.
- The fail-closed native phase built `luahbtex`, `ctangle`, `ctangleboot`,
  `tangle`, `tangleboot`, and `web2c`. A missing output or native compile/link
  failure stops the Docker image build.
- The same SHA-2 smoke test compiled with Emscripten and passed under Node.
- TeX Live's Xpdf archive was compiled with Emscripten, and the WTPDF WebAssembly
  smoke test passed.
- The LuaHBTeX image inclusion, `pdfe`, and `pdfscanner` ports compiled into the
  final WebAssembly object graph.
- The final link used `em++`, contained `libxpdf.a` and `wtpdf_` symbols, and
  produced a map. The map, generated JavaScript, and WebAssembly contained no
  `libpplib`, `utilsha`, `sha256_digest`/`sha384_digest`/`sha512_digest`, or old
  `ppdoc_`/`ppdict_`/`pparray_`/`ppstream_`/`ppref_`/`ppxref_` pattern.
- A second independent audit of the mounted evidence artifacts repeated the
  required and forbidden map/byte checks and passed.

## Artifact hashes

These identify the evidence build only. They are not published release hashes.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `wasmtex-luatex.js` | 118949 | `024b509053e338b78f16cc86a59889c34b354fcccb18aa9aa5669921b72bd360` |
| `wasmtex-luatex.worker.js` | 18497 | `c375708d448f22615caa4603b609b11626c0879990c357dfecf8b8cd1ae0924b` |
| `wasmtex-luatex.wasm` | 5649165 | `c6149685e1f489fafedaceeaf6430de6e20c9e0f06c668ae13e22bdcdb350c9a` |
| `wasmtex-luatex.map` | 2150790 | `2674f4e3e91b14c7322921a0a8c95158e33c1d373eef814e14f14023318084ee` |

## Remaining scope

- build and publish complete corresponding source for the exact release bytes;
- publish linked-component notices, LGPL relink material where required, and
  TeX Live/package/font/Lua/format/ICU provenance;
- regenerate an engine-matched LuaLaTeX format and run browser/Node cross-host
  compile tests;
- compare `graphicx`, `pdfpages`, TikZ PDF imports, `pdfe`, and `pdfscanner`
  against the non-distributed legacy reference build;
- complete post-open encrypted-document behavior, exact `pdfe` memory-reporting
  semantics, userdata lifetime tests, malformed-input limits, decoded-output
  limits, and leak/error-path tests.

The tracked release manifest therefore remains `development-only` even though
the `pplib` evidence blocker has been removed for new audited builds.
