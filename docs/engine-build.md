# Engine build guide

For WasmTex maintainers rebuilding engines. Library users should instead
[sync a verified asset set](assets.md). Read the [development setup](develop.md), [optimization policy](engine-optimization-policy.md), [customization inventory](engine-upgrade-customizations.md)
and [annual upgrade procedure](texlive-upgrade.md) before changing build inputs.
Runtime state and resolution are documented in the [engine guide](engine.md).

## Building the Unicode engine from source

> **Build on x86_64 Linux with Docker — not on Apple Silicon** (the amd64
> emscripten toolchain runs under slow qemu emulation there).

> **Keeping this maintainable across upstream releases** — we interpose around
> `texlive-source` (own glue + a linker `--wrap`) and keep necessary source patches as tracked build inputs.
> Each upstream bump requires patch/interface review and requalification. The
> [upstream maintenance guide](texlive-upgrade.md#upstream-maintenance-interpose-dont-patch) explains this convention.

`scripts/build-xetex-fromsource.sh` compiles `wasmtex-xetex.{js,wasm}` from
source (emscripten + the vendored XeTeX engine sources — emscripten's built-in
freetype/icu/libpng ports plus vendored harfbuzz/graphite2/teckit) and links
this project's own JS controller and library glue:

- `wasm-build/xetex-worker.js` is copied verbatim to `wasmtex-xetex.worker.js`;
  it owns the worker protocol and imports the generated `wasmtex-xetex.js` module.
- `wasm-build/xetex-library.js` (`--js-library`) connects the generated module to
  controller functions. Together they implement the
  CDN scheme (the `pdftex/<format>/` layout, extension→format-dir routing, request-
  name save), so no post-build patching of the engine is needed.

The build is verified against the live CDN, including font resolution by name
and by filename (Korean `xeCJK` documents included).

### Shipping it (CI build + deploy)

XeLaTeX is built and deployed in CI as a version-matched artifact:

1. **`.github/workflows/wasm-xetex.yml`** runs `build-xetex-fromsource.sh` in the
   `emscripten/emsdk` Docker image, smoke-tests the result, and uploads a
   `wasm-xetex` artifact (controller/module/WASM sets for XeTeX and dvipdfmx, plus
   the XeTeX format). It runs on
   `workflow_dispatch` or when the XeTeX glue/build scripts change. Seed it once via
   the Actions tab if it has never run.
2. **`ci.yml`** downloads that artifact into `public/wasmtex/<version>/` (next to
   the pdfTeX/BibTeX engines) before the app build, so the GitHub Pages deploy ships
   XeLaTeX by default. The download action uses the exact run IDs in
   `scripts/engine-release-components.json`; a required download failure stops
   assembly. Runtime handling of absent self-hosted assets is a separate concern.

Self-hosting your own assets? Publish a manifest next to the versioned assets, then use
`npm run sync-engine-assets` to fetch and verify the complete set.
Release manifests contain a content-derived release ID and per-engine build receipts;
release mode rejects an engine byte that is not covered by exactly one receipt and
one license artifact family. The deployed set is composable by family: a workflow
rebuild replaces only the artifact and receipt it owns, while CI reuses the explicitly pinned
cleared pair for every unaffected family. Receipt source revisions may therefore
differ; the corresponding-source archive includes every distinct revision. Mirror,
TeX Live source, and toolchain identities remain release-wide coherence constraints.

XeTeX is built **from `texlive-source` against the real `libkpathsea`**, with no
separate engine source tree or kpathsea emulation shim. `wasm-build/Dockerfile.xetex`
runs a two-phase build (native web2c codegen + `libkpathsea`, then emcc) and links
WasmTex's own worker glue + a clean-room fontconfig shim (`xetexfontlist.txt`-backed)
+ the `FT_New_Face` wrap. ICU's converter data — which XeTeX's font manager needs and
emscripten's `-sUSE_ICU` **stubdata** lacks — is fetched from the CDN at runtime and
registered via `udata_setCommonData` (`wasm-build/icu-data-loader.c` +
`scripts/build-icu-data.sh`), not baked into the wasm.

dvipdfmx (XDV→PDF) is built from the same pinned `texlive-source` tree with
`wasm-build/dvipdfm-worker.js`, `xetex-dvipdfm-library.js`, and real `libkpathsea`.
The release path therefore has no externally downloaded engine or worker artifact.

`scripts/sync-texlive-mirror.sh` is a conservative helper for constructing and auditing a
transformed, flattened TeX Live mirror from pinned archives. It verifies archive
hashes, records flattened-name collision decisions, derives an immutable
`mirrorRevision`, and generates exact resource-completion shards under
`catalog/<mirrorRevision>/`. Generation and the pre-upload release gate check class,
package, bibliography, biblatex, and supported font resources against every relevant
file in the final manifest. The same run extracts typed `.cls`/`.sty` declarations
and exact color sets from the selected xcolor `.def` files,
merges the year-pinned WasmTex overrides, and publishes semantic shards plus their
coverage report under `semantic/<mirrorRevision>/`. Both immutable trees upload
before publication of the manifest. A
custom host must expose the matching catalog identity in its compile profile.

When the TeX Live files are already deployed, `scripts/sync-texlive-mirror.sh
--catalog-only` emits only the completion-relevant inventory (`.cls`, `.sty`,
bibliography styles, fonts, and the configured xcolor `.def` inputs), catalogs, and semantic
shards. This lane does not copy or upload TeX Live package bytes and therefore does
not require the full-mirror package-review state. Before `--catalog-only --upload`,
the reconciler streams every selected object from `TEXLIVE_DEPLOYED_URL` and verifies
its byte count and SHA-256. Expected deployment-only removals or hotfixes must match
the year-pinned `texlive-completion-deployment-<year>.json`; unexpected drift fails.
Differing basename collisions still require an exact deployed-byte decision;
unrelated mirror collisions do not block metadata output.

The production TeX Live 2025
CDN is operated separately as a mirror of the full official distribution, so this
helper's package-review state is not part of the engine `LICENSE-MANIFEST.json` and
does not decide whether engine artifacts are release-cleared.

The mirror includes OpenType/TrueType/AFM fonts, the
`tex/{xetex,xelatex,luatex,lualatex}` trees (so engine-specific packages like
`xetexko`, `xeCJK`, and `luatexja` are included), glyph lists, and Lua runtime files.
`scripts/audit-mirror.mjs` reports coverage; `--check` gates a curated common-package
set so per-tree gaps fail loudly. Publish changed package inventories, bloom data and catalogs under a new
immutable snapshot identity; do not overwrite a published prefix or use cache
invalidation as a snapshot upgrade. Follow [mirror operations](texlive-mirror-operations.md).

## Building LuaLaTeX (LuaHBTeX) from source

LuaLaTeX runs end-to-end: detection routes to `WasmTexLuatexEngine`, the `.lua`
runtime (luaotfload, lualibs) is mirrored under format 51, and the engine is
built from source.

> **Font resolution by name.** luaotfload normally builds its font-names database by
> scanning font directories — impossible in the on-demand WASM model (kpse resolves
> *requests*, it can't list dirs). So we ship a **prebuilt, engine-version-matched
> `luaotfload-names.lua`** on the CDN (the LuaLaTeX analog of XeLaTeX's
> `xetexfontlist.txt`). `scripts/gen-luaotfload-names.mjs` generates it with a real
> luaotfload (luaotfload 3.29 → DB schema version 6, matching the engine); the worker
> drops it into luaotfload's cache path (`TEXMFVAR/luatex-cache/generic/names/`) once
> per worker session. Mirror fonts are recorded as `location = "texmf"`, so a by-name hit
> (`\setmainfont{Latin Modern Roman}` → family `latinmodernroman` → `lmroman10-regular.otf`)
> resolves via `kpse.find_file` → the CDN hook → dir 47. By-filename
> (`{lmroman10-regular.otf}` / `{lmroman10-regular}`) also still works.
>
> Notes: we ship the **plain `.lua`**, not the compiled `.luc` — Lua bytecode bakes in
> pointer/int widths and isn't portable from the x86_64 generator to the wasm32 engine.
> The DB is version-coupled to the engine's luaotfload; bump `EXPECTED_*` in the
> generator (and regenerate) when `wasm-build/texlive-source-<year>.ref` is bumped.
>
> The DB is generated against **exactly** the mirror's fonts (`--fonts-dir`):
> the generator wipes the image's texmf fonts and `/usr/share/fonts` (urw-base35 etc.,
> which luaotfload finds via fontconfig) and scans only the mirror set, so the DB has
> zero **dangling** entries (names that resolve in the DB but 404 on the CDN) and zero
> **uncovered** mirror fonts. Regenerate it whenever the mirror's fonts change.

LuaHBTeX (the LuaTeX variant `lualatex` uses, with HarfBuzz shaping) is a
from-`texlive-source` port, structured like the pdfTeX build and
split into the same two phases:

1. **`wasm-build/Dockerfile.luatex`** — Phase 1 (native, cached in the image):
   `configure --enable-luahbtex` + native `make`. This translates LuaTeX's CWEB/WEB
   (`.w`) sources to C via web2c **and** builds the native codegen tools
   (`ctangle`/`tangle`/`web2c`). Both are reused in Phase 2, because those tools can't
   run once compiled to wasm (the classic two-phase problem).
2. **`wasm-build/build-luatex.sh`** — Phase 2 (`docker run`): cross-compile the source
   graph with emscripten — `lua53`/`harfbuzz`/`graphite2`/`Xpdf`/`zziplib`/`kpathsea`
   from TeX Live's bundled sources — reusing the native-generated C + tools, then
   relink with this repo's own controller and glue: `luatex-worker.js`,
   `luatex-library.js` (`--js-library`), `luatex-entry.c` (the `compileLaTeX`/
   `compileFormat`/`setMainEntry` shim) and `kpse-hook.c` (`-Wl,--wrap=kpse_find_file`
   for the CDN HTTP fallback). The independently named WTPDF adapter connects
   LuaHBTeX's PDF inclusion, `pdfe`, and `pdfscanner` callers to Xpdf; the build
   rejects `pplib` and its legacy SHA helper symbols in the link map and release
   bytes. The source build uses a 32 MiB stack and 128 MiB initial memory with
   automatic growth. The qualified release uses these memory settings and
   `-O3 -flto`; see [adopted performance changes](compile-performance.md).

The build is **validated end-to-end**: it produces the `lualatex` format and compiles
a real document (with math and CDN font fetch) to a valid PDF.

`scripts/build-luatex-fromsource.sh` drives both phases locally (x86_64 Linux +
Docker). **`.github/workflows/wasm-luatex.yml`** runs them in CI — it is
triggered by `workflow_dispatch` and pushes to `main` that change the paths
listed in the workflow (LuaTeX build/glue and shared inputs). Phase 1 is cached. It smoke-tests the output (valid wasm, own glue, no AGPL
markers) and uploads a `wasm-luatex` artifact, which `ci.yml` downloads into
`public/wasmtex/<version>/` the same way it downloads XeLaTeX. A required artifact download failure stops CI assembly. An integrator omitting
the engine gets an engine-unavailable result at runtime.

## Checkpoint engine build (`wasmtex-pdftex-checkpoint.*`)

The pdfTeX release ships twice: the plain build, and the same sources linked with
Binaryen's Asyncify (`PDFTEX_CHECKPOINT_FLAGS` in `wasm-build/Makefile`: `-sASYNCIFY=1`
with `fd_read` as the only import allowed to unwind, 1 MiB Asyncify stack). The worker
controller is shared; loading it with `?engine=checkpoint` selects the Asyncify binary.
On it the worker can suspend TeX inside a read of the main file, keep the unwound state
as a **heap checkpoint** (a sparse copy of wasm memory plus MEMFS files and streams) and
resume it any number of times with an edited tail — see the [API notes on heap checkpoints](compiler-api.md#heap-checkpoints-arbitrary-line-incremental-compilation).
Asyncify adds code and execution overhead; measure the selected release rather
than assuming a fixed percentage. The headless compiler loads this build only with `incremental: true` in a browser; Node hosts and the
format extraction use the plain build. Both builds share `wasmtex-pdftex.fmt`.
