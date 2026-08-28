# WASM Engine & TeX Live

This document details the LaTeX/BibTeX engine internals and the on-demand package system.

Production package bytes are served from immutable Cloudflare R2 prefixes at
`texlive.corca.ai`; [TeX Live mirror operations](texlive-mirror-operations.md)
documents publication and recovery.

## Engine Setup

The runtime needs each engine's authored controller (`*.worker.js`), generated
Emscripten module (`*.js`), WASM binary (`*.wasm`), optional helper files, and prebuilt
`.fmt`/`.fmt.gz` — under `public/wasmtex/<version>/`. They are built from source;
the repository may carry a baseline development set, while CI rebuilds/supplements
it with version-matched artifacts. The npm package exports only `lib/`, so consumers
must host the engine assets separately. There are two ways to get them:

### Consuming the library: sync a verified set (recommended)

Pull the exact assets a deployed site serves — every file hash-verified against
its published `manifest.json`:

```bash
npm run sync-engine-assets -- --from https://corca-ai.github.io/wasmtex/
```

This is the supported self-hosting path; see
[Self-hosting the engine assets](#self-hosting-the-engine-assets-manifest--sync)
for options and why the manifest is authoritative.

### Contributing: stage a local build

Build the engines from the pinned TeX Live source, then copy the resulting controller,
module, WASM, helper, and format files into `public/wasmtex/<version>/`. There is no
external prebuilt fallback: missing local assets fail loudly instead of silently mixing
engine versions or licenses.

To rebuild the engine from source (requires Docker), the pipeline lives in
`wasm-build/` (`Dockerfile`, `Makefile`, `build.sh`) and emits into
`wasm-build/dist/`; copy the outputs into the versioned public directory. The
[upgrade guide's Step 2](texlive-upgrade.md#step-2-build-new-wasm-engine) documents the full flow.

### Third-party boundary

WasmTex does not ship an externally-built engine controller or a borrowed
opaque upstream prebuilt engine bundle. The boundary is explicit:

- `wasm-build/*-worker.js`, `*-library.js`, and the C entry/interposition files are
  maintained here. Emscripten generates a separate `wasmtex-<engine>.js` core and
  `.wasm` binary from the pinned TeX Live source.
- TeX Live supplies pdfTeX, BibTeX/BibTeX8, makeindex, XeTeX, dvipdfmx, LuaHBTeX,
  kpathsea, and the libraries bundled with those engines. Emscripten 3.1.46 is the
  pinned compiler and supplies selected ports such as FreeType and ICU.
- XeTeX fetches `icudt68l.dat`, built from Unicode ICU 68.2 by
  `scripts/build-icu-data.sh`, from the versioned TeX Live mirror. TeX packages,
  fonts, and Lua runtime files also come from that mirror on demand.
- `src/synctex/synctex-parser.ts` is a TypeScript port of the reference SyncTeX
  algorithms; its upstream notice is retained in `LICENSES/SyncTeX.txt` and shipped
  with the package through `THIRD_PARTY_NOTICES.md`.
- Monaco Editor and PDF.js are host-provided peer dependencies. `pdf-lib` is an
  optional peer used only for incremental PDF splicing. None of these three is
  copied into `lib/`.

This separation keeps the authored protocol reviewable, makes generated artifacts
reproducible, and leaves each external component replaceable behind its existing
boundary.

## Multi-engine support (XeLaTeX / LuaLaTeX)

Many documents — anything using `fontspec`, `unicode-math`, system/OpenType fonts,
or CJK (`xeCJK`, `xetexko`, `luatexja`) — require **XeLaTeX** or **LuaLaTeX**, not
pdfTeX. WasmTex selects the engine automatically.

### Detection & routing

`src/engine/engine-select.ts` decides the engine from the **main file**:

1. A `% !TEX program = xelatex` / `%!TEX TS-program = lualatex` magic comment (wins).
2. Preamble heuristics: `\directlua` or a lua-only package → LuaLaTeX; `xeCJK`/
   `xetexko` → XeLaTeX; `fontspec`/`unicode-math`/`polyglossia`/`\setmainfont` →
   XeLaTeX. Comments are stripped so a commented-out `\usepackage{fontspec}` does
   not trigger a switch.
3. Otherwise pdfLaTeX.

Override with the `engine` option (`'auto'` | `'pdflatex'` | `'xelatex'` | `'lualatex'`):

```ts
new WasmTex('#editor', '#preview', { engine: 'auto' })      // default
new WasmTexCompiler({ engine: 'xelatex' })                   // force
```

`src/engine/compile-engine.ts` maps the detected engine to a concrete
`CompileEngine`: pdfLaTeX uses `wasmtex-pdftex`; **XeLaTeX** uses
`src/engine/xetex-engine.ts` (`WasmTexXetexEngine`), a two-worker pipeline —
XeTeX emits XDV, which dvipdfmx turns into a PDF:

```
wasmtex-xetex   (compilelatex) :  main.tex -> main.xdv
wasmtex-dvipdfm (compilepdf)   :  main.xdv -> main.pdf   (embeds fonts)
```

It preloads a prebuilt `wasmtex-xetex.fmt` and re-injects it before each run
(falling back to building it once via `compileformat` if the asset is absent) —
see *Prebuilt format* below. **LuaLaTeX** uses
`src/engine/luatex-engine.ts` (`WasmTexLuatexEngine`): LuaTeX writes PDF
directly, so it is a single `wasmtex-luatex` worker — no XDV, no dvipdfmx stage.
Both share `src/engine/tex-fmt-engine.ts` (the format-management + file-management
base). The LuaLaTeX WASM is built from source (see below) and verified end-to-end
(builds the `lualatex` format and compiles a real document, with CDN font fetch, to
a PDF); when the artifact is absent, routing to it degrades gracefully.

**Prebuilt format (cold-start fast path).** Building a format from scratch
dominates a cold first compile (~10–13 s plus hundreds of sync CDN fetches), so
CI extracts each format once (`scripts/extract-luatex-format.mjs` /
`extract-xetex-format.mjs` run the freshly built engine's `-ini` and capture the
bytes) and ships it next to the engine. At init the engine fetches it **in
parallel with the worker boot** into `fmtBytes`, so the first compile re-injects
the format and typesets directly — no `compileformat`. With the prebuilt format
a cold XeLaTeX first PDF lands in ~2 s.

The `.fmt` is engine-binary-specific, so each engine's workflow regenerates it with
every build; if it is missing the engine falls back to building the format (a junk
200 response, e.g. a dev-server SPA fallback, is rejected so the fallback still
triggers). Unicode formats ship **gzipped** (`wasmtex-xetex.fmt.gz` ~3.6 MB from ~5.6 MB;
`wasmtex-luatex.fmt.gz` ~3.3 MB from ~5.8 MB) and the engine decompresses them
in-browser (`DecompressionStream`), tolerating either a raw `.gz` or one the server
already decoded via `Content-Encoding`.

**Project input recording.** pdfTeX, XeTeX, and LuaHBTeX run their LaTeX pass with
`-recorder` and return every `.fls` `INPUT`, without filtering by extension. The
headless orchestrator intersects those paths with its project VFS and combines the
result with bibliography/index requests to produce
`telemetry.dependencyManifest`. pdfTeX also records the preamble-format build and
unions those inputs when a snapshot is reused; otherwise a snapshot could hide
project files loaded by the preamble. Writing one of those recorded project files
invalidates the cached snapshot, while body-only/unrelated writes keep the fast path.
XeTeX's separate dvipdfmx stage still lacks
an equivalent authoritative input signal, so XeLaTeX manifests remain explicitly
incomplete even when its TeX-stage recorder succeeded.

**Bloom filter + built-in warmup.** The other cold-start cost is the worker
fetching its runtime (luaotfload/lualibs `.lua`, fonts) synchronously, one file
at a time, plus wasted lookups for files that don't exist. Two mechanisms
(mirroring pdfTeX) remove it: the worker loads the CDN **bloom filter**
(`loadbloom`) and skips the sync XHR for any file it says is absent; and the
engine **prefetches** the known first-compile file set in parallel (overlapping
worker boot) and injects it via `preloadtexlive`, so the worker finds everything
locally and never blocks. The file set is `src/engine/luatex-manifest.ts`,
generated by `scripts/gen-luatex-manifest.mjs` from an instrumented compile
(regenerate when the runtime changes). The sends are fire-and-forget, so a
worker without these commands simply ignores them and fetches on demand.

**Persistent cache (return visits).** With `persistentCache: true` the Unicode
engines also use the durable IndexedDB cache (see [Persistent cache](#persistent-cache)):
the worker exposes `dumpcache`, and after a successful compile the engine persists
every fetched file (keyed by TeX Live year). On the next visit the engine rehydrates
that set and injects it instead of prefetching from the CDN, so a return visit does
~zero network and works offline. `clearCache()` / `clearTexliveCache()` drop it.

**Recompile (edit) latency.** Within a session, body edits recompile in
~0.4–0.5 s: the prebuilt format is injected into the work dir only once (it
persists in MEMFS across recompiles), and the remaining cost is genuine preamble
re-execution (notably luaotfload's reload for fontspec docs) plus typesetting.
LuaLaTeX does not use pdfTeX-style **preamble snapshots**: luaotfload's Lua
state is hostile to `\dump`-based precompilation, so precompiling the preamble
would need a careful worker port with graceful fallback.

When a Unicode engine's WASM artifact is **absent**, routing a document to it fails
to init and returns an **actionable** result — `this document requires XeLaTeX (…)` —
instead of a cryptic pdfTeX error (the harness classifies these as
`needs-xelatex-lualatex`). When the artifact is **present**, the same routing
compiles the document for real, no code change.

### Building the Unicode engine from source

> **Build on x86_64 Linux with Docker — not on Apple Silicon** (the amd64
> emscripten toolchain runs under slow qemu emulation there).

> **Keeping this maintainable across upstream releases** — we interpose around
> `texlive-source` (own glue + a linker `--wrap`) rather than fork/patch it, so a
> version bump is a rebuild, not a re-patch. The
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

#### Shipping it (CI build + deploy)

XeLaTeX is built and deployed in CI as a version-matched artifact:

1. **`.github/workflows/wasm-xetex.yml`** runs `build-xetex-fromsource.sh` in the
   `emscripten/emsdk` Docker image, smoke-tests the result, and uploads a
   `wasm-xetex` artifact (controller/module/WASM sets for XeTeX and dvipdfmx, plus
   the XeTeX format). It runs on
   `workflow_dispatch` or when the XeTeX glue/build scripts change. Seed it once via
   the Actions tab if it has never run.
2. **`ci.yml`** downloads that artifact into `public/wasmtex/<version>/` (next to
   the pdfTeX/BibTeX engines) before the app build, so the GitHub Pages deploy ships
   XeLaTeX by default. If the artifact is missing, the build still succeeds and
   XeLaTeX falls back to the actionable "engine unavailable" result.

Self-hosting your own assets? Publish a manifest next to the versioned assets, then use
`npm run sync-engine-assets` to fetch and verify the complete set.
Release manifests contain a content-derived release ID and per-engine build receipts;
release mode rejects an engine byte that is not covered by exactly one receipt and
one license artifact family.

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
set so per-tree gaps fail loudly. After the CDN changes, regenerate the bloom
filter (`gen-bloom-filter.mjs --upload`) and invalidate the CDN, or the engine will
skip the new files.

### Building LuaLaTeX (LuaHBTeX) from source

LuaLaTeX runs end-to-end: detection routes to `WasmTexLuatexEngine`, the `.lua`
runtime (luaotfload, lualibs) is mirrored under format 51, and the engine is
built from source.

> **Font resolution by name.** luaotfload normally builds its font-names database by
> scanning font directories — impossible in the on-demand WASM model (kpse resolves
> *requests*, it can't list dirs). So we ship a **prebuilt, engine-version-matched
> `luaotfload-names.lua`** on the CDN (the LuaLaTeX analog of XeLaTeX's
> `xetexfontlist.txt`). `scripts/gen-luaotfload-names.mjs` generates it with a real
> luaotfload (luaotfload 3.29 → DB schema version 6, matching the engine); the worker
> drops it into luaotfload's cache path (`TEXMFVAR/luatex-cache/generic/names/`) before
> each compile. Mirror fonts are recorded as `location = "texmf"`, so a by-name hit
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
   bytes. A 32 MB stack and 768 MB initial memory accommodate LuaTeX + the Lua
   interpreter.

The build is **validated end-to-end**: it produces the `lualatex` format and compiles
a real document (with math and CDN font fetch) to a valid PDF.

`scripts/build-luatex-fromsource.sh` drives both phases locally (x86_64 Linux +
Docker). **`.github/workflows/wasm-luatex.yml`** runs them in CI — it is
**`workflow_dispatch`-only** because Phase 1 is heavy (seed it once via the Actions
tab; reruns are cached). It smoke-tests the output (valid wasm, own glue, no AGPL
markers) and uploads a `wasm-luatex` artifact, which `ci.yml` downloads into
`public/wasmtex/<version>/` the same way it downloads XeLaTeX. When the artifact
is absent, LuaLaTeX degrades gracefully.

### Font-by-name (`xetexfontlist.txt`)

`scripts/gen-xetexfontlist.mjs` builds the font database XeTeX's font manager reads
to resolve fonts **by name** (`\setmainfont{Latin Modern Roman}`,
`\setCJKmainfont{Harano Aji Gothic}`), scanning the mirrored OTF/TTF/Type1 fonts
with `fc-scan` and emitting the record format `XeTeXFontMgr_FC.cpp` parses. Deployed
to `…/2025/pdftex/26/xetexfontlist.txt`. The worker is patched to route each font
fetch to the right format dir by extension (XeTeX's `createFont` always resolves with
`kpse_truetype_format`, but our OTF live under 47, Type1 under 32).

> **Two subtleties (both handled):**
> 1. **The record format has FIVE trailing numeric fields, not four.** The current
>    `XeTeXFontMgr_FC.cpp` path reads `opSizeInfo.subFamilyID` **twice** (an upstream
>    copy-paste bug). With only four, the C++ `>>` parser desyncs after the *first*
>    record and silently loads nothing. The generator emits the 5th field to match.
> 2. **Extension→format-dir routing** (above) is required so the matched OTF
>    actually loads.
>
> **Verified:** `\setmainfont{Latin Modern Roman}` and a Korean
> `\setCJKmainfont{Harano Aji Gothic}` document each compile to a PDF by name
> against the live CDN.

## Runtime completion observation

The pdfTeX build exports an authored, read-only post-pass hook. After the normal TeX
process has finished, it scans the in-memory control-sequence hash and documented LaTeX
registry names for public commands, environments, counters, colors, and key families.
It also reuses the existing recorder input list. The worker returns this data separately;
it does not alter TeX state, outputs, logs, or rerun decisions, and completion never calls
the hook directly.

Both engine and TypeScript boundaries are bounded. Names containing protocol control
characters or exceeding the name limit are ignored; commands and each registry category
have record ceilings; dropped counts make affected snapshot fields incomplete; and the
retained serialized snapshot is capped at 2 MiB. Older pdfTeX assets that lack completeness
metadata are accepted only as unproven coverage. XeTeX/LuaTeX currently expose the same
snapshot schema but mark command and registry observations unsupported. Rebuild and deploy
the pdfTeX controller/module/WASM set together before relying on this capability.

## TeX Live & R2

Packages are fetched via synchronous XHR inside the WASM worker.

- **Mirror**: Immutable snapshots are served from Cloudflare R2 through `texlive.corca.ai`; no configuration is needed for basic usage.
- **Structure**: Files are organized by mirror revision, TeX Live version, and format IDs (for example, `snapshots/<revision>/2025/pdftex/26/` for `.sty` files).
- **Bloom Filter**: A ~180 KB bloom filter (`bloom-filter.bin`) is fetched at startup and loaded into the worker. It allows the worker to skip sync XHR for files that definitely do not exist on the mirror. Regenerate with `node scripts/gen-bloom-filter.mjs`.
- **Caching**: A Service Worker (`public/sw.js`) caches these files locally to enable offline compilation and speed up subsequent runs.

### URL Resolution Order
The `texliveUrl` is determined as follows:
1. `options.texliveUrl` passed to the constructor.
2. `VITE_TEXLIVE_URL` environment variable.
3. The immutable R2 snapshot pinned for that TeX Live year.

The default R2 mirror works out of the box. An explicit URL should likewise name
an immutable snapshot rather than mutable discovery metadata.

## Asset Resolution (WASM & Workers)

The editor requires several heavy assets to function:
- `wasmtex-pdftex.worker.js` / `wasmtex-pdftex.js` / `wasmtex-pdftex.wasm`
- `wasmtex-bibtex.worker.js` / `wasmtex-bibtex.js` / `wasmtex-bibtex.wasm`
- corresponding controller/module/WASM sets for XeTeX + dvipdfmx and LuaTeX
  (optional — absence degrades to an actionable engine-unavailable result)
- `sw.js` (Service Worker)

**Automatic Resolution (Recommended)**:
By default, the editor automatically attempts to find these assets. It checks:
1. Your build tool's base URL (e.g., Vite's `import.meta.env.BASE_URL`).
2. The location where the library script itself is hosted (`import.meta.url`).

In most modern setups (Vite, Webpack 5), **you don't need to set `assetBaseUrl` manually** as long as the assets are in your public directory.

**Manual Configuration**:
If you host assets on a specific CDN or a non-standard path, provide the `assetBaseUrl`:
```typescript
const editor = new WasmTex(editorContainer, previewContainer, {
  assetBaseUrl: 'https://cdn.example.com/assets/'
})
```

### Host adapters (browser vs. Node)

*Which kind* of worker runs the WASM is a host concern, not an engine concern. The
engine drivers create their worker through `createEngineWorker` (`src/engine/worker-host.ts`)
instead of `new Worker(...)` directly; the default factory returns a browser Web
Worker, so the browser path needs no setup. A non-browser host installs its own
factory once via `setWorkerFactory(...)` before constructing any engine.

The Node adapter ships in `wasmtex/node` (`src/engine/node-host.ts`):
`installNodeWorkerHost` installs a `worker_threads`-backed factory and an asset
`fetch` shim that serves `assetBaseUrl` files from a local `publicDir` while the TeX
Live CDN passes through. The browser glue is reused verbatim — the bootstrap shims
`self`/`postMessage`/`onmessage` and a synchronous `XMLHttpRequest` (sync HTTP via
`curl --compressed`, so gzip-encoded CDN assets like the ICU data file decode
correctly) — so **pdfLaTeX, XeLaTeX, LuaLaTeX, and BibTeX all run under Node**, not
just pdfTeX:

```ts
import { installNodeWorkerHost, WasmTexCompiler } from 'wasmtex/node'

const nodeHost = installNodeWorkerHost({
  publicDir: '…/public',
  assetBaseUrl: 'http://assets.local/',
})
const c = new WasmTexCompiler({
  engine: 'xelatex',                 // pdflatex | xelatex | lualatex | auto
  assetBaseUrl: 'http://assets.local/',
  texliveUrl: 'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/',
  files,
})
await c.init()
const { pdf } = await c.compile()
c.dispose()
nodeHost.dispose() // restores the previous global fetch and worker factory
```

Cross-host parity is verified in CI: `src/engine/cross-host-parity.smoke.test.ts`
asserts the Node output matches the browser-generated golden for pdfLaTeX, LuaLaTeX,
XeLaTeX, and BibTeX. The [execution model](execution-model.md) documents the full
client/server-split rationale.

### Self-hosting the engine assets (manifest + sync)

The WASM engines (pdfTeX/XeLaTeX/LuaLaTeX + dvipdfmx + BibTeX) and prebuilt
`.fmt`/`.fmt.gz` are built from source and deployed as version-matched artifacts.
Regardless of whether a baseline set is present in the repository, package installs
do not include `public/`, so consumers must host the assets themselves.
To self-host a **matching, verified** set without hand-assembling artifacts:

- Each cleared deploy publishes `wasmtex/<version>/manifest.json` next to the assets —
  a deterministic list of every file with its byte size and **SHA-256**, plus the
  status from `LICENSE-MANIFEST.json` (`scripts/gen-asset-manifest.mjs`). The release
  form of that command refuses uncleared assets.
- `npm run sync-engine-assets -- --from <baseUrl>` downloads every file in that
  manifest and **verifies each hash**, into `public/wasmtex/<version>/`. It also
  refuses a manifest that is not `release-cleared`:

```bash
# Pull the matching engine set from the deployed site (or your own mirror):
npm run sync-engine-assets -- --from https://corca-ai.github.io/wasmtex/
# options: --version 2025  --dest <dir>  --concurrency 8
```

The `.fmt` is engine-binary-specific, so the manifest's hashes guarantee the
`.fmt`/`.fmt.gz` match the `.wasm` they were extracted from — no silent mismatch.
The licensing status is not a substitute for reading the notices; it prevents a
known-incomplete development set from being mistaken for a redistributable release.

> Any committed `public/wasmtex/<version>/` files are a **dev-time default set**;
> at deploy `ci.yml` overwrites/supplements them with the latest CI
> artifacts. The deployed **manifest is authoritative** — sync/verify against it
> rather than shipping a copied (possibly older) tree. The current 2025 development
> set is intentionally not release-cleared while its recorded source, provenance,
> and compatibility blockers remain unresolved. New audited XeTeX/LuaHBTeX builds
> reject `pplib`; copied legacy binaries are not cleared substitutes.

## Preamble snapshots

To cut keystroke→PDF latency, the engine precompiles the document **preamble**
(everything before `\begin{document}`) into a custom `.fmt` and reuses it so body
edits only typeset the body instead of re-running every package load and font
setup. This is the `mylatexformat`/precompiled-preamble technique, applied
automatically inside the WASM worker.

**How it works (per compile):**
1. The worker splits the main file at `\begin{document}` and hashes the preamble.
2. **Hash unchanged** → the cached preamble `.fmt` is reused (a *snapshot hit*);
   only the body is typeset. The compile result reports `preambleSnapshot: true`.
3. **Hash changed** (or first compile) → the preamble `.fmt` is rebuilt once, then
   reused on subsequent body edits. The rebuild is reported as `preambleRebuilt: true`.

SyncTeX line numbers are preserved by padding the body with blank comment lines so
the precompiled body keeps the same line offsets as the full source.

### Graceful fallback

Some preambles are hostile to precompilation (e.g. packages that misbehave under
`-ini`/`\dump`). The engine degrades gracefully:

- If building the preamble `.fmt` fails, the worker logs the failure and runs a
  normal full compile for that document.
- If a snapshot compile produces critical errors (missing kernel macros such as
  `normalsize is not defined`, or unexpected `Undefined control sequence`), the
  worker discards the cached `.fmt` and retries with the base format — so output
  correctness always wins over the speed optimization.

### Durable preamble snapshots

Set `persistentPreambleCache: true` to retain successful pdfLaTeX preamble formats
across compiler and worker sessions. The browser cache is a 32 MiB bounded LRU in
IndexedDB. It is independent of `persistentCache`, which stores fetched TeX Live
files rather than the document-specific format.

A snapshot key binds the engine build receipt, TeX Live year and URL, immutable
mirror revision, and exact preamble bytes. Recorder-observed project files used by
the preamble are stored with SHA-256 digests and rechecked before restore. A changed
style/class file, malformed entry, incompatible schema, missing build receipt, or
unavailable IndexedDB therefore fails closed to a normal preamble rebuild.

```ts
new WasmTexCompiler({
  completionProfile: { id: 'production-2025', mirrorRevision: 'immutable-r42' },
  persistentPreambleCache: true,
})
```

The worker returns a copied format only when it rebuilt the preamble; persistence
runs off the compile response path. `clearCache()` clears both TeX Live assets and
durable preamble snapshots.

The pdfTeX WASM build starts with a 64 MiB growable heap. The worker copies this
heap for initialization restore, so keeping the initial allocation bounded avoids
multiplying an unused 512 MiB reservation while still allowing large documents to
grow on demand. `PDFTEX_INITIAL_MEMORY` can override the default for build-corpus
experiments.

### Opting out

Set `disablePreambleSnapshot: true` to turn the feature off entirely and always run
a full compile. Useful when debugging a precompile-hostile document or comparing
timings.

```ts
// Browser editor
new WasmTex('#editor', '#preview', { disablePreambleSnapshot: true })

// Headless compiler
new WasmTexCompiler({ disablePreambleSnapshot: true })
```

This is a construction-time option — snapshots stay on by default and there is no
public runtime toggle on the editor/compiler.

> Note: the snapshot logic lives in the authored controller
> (`wasm-build/pdftex-worker.js`). When rebuilding the engine, it ships as
> `wasmtex-pdftex.worker.js`, separate from the generated module and `.wasm` binary.

## Persistent cache

By default the engine caches TeX Live assets only in memory (plus the optional
service worker for HTTP responses), so a cold start re-fetches packages every
session. Setting `persistentCache: true` turns on a **durable IndexedDB cache**
of the assets the engine actually fetched, so return visits perform ~zero
network fetches for already-seen assets and work offline.

**How it works:**
- On init, the engine rehydrates the durable cache (versioned by TeX Live year)
  and injects every stored file into the worker — so files seen in a previous
  session are already present and never re-fetched.
- After a compile that fetched new files, the engine exports the worker's TeX
  Live cache (`dumpcache`) and persists it (non-blocking, best-effort).
- The store has a byte budget (default 150 MB per version) with least-recently-
  used eviction, and is keyed by TeX Live year so bumping the year invalidates
  cleanly.

Measured on a `xcolor + hyperref` document: a cold first load fetches ~98 files
on demand; a second load (after reload) fetches **0** — everything is served
from IndexedDB.

```ts
new WasmTex('#editor', '#preview', { persistentCache: true })
// or headless: new WasmTexCompiler({ persistentCache: true })
```

When the persistent cache is enabled, you typically do **not** also call
`warmup()`: the durable cache seeds the engine after the first session, and
running a network warmup every load would defeat the purpose. `warmup()` remains
the right choice for first-load speed in apps that don't persist.

**Clearing.** Call `clearCache()` on the editor/compiler, or the standalone
`clearTexliveCache({ version })`, to drop the durable cache for a TeX Live year:

```ts
await editor.clearCache()
// or, without an instance:
import { clearTexliveCache } from 'wasmtex'
await clearTexliveCache({ version: '2025' })
```

**Graceful fallback.** Where IndexedDB is unavailable (SSR, locked-down
contexts), the option silently no-ops — the engine still works, just without
durable caching.

## Compile robustness

### Rerun cycle detection

LaTeX often asks to be run again to settle cross-references and citations
(`Rerun to get cross-references right`, `Label(s) may have changed`, …). The
`RerunController` (`src/engine/rerun-controller.ts`) drives these auto-reruns and
**guarantees termination**:

- It caps the number of reruns (default 5).
- It detects non-convergence: each pass contributes a *signature* — a hash of the
  cross-reference state (the semantic trace / `.aux`). If the signature stops
  changing while the log still asks for a rerun, the document is oscillating or
  stuck, so it stops with a sensible status (`cross-references may be stale` or
  `cross-references did not converge`) instead of thrashing forever.

The controller backs both the browser editor (`WasmTex`) and the headless
compiler, and resets between user edits.

### SIMD

The engines ship scalar-only. TeX's algorithm is inherently sequential, so a
`-msimd128` build would accelerate only a few vectorizable inner loops — a small
realistic upside for a typical compile — while adding a second artifact that
must be gated on browser capability. The runtime capability detector
(`wasmSimdSupported()` in `src/engine/wasm-features.ts`) exists so that if a
measured experiment ever justifies a SIMD artifact, it can be served only where
supported, with the scalar build as fallback.

## Service Worker
The editor uses a service worker to cache TeX packages fetched from the CDN. 
- If `assetBaseUrl` is automatically resolved, it will look for `sw.js` at that same base path.
- Ensure your hosting environment allows service workers (served over HTTPS or localhost).
- To disable: set `serviceWorker: false` in options.

## Related Documents
- [docs/texlive-upgrade.md](texlive-upgrade.md): Detailed internals and TeX Live upgrade guide.
- [docs/architecture.md](architecture.md): System architecture overview.
