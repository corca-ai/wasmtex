# Corresponding-source releases

Every browser-distributed engine release must have a source archive bound to the
exact JavaScript, WebAssembly, worker, and format bytes that recipients receive.
This source unit is separate from the MIT host SDK and from a proprietary
integrator such as Cortex.

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
not use an old directory merely because it contains runnable engines: regenerate all
release artifacts and receipts with the release workflows first.

## Create and verify an archive

Use a Linux host with GNU tar for deterministic ownership, ordering, and timestamps.
Archive creation itself does not compile WebAssembly, but all later WebAssembly
rebuilds for this project must run through `ssh remote-builder`.

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
`scripts/corresponding-source-2025.json`.

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

1. rebuild every engine from the archive inputs on a clean `remote-builder` builder;
2. compare outputs with the receipt-bound release files and explain any
   nondeterministic difference;
3. run the compatibility, security, LGPL/relink, notice, and TeX Live provenance
   gates;
4. publish the source archive beside the engine release for the required duration;
5. record its public HTTPS URL and SHA-256 in `correspondingSource`; and
6. rerun `npm run check:licenses -- --release`.

The archive must not contain Cortex authentication, collaboration, billing, storage,
AI, product UI, or other proprietary application source. Those components are not
needed to build the separately distributed engine.
