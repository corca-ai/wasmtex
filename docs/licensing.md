# Licensing and Release Compliance

WasmTex uses a split licensing model:

- original SDK, UI, LSP, build glue, and documentation: MIT;
- third-party source ports and bundled engine artifacts: their upstream terms;
- TeX Live packages, fonts, Lua files, ICU data, and compiled formats: the terms of
  their individual inputs.

The root [`LICENSE`](../LICENSE) does not relicense anything identified in
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).

## Project goal and license decision

The governing product goal is not to preserve MIT for its own sake. It is to publish
WasmTex, keep an integrating application such as Cortex closed-source, and comply
with every license on both sides of the boundary.

The current Cortex integration imports the SDK's headless compiler, LSP, Monaco
adapter, warmup runtime, SyncTeX types, and other public TypeScript APIs into its
client build. It does not consume the SDK solely through an out-of-process engine
protocol. Based on that concrete coupling, the WasmTex-authored host SDK remains
under MIT: a permissive SDK license lets Cortex keep its original application code
private while the separately delivered engine workers satisfy their own copyleft
terms. MIT is the selected implementation for this boundary, not an immutable
project requirement.

Do not relicense the whole repository under GPL merely because it builds or launches
GPL TeX engines. Doing so while Cortex directly bundles the SDK would work against
the closed-source Cortex goal. A future switch to GPL for host-facing code requires
first changing Cortex to consume only an independent engine protocol, or providing a
separate permissive/commercial license for the host SDK.

This means `package.json` correctly says `MIT` for the installable SDK because its
`files` list excludes `public/` and the engine binaries. A product must not use that
metadata to describe a separately hosted engine directory or TeX Live mirror.

The repository is deliberately multi-license:

| Path or release unit | License treatment |
| --- | --- |
| `src/`, WasmTex-authored documentation and build glue | MIT unless the file says otherwise. |
| `src/synctex/` port | MIT SDK distribution plus the retained upstream SyncTeX permission and non-endorsement notice. |
| `lib/` | Generated form of the corresponding `src/` code; ship the same notices as the source package. |
| Engine Worker/glue/WASM release | The terms of the complete linked engine unit, including GPL and linked-component notices; never described by npm's MIT metadata alone. |
| TeX Live packages, formats, fonts, Lua and ICU data | Each input's own license and release-specific provenance. |
| `LICENSES/` and third-party notices | Preserved license evidence; inclusion does not relicense the covered component. |

The practical engine classification is:

| Runtime | Distribution treatment |
| --- | --- |
| pdfLaTeX | Treat the pdfTeX JavaScript/WASM distribution unit as GPL-2.0-or-later and retain all linked-component notices. The LaTeX format and packages retain LPPL or other input licenses. |
| XeLaTeX | XeTeX changes use the permissive XeTeX notice, while the WTPDF build links Xpdf 4.04 under GPL v2 and/or GPL v3. The pipeline also distributes GPL-2.0-or-later dvipdfmx and other linked libraries. It is not an MIT-only distribution. |
| LuaLaTeX | Treat the LuaHBTeX JavaScript/WASM distribution unit as GPL-2.0-or-later, select a compatible GPL option for linked Xpdf 4.04, and retain the MIT WTPDF/SHA-2 and all linked-component notices. The format, Lua modules, packages, and fonts retain their own licenses. |

The WTPDF/Xpdf XeTeX and LuaHBTeX candidates no longer link `pplib`. The exact
remote build and link-map evidence is recorded in
[`license-evidence/xetex-wtpdf-2c53a86.md`](license-evidence/xetex-wtpdf-2c53a86.md)
and
[`license-evidence/luahbtex-wtpdf-b1888f4.md`](license-evidence/luahbtex-wtpdf-b1888f4.md).
Any older LuaHBTeX or XeTeX artifact that was linked with `pplib` remains uncleared
and must not be substituted into a release. The new candidates are still
development-only until their compatibility and other release gates pass.

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
7. Every linked component has an affirmative, recorded redistribution basis. A
   release containing XeTeX or LuaHBTeX must use the audited WTPDF/Xpdf build and
   reject any legacy `pplib`-linked artifact.

The committed or locally downloaded files under `public/wasmtex/<version>/` are
development inputs, not evidence that the release gate has passed. A public product
must publish a release-specific manifest and source bundle for the exact bytes it
serves.

`scripts/gen-asset-manifest.mjs <version> --release` enforces the recorded status,
and the Pages workflow uses that mode. `scripts/sync-engine-assets.mjs` also refuses
an asset set whose `LICENSE-MANIFEST.json` is not `release-cleared`. These checks are
intentional: changing a label to `release-cleared` without resolving and removing
every recorded blocker would make the metadata false.

`npm run check:licenses` is the source-repository gate. It verifies the SDK/package
license boundary, pinned TeX Live commit, manifest links and blocker consistency,
required notices, and the absence of tracked engine binaries, formats, local
environment files, or a vendored `pplib`. Every engine workflow runs it. When the
GitHub repository is public, those workflows additionally run the strict `--release`
mode before building or uploading an Actions artifact, so a `development-only`
manifest fails closed rather than making uncleared binaries downloadable.

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

For the 2025 package mirror, `scripts/texlive-mirror-2025.json` pins the official
dated `texmf` and `extra` archives plus the extracted `texlive.tlpdb` digest.
`scripts/sync-texlive-s3.sh` delegates selection and manifest generation to
`scripts/gen-texlive-provenance.mjs`; `scripts/check-texlive-provenance.mjs` verifies
the emitted files. Identical-content basename collisions are recorded, while
different-content collisions require an exact-path override and rationale.

The TLPDB `catalogue-license` field is metadata, not a completed legal review.
Production upload requires a reviewed per-package override with exact license and
notice evidence. The generated manifest remains `review-required` while even one
mirrored package lacks that review or a notice path; `provenance-reviewed` means only
that this mirror-specific review is complete, not that the engine release is cleared.
The repository-wide strict license gate is also run immediately before any S3 upload.

## Updating dependencies

When bumping TeX Live, Emscripten, ICU, or a peer dependency:

1. compare the exact upstream license and notice files;
2. update `THIRD_PARTY_NOTICES.md` and `LICENSES/`;
3. regenerate binary and mirror provenance;
4. verify that packaged and deployed outputs contain the legal files; and
5. record any newly linked library rather than assuming it inherits another
   component's license.
