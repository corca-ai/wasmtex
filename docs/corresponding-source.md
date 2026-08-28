# Corresponding-source releases

Every browser-distributed engine release must have a source archive bound to the
exact JavaScript, WebAssembly, worker, and format bytes that recipients receive.
This source unit is separate from the MIT host SDK and from any integrating
application.

## Required inputs

The engine asset directory must contain:

- `manifest.json` with its content-derived release ID;
- the matching `LICENSE-MANIFEST.json`;
- every engine artifact; and
- one `BUILD-RECEIPT.<family>.json` for each build family.

Each artifact must be covered by exactly one build receipt and exactly one license
artifact family. A receipt binds its files to the WasmTex Git commit, TeX Live
commit, Emscripten commit, and digest-pinned Docker base. The source builder rejects
stale manifests, missing or overlapping receipts, unclassified files, changed
artifact bytes, and legacy `pplib` markers.

Locally ignored files under `public/wasmtex/<version>/` are development inputs. Do
not use an old directory merely because it contains runnable engines. Assemble the
directory from the exact workflow runs in `scripts/engine-release-components.json`.
That manifest is the promotion boundary: a successful build does not enter a release
until its run ID is reviewed and pinned. Rebuild only families whose owned source or
build inputs changed; reuse the exact artifact and receipt together for every
unaffected family. The assembler rejects any receipt whose immutable TeX Live mirror
differs from the annual mirror pinned beside those run IDs.

## Create and verify an archive

Use a Linux environment with GNU tar for deterministic ownership, ordering, and
timestamps.

```bash
node scripts/build-corresponding-source.mjs \
  --assets /path/to/release-assets/2025 \
  --output-dir /path/to/source-release

node scripts/check-corresponding-source.mjs \
  /path/to/source-release/wasmtex-<release-id>-source.tar.xz \
  /path/to/release-assets/2025/manifest.json
```

The builder may use `--cache`, `--texlive-repository`, and
`--emscripten-repository` to reuse verified local inputs. Otherwise it fetches the
exact recorded Git commits and source archives. Downloaded Emscripten port archives
are checked against the SHA-512 values in
`scripts/corresponding-source-<year>.json`. Each annual config points to its
own immutable `wasm-build/texlive-source-<year>.ref`.

The resulting archive contains:

- a WasmTex source snapshot for every commit named by a build receipt;
- the pinned TeX Live source, excluding the unused and uncleared `libs/pplib` tree;
- WTPDF/Xpdf integration, clean-room SHA-2 code, worker glue, patches, Dockerfiles,
  and build scripts within the WasmTex snapshots;
- Emscripten 3.1.46 source at its exact Git commit;
- exact FreeType, ICU, libpng, and zlib port source archives;
- engine/license manifests and build receipts, but no engine binaries; and
- `SOURCE-MANIFEST.json`, `README.md`, and `REBUILD.md`.

## Release completion

Creating an archive does not by itself clear the release. Before changing
`LICENSE-MANIFEST.json` to `release-cleared`:

1. rebuild every engine from the archive inputs in a clean Linux build environment;
2. compare outputs with the receipt-bound release files and explain any
   nondeterministic difference;
3. run the compatibility, security, LGPL/relink, and notice gates;
4. publish the source archive beside the engine release for the required duration;
5. record its public HTTPS URL and SHA-256 in `correspondingSource`; and
6. rerun `npm run check:licenses -- --release`.

The archive must not contain unrelated integrating-application source. Such source is
not needed to build the separately distributed engine.

## Coherence with the deployed engines

The corresponding source is bound to the distributed binaries by **source
revision**, not by an exact release ID. A release ID is a content hash of the
engine bytes, and the build is reproducible but not bit-identical — the
Emscripten final link permutes XeTeX symbol order between runs of the same
source. So a redeployed engine set can carry a different release ID than the
archive was cut against while still being the same program. `check-corresponding-source.mjs`
therefore requires the archive to bundle exactly the WasmTex source revisions
the distributed build receipts name, and does not require the release IDs to be
equal.

The practical obligation this leaves: **re-cut and republish the archive
whenever any family is rebuilt from a new source revision.** The archive contains
one WasmTex snapshot for every distinct revision named by the composed receipts.
Engine assets change only when their owning `wasm-*` build workflow re-runs, so
this is a per-family release step, not a per-push or whole-engine-set rebuild.
