# Licensing and Release Compliance

WasmTex uses a split licensing model:

- original SDK, UI, LSP, build glue, and documentation: MIT;
- third-party source ports and bundled engine artifacts: their upstream terms;
- TeX Live packages, fonts, Lua files, ICU data, and compiled formats: the terms of
  their individual inputs.

The root [`LICENSE`](../LICENSE) does not relicense anything identified in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## License decision

The WasmTex-authored SDK remains under MIT. Do not relicense the whole repository
under GPL merely because it builds or launches GPL TeX engines. MIT is compatible
with the engine licenses and permits an integrator to keep its own application
closed-source. The separately distributed engine artifacts still carry their
upstream copyleft and notice obligations.

This means `package.json` correctly says `MIT` for the installable SDK because its
`files` list excludes `public/` and the engine binaries. A product must not use that
metadata to describe a separately hosted engine directory or TeX Live mirror.

The practical engine classification is:

| Runtime | Distribution treatment |
| --- | --- |
| pdfLaTeX | Treat the pdfTeX JavaScript/WASM distribution unit as GPL-2.0-or-later and retain all linked-component notices. The LaTeX format and packages retain LPPL or other input licenses. |
| XeLaTeX | XeTeX changes use the permissive XeTeX notice, but the pipeline also distributes GPL-2.0-or-later dvipdfmx and a mixed set of linked libraries. It is not an MIT-only distribution. |
| LuaLaTeX | Treat the LuaHBTeX JavaScript/WASM distribution unit as GPL-2.0-or-later and retain all linked-component notices. The format, Lua modules, packages, and fonts retain their own licenses. |

The current XeTeX and LuaHBTeX builds statically link `pplib`. Its public source
copy does not provide a standalone license grant that this project can reproduce,
so those two browser artifacts are not release-cleared until the evidence issue in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md#unresolved-pplib-licensing-evidence)
is resolved.

For the boundary that lets a commercial or otherwise closed-source application use
WasmTex, see [Proprietary integration](proprietary-integration.md).

## Distribution surfaces

| Surface | Required legal material |
| --- | --- |
| Source repository | `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `LICENSES/`. |
| npm/GitHub package | The same files, including the full SyncTeX notice. Peer notices are needed only when the peer code is copied into the package. |
| Standalone demo | The same files, plus notices for bundled Monaco Editor, PDF.js, and pdf-lib when present. |
| Engine asset host | Per-version notices and complete corresponding source for every distributed binary, including WasmTex glue and build scripts. |
| TeX Live/ICU mirror | Per-file/package provenance, exact license notices, corresponding source where required, and the ICU 68.2 license bundle. |

Serving JavaScript, WebAssembly, formats, packages, fonts, or data to a browser is a
distribution of those files. Running the same engine only on infrastructure operated
by the service provider is not a browser distribution; distributing an on-premises
image or appliance is distribution again.

## Engine release gate

Do not publish a versioned engine directory until all of the following are true:

1. Its manifest identifies the TeX Live commit, Emscripten version, component name,
   license expression or reference, notice path, corresponding-source location, and
   hashes for both binary and source artifacts.
2. The corresponding-source archive contains the pinned TeX Live source, WasmTex
   worker/glue source, Dockerfiles, build scripts, and all local modifications used to
   produce the binary.
3. GPL-covered binaries are distributed with source in the same place or through
   another GPL-2.0-compliant method. Do not rely solely on a third-party upstream URL.
4. A statically linked LGPL component is handled under a valid chosen option, including
   relinkable material where LGPL section 6 requires it.
5. The makeindex executable is accompanied by `LICENSES/MakeIndex.txt` and a
   conspicuous, working source-obtainment statement.
6. Generated Emscripten JavaScript retains its license output, and the complete
   third-party notice set accompanies the release.
7. Every linked component has an affirmative, recorded redistribution basis. In
   particular, a release containing XeTeX or LuaHBTeX must resolve the current
   `pplib` evidence blocker.

The committed or locally downloaded files under `public/wasmtex/<version>/` are
development inputs, not evidence that the release gate has passed. A public product
must publish a release-specific manifest and source bundle for the exact bytes it
serves.

`scripts/gen-asset-manifest.mjs <version> --release` enforces the recorded status,
and the Pages workflow uses that mode. `scripts/sync-engine-assets.mjs` also refuses
an asset set whose `LICENSE-MANIFEST.json` is not `release-cleared`. These checks are
intentional: changing a label to `release-cleared` without resolving and removing
every recorded blocker would make the metadata false.

## TeX Live mirror gate

The current mirror layout uses flattened basenames for kpathsea lookup. Flattening
must not be the only record of the source files. Before upload, generate and retain a
provenance manifest containing at least:

- mirrored key and SHA-256;
- original `texmf-dist` path and TeX Live package;
- TeX Live release/year;
- license identifier or a stable license reference;
- copyright/notice file paths;
- corresponding source archive or source path;
- collision decision when multiple source paths share a basename.

Fonts and generated formats require the same provenance treatment. A generic TeX Live
notice is not a replacement for package-specific terms.

## Updating dependencies

When bumping TeX Live, Emscripten, ICU, or a peer dependency:

1. compare the exact upstream license and notice files;
2. update `THIRD_PARTY_NOTICES.md` and `LICENSES/`;
3. regenerate binary and mirror provenance;
4. verify that packaged and deployed outputs contain the legal files; and
5. record any newly linked library rather than assuming it inherits another
   component's license.
