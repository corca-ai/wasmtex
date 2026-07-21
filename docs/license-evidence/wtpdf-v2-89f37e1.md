# WTPDF v2 object-model evidence (`89f37e1`)

This record covers the first independently named WTPDF object API needed for the
LuaHBTeX migration. It verifies the adapter itself and confirms that adding the
API does not break the already-migrated XeTeX link. LuaHBTeX still uses `pplib`;
this is not release clearance. That statement describes commit `89f37e1`; the later
LuaHBTeX migration is recorded in
[`luahbtex-wtpdf-b1888f4.md`](luahbtex-wtpdf-b1888f4.md).

## Fixed inputs

| Input | Value |
| --- | --- |
| WTPDF commit | `89f37e18a017959d501fbbd061a439556f678204` |
| XeTeX build base | `2c53a8683f1c01c9c13dade3fa8f07de5b81d5f1` |
| TeX Live commit | `143f1723353b20202645f241db429b080a8adcdf` |
| Xpdf | TeX Live Xpdf 4.04 at that commit |
| Emscripten | `emscripten/emsdk:3.1.46` |
| Build host | `remote-builder`, x86_64 Linux, Docker 24.0.2 |
| Date | 2026-07-21 UTC |

The three mounted source files matched the committed files before the build:

| Source | SHA-256 |
| --- | --- |
| `wtpdf.h` | `3edbd65064b036a463574a6a943e40f615334a2124d592d3cc54a5c0dfe6a737` |
| `wtpdf-xpdf.cc` | `fd3cae99aba651b5eeaf2a19fba086f72cee5560f2fdf785f186833fc0cf913b` |
| `wtpdf-smoke.cc` | `21a9fd44e929f3f945316587fd4a0e8fe758c64f05eb065914835cc843bf4c2b` |

All WebAssembly compilation ran on `remote-builder`.

## Exercised contract

The same self-generated classic-xref fixture passed first against the native
Xpdf archive and then as an Emscripten WebAssembly executable. It covered:

- catalog, trailer, info, page reference, and indirect object lookup;
- preserved versus resolved references, including object and generation number;
- distinct null, boolean, integer, real, string, name, array, dictionary, stream,
  and reference kinds;
- an embedded-NUL string and a name containing a decoded `#61` escape;
- array lookup and source-order dictionary iteration;
- stream dictionary access;
- independent raw and decoded readers over an ASCIIHex-filtered stream: raw
  `68656c6c6f>` (11 bytes) versus decoded `hello` (5 bytes);
- reset/close and missing-object error paths;
- copied memory-input ownership and file/memory input-size reporting;
- the existing XeTeX page count, five boxes, fallback, and rotation contract.

The WTPDF WebAssembly smoke printed `WTPDF smoke test passed`. The complete
XeTeX relink then passed its existing Xpdf-required and `pplib`-forbidden map
checks, and the final module passed `WebAssembly.validate`.

## XeTeX evidence artifact

These hashes identify this evidence build only. The changed WTPDF functions are
not called by XeTeX and may be dead-stripped; LuaHBTeX integration will produce a
different linked surface.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `wasmtex-xetex.js` | 107070 | `f8d03b13b64f5b0fa302bff04bab09edbf6438971bb9a929c89e6a871273ec45` |
| `wasmtex-xetex.worker.js` | 10985 | `e998fa8c7897f30806685899bfd5a46e0075e7dd7c02ba739c330900856a61b6` |
| `wasmtex-xetex.wasm` | 3411266 | `271e0a053947fc4334d8b535c9259f93968a25d9957c74a1013c586fc258910f` |
| `wasmtex-xetex.map` | 1939813 | `2b04c785c0dbc786f3639b27de79abd630f0d6af95d2a2b221a1234eba4eed52` |

The upstream-generated vanilla XeTeX link still failed at the expected missing
fontconfig symbols because it does not include WasmTex's fontconfig shim. The
authoritative WasmTex relink immediately following it succeeded; this is the
same fail-loud two-stage behavior recorded for the earlier XeTeX build.

## Remaining scope

ABI v2 does not yet preserve literal-versus-hex string lexical form, allow
authentication after a locked open, impose decoded-output/depth/aggregate-memory
limits, or report a parity-defined allocator metric. Xref streams, object streams,
malformed/encrypted inputs, filtered-stream breadth, and allocation failure paths
need dedicated fixtures. Most importantly, the LuaHBTeX callers and link metadata
had not migrated at this evidence commit. See
[`luahbtex-wtpdf-b1888f4.md`](luahbtex-wtpdf-b1888f4.md) for the later build and
dependency audit.
