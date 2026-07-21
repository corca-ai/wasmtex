# WTPDF string-syntax evidence (`c9b49a4`)

This record verifies the tracked Xpdf extension that preserves whether a parsed
PDF string used literal or hex syntax. LuaHBTeX's public `pdfe` API exposes that
fact, while unmodified Xpdf 4.04 retains only the decoded bytes. This is adapter
evidence, not LuaHBTeX release clearance.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex commit | `c9b49a48547d0943a14e8bee1482eee3fea8d887` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live Xpdf 4.04 at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build host | `remote-builder`, x86_64 Linux, Docker 24.0.2 |
| Build image | `sha256:382f2077968e6ea337393476a91356106954ae208a074e4478d2b46562822b19` |
| Date | 2026-07-21 UTC |

The exact commit was transferred as a complete Git bundle, verified, and checked
out with a clean worktree. All WebAssembly compilation ran on `remote-builder`.

| Source | SHA-256 |
| --- | --- |
| `texlive-wtpdf.patch` | `4433d07eb545d18e80efc13bf21417352d34c8ab00b2dc89b25c6a1f16927f43` |
| `wtpdf.h` | `eeb3c9c77076aaf0a4470cab5864c2056a6de559295327e4432ea66bf1c9e510` |
| `wtpdf-xpdf.cc` | `8baf6fbb9853ace225729444d20710e1b80762eca24d0ba8417ff520b0925dbb` |
| `wtpdf-smoke.cc` | `bf487858297804bb7181fab6d6a66fa114b63abb14b5cfc937191df2171f8d89` |

## Change and result

The TeX Live patch adds one boolean field to Xpdf `Object`. Literal string
construction retains the false default; the hex-string lexer branch sets it to
true. Xpdf's existing object copy operation copies the field with the rest of
the object. WTPDF exposes only its own `wtpdf_string_syntax` enum and does not
expose the changed Xpdf layout.

The self-generated fixture contains `(A\000B)` and `<410042>`. Both parse to the
same three semantic bytes (`A`, NUL, `B`), but the smoke test requires the first
to report `WTPDF_STRING_LITERAL` and the second `WTPDF_STRING_HEX`.

- the complete patch passed exact `git apply --check` on the clean fixed source;
- the rebuilt native Xpdf archive and WTPDF smoke passed;
- native XeTeX reported Xpdf 4.04 as its PDF backend;
- the rebuilt Xpdf WebAssembly archive and WTPDF smoke passed;
- the final XeTeX map required `libxpdf.a` and contained no forbidden `pplib`
  archive or symbol pattern;
- the final XeTeX module passed `WebAssembly.validate`.

## XeTeX evidence artifact

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `wasmtex-xetex.js` | 107070 | `8a4211441e0d743c585f66fc2472d64a93d26d2eebdc023c45ee1ac46e37fec5` |
| `wasmtex-xetex.worker.js` | 10985 | `e998fa8c7897f30806685899bfd5a46e0075e7dd7c02ba739c330900856a61b6` |
| `wasmtex-xetex.wasm` | 3411369 | `d2181f65b4eab929bc28bcd727d9cb113cbb8eea36afb37968f900cd8e64a7c8` |
| `wasmtex-xetex.map` | 1939813 | `7d0a6fe2a56c033e5540bcddc28554dd3a30883accd8064d47b5a20c5be68dff` |

As in the earlier evidence builds, the upstream-generated vanilla XeTeX link
failed at the expected fontconfig symbols before WasmTex's authoritative relink
added its fontconfig shim and succeeded.

## Remaining scope

The LuaHBTeX serializer and `pdfe` bindings do not consume this enum yet.
Authentication-after-open, resource limits, extended parser corpus, Lua userdata
lifetime, and complete LuaHBTeX caller/link migration remain open.
