# Warmup / Preload

Reduce cold-start latency by pre-fetching TeX Live files before the WASM engine initializes.

## Problem

A cold compiler can resolve packages and fonts through sequential synchronous
worker requests. Prefetching a known set moves eligible downloads before that
blocking path. The benefit depends on the document, cache state and network;
preparation itself consumes time and bandwidth.

## Quick Start

```ts
import { WasmTex, warmup } from 'wasmtex'

// Start fetching as early as possible (e.g. on page load)
const cache = warmup()

// Later, when mounting the editor:
const editor = new WasmTex('#editor', '#preview', {
  warmupCache: await cache,
})
await editor.init()
```

### Dependency-light entry (`wasmtex/warmup`)

`warmup` is also exposed from a dedicated **`wasmtex/warmup`** entry point that pulls in only the preload logic — no editor, no Monaco. Import from there when a warmup-only context (a headless compile pipeline, a server, or a preview surface with its own PDF viewer) should not drag in the full editor bundle:

```ts
import { warmup } from 'wasmtex/warmup'
```

The root `import { warmup } from 'wasmtex'` above remains for the all-in-one editor case; both resolve to the same implementation.

## How It Works

1. `warmup()` injects a `<link rel="preconnect">` hint for the CDN
2. Fetches the built-in list in `src/engine/texlive-manifest.ts` (default concurrency 6)
3. Fetches the bloom filter (`bloom-filter.v2.bin`, falling back to `bloom-filter.bin` on snapshots published before it existed) in parallel with file preloads
4. Returns a `WarmupCache` `{ files, notFound, bloomFilter? }` — the fetched `ArrayBuffer`s, the known-404 entries (`KNOWN_404S`), and the bloom filter when it loaded
5. When passed to the constructor, the engine sends all files to the worker via `postMessage` (with transferables) before compilation starts
6. Known-404 entries are batch-injected into the worker's 404 cache, preventing wasted XHR
7. The bloom filter is sent to the worker, which uses it to skip XHR for files not on the CDN (if warmup is not used, the engine fetches the bloom filter directly during `init()`)

The supplied cache is consumed by pdfLaTeX, XeLaTeX (both TeX and PDF-conversion
workers), and LuaLaTeX. Unicode workers copy transferred buffers so the caller
can reuse its cache; supplied positives also avoid duplicate built-in prefetches.
Unicode preloads sharing one basename with conflicting bytes are omitted to
preserve the normal resolver behavior of their flat cache directories. A partial
cache remains best-effort: missing files use the normal resolver.

## Options

```ts
interface WarmupOptions {
  texliveVersion?: '2025' | '2026'  // default: '2025'; must match the mirror profile
  texliveUrl?: string               // override the default immutable R2 snapshot
  concurrency?: number              // max parallel fetches (default: 6)
  dependencies?: TexliveDependencySet // replay a compile's exact set (see below)
  files?: TexliveDependency[]       // explicit list; overrides the manifest and `dependencies`
  notFound?: TexliveFileEntry[]     // explicit known-absent list
  signal?: AbortSignal              // cancellation
  onProgress?: (completed: number, total: number) => void
}
```

## Exact dependency prefetch (`dependencies`)

The built-in manifest covers the LaTeX kernel plus the most common packages. Different documents need different packages and fonts. A learned set can prepare
those requests before compilation, but neither the built-in list nor resolver
observations prove that all future requests are covered.

