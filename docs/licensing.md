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
| TeX Live packages, fonts and Lua files | Their upstream terms as part of the separately operated full TeX Live distribution. Generated engine formats and ICU data remain part of the exact engine-release audit. |
| `LICENSES/` and third-party notices | Preserved license evidence; inclusion does not relicense the covered component. |

The practical engine classification is:

| Runtime | Distribution treatment |
| --- | --- |
| pdfLaTeX | Distribute this exact pdfTeX JavaScript/WASM unit as GPL-2.0-only. pdfTeX permits later versions, but linked Xpdf 4.04 is selected under GPLv2 only. Retain all linked-component notices. |
| XeLaTeX | Distribute this exact XeTeX JavaScript/WASM unit as GPL-2.0-only plus the XeTeX notice. Xpdf 4.04 and FreeType are both selected under GPLv2; the alternative FreeType License is not used for this combined unit. dvipdfmx remains GPL-2.0-or-later. |
| LuaLaTeX | Distribute this exact LuaHBTeX JavaScript/WASM unit as GPL-2.0-only because linked Xpdf 4.04 is selected under GPLv2. Retain the MIT WTPDF/SHA-2 and all embedded-library notices. |

The selections above are release-specific and are enforced by
[`scripts/engine-components-2025.json`](../scripts/engine-components-2025.json).
Changing Xpdf or FreeType to a different alternative requires a new link audit and
new receipts; changing only the prose is not sufficient.

The WTPDF/Xpdf XeTeX and LuaHBTeX candidates no longer link `pplib`. The exact
remote build and link-map evidence is recorded in
[`license-evidence/xetex-wtpdf-23f2ce1.md`](license-evidence/xetex-wtpdf-23f2ce1.md)
and
[`license-evidence/luahbtex-wtpdf-666663b.md`](license-evidence/luahbtex-wtpdf-666663b.md).
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
| Full TeX Live mirror | Retain the official distribution's copying and package license material. It is operated separately from the engine release gate described here. |
| ICU data | Retain the ICU 68.2 license bundle and exact source/version evidence. |

Serving JavaScript, WebAssembly, formats, packages, fonts, or data to a browser is a
distribution of those files. Running the same engine only on infrastructure operated
by the service provider is not a browser distribution; distributing an on-premises
image or appliance is distribution again.

## Engine release gate

Do not publish a versioned engine directory until all of the following are true:

1. Its manifest identifies the TeX Live commit, Emscripten version, component name,
   license expression or reference, notice path, corresponding-source location, and
   hashes for both binary and source artifacts.
   Every engine artifact set also carries a `BUILD-RECEIPT.<family>.json` that binds
   its exact bytes to the WasmTex Git commit, TeX Live commit, Emscripten commit, and
   digest-pinned build image. The final asset manifest rejects missing, overlapping,
   stale, or unclassified receipt coverage in release mode.
2. The corresponding-source archive contains the pinned TeX Live source, WasmTex
   worker/glue source, Dockerfiles, build scripts, and all local modifications used to
   produce the binary.
3. GPL-covered binaries are distributed with source in the same place or through
   another GPL-2.0-compliant method. Do not rely solely on a third-party upstream URL.
4. Statically linked kpathsea, Graphite2, TECkit, and zziplib keep their selected LGPL
   terms. The complete-source archive contains the exact engine and library source,
   local changes, build scripts, and `RELINK.md`, so a recipient can replace a library
   with a modified version and rebuild/relink the executable. WasmTex does not claim
   that static linking erases the LGPL terms.
5. The makeindex executable is accompanied by `LICENSES/MakeIndex.txt` and a
   conspicuous, working source-obtainment statement.
6. Generated Emscripten JavaScript retains its license output, and the complete
   third-party notice set accompanies the release.
7. Every linked component has an affirmative, recorded redistribution basis. A
   release containing XeTeX or LuaHBTeX must use the audited WTPDF/Xpdf build and
   reject any legacy `pplib`-linked artifact.
8. `node scripts/check-engine-license-inventory.mjs 2025` covers every archive in the
   release link maps exactly once and rejects missing notice files or an LGPL entry
   without its relink method.

The committed or locally downloaded files under `public/wasmtex/<version>/` are
development inputs, not evidence that the release gate has passed. A public product
must publish a release-specific manifest and source bundle for the exact bytes it
serves.

The Emscripten base is pinned by registry digest, not only by the mutable `3.1.46`
tag. `scripts/corresponding-source-2025.json` also pins the Emscripten Git commit and
the exact FreeType, ICU, libpng, and zlib port source archives and hashes. Changing
any Dockerfile to a different base makes `npm run check:licenses` fail.

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

## TeX Live CDN scope

The production TeX Live 2025 CDN is treated as a separately operated mirror of the
full official distribution. Its package-by-package manual review, per-file provenance
overrides, and CDN object comparison are not prerequisites for clearing a WasmTex
engine release. Keep the official TeX Live copying information and the license/source
material shipped with that distribution.

The provenance scripts in this repository remain useful integrity and collision-audit
tools for a transformed or flattened mirror, but their `provenance-reviewed` state is
not part of `LICENSE-MANIFEST.json` and does not determine whether engine artifacts
are `release-cleared`. If a future deployment selects, modifies, or repackages TeX
Live files instead of mirroring the full distribution, review that distribution as a
separate project before publishing it.

This scope decision does not remove TeX Live source used to compile the engines from
the complete corresponding source. It also does not remove generated `.fmt` inputs or
ICU 68.2 data from the exact engine-release inventory.

## Updating dependencies

When bumping TeX Live, Emscripten, ICU, or a peer dependency:

1. compare the exact upstream license and notice files;
2. update `THIRD_PARTY_NOTICES.md` and `LICENSES/`;
3. regenerate engine build receipts, formats, and corresponding-source metadata;
4. verify that packaged and deployed outputs contain the legal files; and
5. record any newly linked library rather than assuming it inherits another
   component's license.
