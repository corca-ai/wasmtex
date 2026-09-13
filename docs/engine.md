# WASM Engine & TeX Live

For contributors working on worker behavior and package resolution. Library users
should start with [asset setup](assets.md) and [headless integration](headless.md).
Source compilation is in [engine builds](engine-build.md); verification is in [engine testing](engine-testing.md).

Navigate to [routing](#detection--routing), [asset resolution](#asset-resolution-wasm--workers),
[preamble state](#preamble-snapshots), [persistent cache](#persistent-cache), or [compile robustness](#compile-robustness).

Production package bytes are served from immutable Cloudflare R2 prefixes at
`texlive.corca.ai`; [TeX Live mirror operations](texlive-mirror-operations.md)
documents publication and recovery.

For performance changes, the [engine optimization policy](engine-optimization-policy.md)
requires existing format bytes, output, and package snapshots to remain compatible,
including transparent adoption by existing CorTeX projects.

The [upgrade customization inventory](engine-upgrade-customizations.md) maps
maintained patches and build flags to their assumptions and tests. The
[performance guide](compile-performance.md) summarizes adopted optimizations;
[nested output](nested-output.md) documents the SDK's XDV/PDF handoff contract.

## Engine Setup

### Consuming the library: sync a verified set (recommended)

Follow [engine asset setup](assets.md) to obtain and serve a manifest-verified set.
The SDK install contains the JavaScript library, declarations and notices; engine
controllers, WASM and formats are distributed separately.

### Contributing: stage a local build

Use the [engine build guide](engine-build.md) and stage outputs under
`public/wasmtex/<version>/`. Use [engine qualification tests](engine-testing.md)
before treating local build outputs as release candidates.

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
base). The LuaLaTeX WASM is built from source (see [engine builds](engine-build.md)) and verified end-to-end
(builds the `lualatex` format and compiles a real document, with CDN font fetch, to
a PDF); when the artifact is absent, routing to it degrades gracefully.

**Prebuilt format (cold-start fast path).** Initialization fetches the selected
format in parallel with worker boot. A valid prebuilt format avoids generating
one on the first compile. Missing or invalid data falls back to format generation;
optimization qualification must verify that the original format was actually used.

Build workflows can generate formats for a new annual source. Transparent engine
updates instead assemble the original format bytes with their generation receipts,
and test those bytes under the new binary. Compatibility depends on verified
layout and behavior, not simply an equal year or a different WASM hash.
Unicode assets use `.fmt.gz`; the loader decompresses them with
`DecompressionStream` and accepts responses already decoded by HTTP encoding.
See [source assembly](corresponding-source.md) for the promotion procedure.

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
(mirroring pdfTeX) reduce it: the worker loads the CDN **bloom filter**
(`loadbloom`) and skips the sync XHR for any file it says is absent; and the
engine **prefetches** the known first-compile file set in parallel (overlapping
worker boot) and injects it via `preloadtexlive`, so supplied files are found locally. Unseen files still require on-demand lookup. The file set is `src/engine/luatex-manifest.ts`,
generated by `scripts/gen-luatex-manifest.mjs` from an instrumented compile
(regenerate when the runtime changes). The sends are fire-and-forget, so a
worker without these commands simply ignores them and fetches on demand.

**Persistent cache (return visits).** With `persistentCache: true` the Unicode
engines also use the durable IndexedDB cache (see [Persistent cache](#persistent-cache)):
the worker exposes `dumpcache`, and after a successful compile the engine persists
every fetched file (keyed by TeX Live year and mirror identity). On the next visit the engine rehydrates
that set and injects it instead of prefetching from the CDN, so already-cached files can be reused. Offline operation still requires local
engine assets, project files and every needed package/font. `clearCache()` / `clearTexliveCache()` drop it.

**Resolver evidence.** Every authored TeX worker reports the final result of each
TeX Live lookup through the same data-only worker protocol. The host validates,
deduplicates, and retains at most 1,024 resolver entries per pass, then exposes them as
`telemetry.resolver` under the exact engine/year/mirror profile. Cache, bloom-filter,
HTTP absence, and transport failure remain distinct. A transport failure is deliberately
not written to the negative cache; only evidence from an immutable-mirror response or a
known negative preload can suppress a later request. Browser and Node use the same worker
controllers and collector, so the evidence contract is identical in both hosts.

**Repeated compilation.** The prebuilt format is injected into the work dir once (it
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
- **Bloom Filter**: A ~380 KB bloom filter (`bloom-filter.v2.bin`, 1e-4 false positives; older snapshots fall back to the ~190 KB `bloom-filter.bin` at 1e-2) is fetched at startup and loaded into the worker. It allows the worker to skip sync XHR for files that definitely do not exist on the mirror. Regenerate with `node scripts/gen-bloom-filter.mjs`.
- **Caching**: A Service Worker (`public/sw.js`) caches these files locally to enable offline compilation and speed up subsequent runs.

### URL Resolution Order
The `texliveUrl` is determined as follows:
1. `options.texliveUrl` passed to the constructor.
2. `VITE_TEXLIVE_URL` environment variable.
3. The immutable R2 snapshot pinned for that TeX Live year.

The default R2 mirror works out of the box. An explicit URL should likewise name
an immutable snapshot rather than mutable discovery metadata.

## Asset Resolution (WASM & Workers)

Engine drivers load controller/module/WASM and format files under
`<assetBaseUrl>/wasmtex/<year>/`. The browser component resolves an explicit base,
then its build-time base, then its own script location; headless defaults to `/`.
The [asset setup guide](assets.md#configure-the-host) owns host-facing configuration.

pdfTeX's checkpoint binary shares the ordinary controller, selected with
`?engine=checkpoint`; see [checkpoint builds](engine-build.md#checkpoint-engine-build-wasmtex-pdftex-checkpoint).
Missing optional Unicode assets produce an engine-unavailable result; required
release artifacts must still be present during CI assembly.

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

The [Node integration recipe](headless.md#server-side-compilation-node) shows
installation and disposal order. The factory and fetch shim are global to the
host; terminate compiler workers before restoring the previous installation.


Cross-host parity is verified in CI: `src/engine/cross-host-parity.smoke.test.ts`
asserts the Node output matches the browser-generated golden for pdfLaTeX, LuaLaTeX,
XeLaTeX, and BibTeX. The [execution model](execution-model.md) documents the full
client/server-split rationale.

### Self-hosting the engine assets (manifest + sync)

The [asset setup guide](assets.md) owns download commands, destination layout and
host configuration. Release assembly and exact source identities are maintained
in [corresponding-source releases](corresponding-source.md).

## Unicode engine initialization snapshots

The XeTeX and LuaTeX source build flags start linear memory at 128 MiB rather
than 768 MiB, retaining `ALLOW_MEMORY_GROWTH=1` and the same stack size. This
changes engine bytes, not the TeX Live snapshot or format contract. Qualification
must cover allocation beyond the initial heap and subsequent document reuse;
see the rebuilt-engine differential mode in the [development guide](develop.md).
An experiment changing only the WASM memory declaration is useful for isolating
this variable, but does not replace a source rebuild or qualify release assets.

The XeTeX, LuaTeX, and dvipdfmx controllers reset C state between compiles by
restoring an initial heap snapshot. They retain the prefix through its last nonzero word and
the original heap extent; restoration copies that prefix and fills the omitted
suffix with zeros. This preserves the bytes and reset boundary of the former
full-heap copy while avoiding a retained copy of unused initial capacity.
XeTeX captures ICU data and registration in the same way when it replaces its
initial snapshot. Memory grown after a snapshot remains outside that snapshot's
reset boundary, as before.
The dvipdfmx build retains its 256 MiB initial memory allocation; only its
snapshot representation changes.

This controller representation changes neither WASM nor `.fmt` bytes. It is
separate from both preamble formats and resumable execution checkpoints, and
requires the [optimization qualification](engine-optimization-policy.md) before
being promoted to an existing CorTeX profile.

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
of previously fetched assets. Offline use additionally requires engine assets,
project inputs and every needed package; unseen resources still need a network.

**How it works:**
- On init, the engine rehydrates the durable cache (bound to TeX Live year and mirror identity)
  and injects every stored file into the worker — so files seen in a previous
  session are already present and never re-fetched.
- After a compile that fetched new files, the engine exports the worker's TeX
  Live cache (`dumpcache`) and persists it (non-blocking, best-effort).
- Each year/mirror namespace has a soft file-byte budget (default 150 MB) with
  least-recently-used eviction. Eviction does not remove another mirror's data;
  several mirror namespaces can therefore occupy more than one budget. Bloom
  and negative metadata are outside the file budget, and a just-saved payload
  larger than the budget is retained, as before.

```ts
new WasmTex('#editor', '#preview', { persistentCache: true })
// or headless: new WasmTexCompiler({ persistentCache: true })
```

Warmup and persistent caching can be combined. Measure duplicate preparation
and unused downloads before enabling both for every visit. The durable asset
cache keys include the year, normalized absolute mirror URL, and optional resolver
profile `mirrorRevision`. Different URLs or revisions never share files, Bloom
filters, or negative lookups. The endpoint must identify immutable contents.
This is distinct from the engine build/profile identity of durable preamble
snapshots, whose keys are unchanged. Caller-supplied warmup bytes still need to
match the selected profile. See [warmup](warmup.md).

**Migration and clearing.** Old year-only entries and records missing the current
identity are cache misses; the first return visit repopulates from the selected
mirror. Old entries remain unused until a year-wide clear. `clearCache()` on an
enabled editor/compiler drops its mirror namespace; the pdfTeX path also clears
its separate durable preamble cache. `PersistentCache.clear()` waits for that
instance's preceding saves and invalidates worker dumps started before clearing. The standalone `clearTexliveCache({ version })`
removes every mirror namespace and legacy entry for that year. Stop concurrent
writers before a year-wide clear; other instances/tabs can otherwise repopulate
it. These operations do not flush already running workers' in-memory files:

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

The SDK rejects a controller's success status and attached output when the TeX
log explicitly reports a fatal error with no PDF/DVI output. Published controllers
can retain a previous run's file after an early stop, including exit status 1.
Such a result exposes neither PDF nor SyncTeX, retains its diagnostic log, and
cannot establish fresh compile metadata. Ordinary status-1 warning output remains
available. This admission rule works with existing engine and format bytes.
After any unsuccessful headless compile, the project index clears compile-derived
aux, engine-command and trace values while preserving source symbols. Raw
`readOutput()` still reads the engine filesystem and is not a freshness guarantee.

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
The browser `WasmTex` component attempts to register `sw.js` unless disabled.
The headless compiler does not register a service worker. The integrating host
must serve the script from an allowed origin/scope; registration is best-effort.
- If `assetBaseUrl` is automatically resolved, it will look for `sw.js` at that same base path.
- Ensure your hosting environment allows service workers (served over HTTPS or localhost).
- To disable: set `serviceWorker: false` in options.

## Related Documents
- [docs/texlive-upgrade.md](texlive-upgrade.md): Detailed internals and TeX Live upgrade guide.
- [docs/architecture.md](architecture.md): System architecture overview.

## PDF conversion input evidence

XeLaTeX additionally reports `pdfConversionInputs`: bounded successful file-read
opens observed inside dvipdfmx. This includes native/MEMFS hits that bypass the
HTTP resolver. TeX's `inputFiles` recorder and its completeness retain their
existing meaning. The headless SDK unions conversion observations across reruns
and filters project paths into the dependency manifest, excluding generated and
system inputs. Mirror files actually opened also contribute their cache-backed
resource identity to dependency prefetch. Unused cache entries do not count.

The observer does not change file selection or read bytes. It limits records to
4,096 paths of at most 4,096 characters, excluding temporary internal files.
Already-open streams and unsupported I/O paths remain unproven; conversion
coverage stays incomplete even when no limit is reached. A host must retain its
conservative invalidation fallback. Older workers omit the additional evidence.

## Moved reference sections

These anchors preserve existing bookmarks. Follow the links to the focused guides.

<a id="building-the-unicode-engine-from-source"></a>
<a id="shipping-it-ci-build--deploy"></a>
<a id="building-lualatex-luahbtex-from-source"></a>
See [Building the Unicode engine from source](engine-build.md#building-the-unicode-engine-from-source) in its dedicated guide.

<a id="checkpoint-engine-build-wasmtex-pdftex-checkpoint"></a>
See [Checkpoint engine build](engine-build.md#checkpoint-engine-build-wasmtex-pdftex-checkpoint) in its dedicated guide.