Compile telemetry reports a **bounded observed TeX Live dependency set** as
`telemetry.texliveDependencies` — the union, across rerun passes and across every compile
since `init()` (a preamble-snapshot compile resolves only body files, so a single
compile's evidence would shrink after the first one), of reported resources the TeX passes
resolved (with the mirror object name when it differs from the kpathsea
request) or found absent. It contains names only, never bytes, and is bound to the TeX
Live year and compile profile it was observed under.

A host persists that set per project (it is small — a few KB of JSON) and replays it
next session:

```ts
// After a successful compile — store next to the project.
const deps = result.telemetry?.texliveDependencies

// Next session, before the engine boots — fetch the whole set in parallel.
const cache = await warmup({ dependencies: deps, concurrency: 16, texliveVersion, texliveUrl })
const compiler = new WasmTexCompiler({ warmupCache: cache, texliveVersion, texliveUrl, files })
```

Check the set's `complete` flag; recorded observations can be truncated or
unavailable. This prefetch set is distinct from the project-input
`dependencyManifest` used for safe invalidation.

The set is fetched **on top of** the built-in manifest (the union, deduplicated by
request name): an engine that reports only network lookups records a set without the
kernel files it received from warmup, and replacing the manifest would reintroduce
those fetches. `warmup` ignores a set whose `texliveVersion` differs from the requested
one, so a set recorded against one year can never seed the other year's mirror. `files` / `notFound` accept an explicit list when a host assembles
its own manifest (a template pack, a union over several projects). A host can collect template observations under Node (`wasmtex/node`) and serve
them to clients using the same qualified profile. `warmup()` checks the year,
but does not itself validate profile ID or mirror revision: the host must select
the matching set before replaying it.

## Persistent Cache

`warmup()` solves the *first* compile. The persistent cache solves *return visits*:
it durably stores every TeX Live asset the engine fetches (plus the bloom filter and
the 404 set) in IndexedDB, namespaced by TeX Live year and immutable mirror identity, so already-cached resources can be reused. Engine assets, project files and any
unseen packages still need to be available for an offline compile.

Enable it with the `persistentCache` constructor flag:

```ts
const editor = new WasmTex('#editor', '#preview', {
  persistentCache: true, // durable IndexedDB cache of fetched assets
})
await editor.init()
```

It is safe to combine both: on init the engine rehydrates the durable cache and merges
it with any caller-provided `warmupCache`. It silently no-ops where IndexedDB is
unavailable (`isIndexedDbSupported()`). To wipe the active mirror namespace, call
`editor.clearCache()`, or clear every mirror and legacy entry for a year without an engine instance:

```ts
import { clearTexliveCache } from 'wasmtex'

await clearTexliveCache({ version: '2025' }) // version defaults to '2025'
```

For direct control, the `PersistentCache` class (and `PersistentCacheOptions`:
`version`, `texliveUrl`, `mirrorRevision`, `store`, `maxBytes`, `now`) is exported
from `wasmtex`. Provide the exact immutable endpoint when using a custom mirror:

```ts
import { PersistentCache } from 'wasmtex'

const cache = new PersistentCache({
  version: '2026',
  texliveUrl: 'https://mirror.example/snapshots/revision/2026/',
  mirrorRevision: 'revision', // optional extra identity, also used at a fixed URL
})
```

Omitting `texliveUrl` selects the SDK's shipped immutable mirror for 2025/2026.
Unknown years need an explicit URL. URLs must be absolute HTTP(S) endpoints
without credentials, query strings, or fragments. Invalid URL/revision identities
are safe misses and saves are no-ops; trailing slashes, hostname case, and default
ports normalize consistently. Whitespace-only revisions are invalid. The default
soft file-byte budget is 150 MB per mirror namespace, with LRU eviction; a
just-saved payload can exceed it. Other mirrors and Bloom/negative metadata are
outside that budget. See [cache migration and clearing](engine.md#persistent-cache).

## Measuring benefit

Measure preload plus initialization plus first PDF, as well as repeat compiles.
Starting early may overlap other work; it does not make downloads free. Track
unused downloads and failures, and keep network/CPU conditions fixed.
The [performance guide](compile-performance.md) summarizes adopted changes;
[early measurements](history/warmup-legacy.md) are historical examples only.

The built-in durable asset cache isolates mirrors automatically. Year-only
entries from older SDK versions are never rehydrated; the selected namespace
repopulates on demand. The separate persistent-preamble cache retains its
engine build/profile identity. See [engine cache behavior](engine.md#persistent-cache).

## Retaining learned prefetch sets

A later warm run can report fewer resolver lookups because native cache hits
bypass the HTTP resolver. Hosts can merge the previous learned set with a new
one using `mergeTexliveDependencySets(previous, next)` from `wasmtex/warmup`.
It unions resources and absences, preserves resolved candidate names, and lets
a positive resource override a negative. Different profile IDs, years, or mirror
revisions do not merge: the new set wins. Inputs are not mutated. Hosts still
own bounded storage, project identity, and atomic updates. This is speculative
prefetch evidence, not permission to mark project invalidation complete.
