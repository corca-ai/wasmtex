# Warmup / Preload

Eliminate cold-start latency by pre-fetching TeX Live files before the WASM engine initializes.

## Problem

On first compilation, the WASM worker makes **90 sequential synchronous XHR requests** to the CDN for TeX Live packages (64 file downloads + 26 wasted 403 lookups). Each blocks the worker thread, adding ~2 seconds of network wait before the first PDF appears.

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
2. Fetches all 64 known TeX Live files in parallel (concurrency pool of 6)
3. Fetches the bloom filter (`bloom-filter.v2.bin`, falling back to `bloom-filter.bin` on snapshots published before it existed) in parallel with file preloads
4. Returns a `WarmupCache` `{ files, notFound, bloomFilter? }` — the fetched `ArrayBuffer`s, the known-404 entries (`KNOWN_404S`), and the bloom filter when it loaded
5. When passed to the constructor, the engine sends all files to the worker via `postMessage` (with transferables) before compilation starts
6. Known-404 entries are batch-injected into the worker's 404 cache, preventing wasted XHR
7. The bloom filter is sent to the worker, which uses it to skip XHR for files not on the CDN (if warmup is not used, the engine fetches the bloom filter directly during `init()`)

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

The built-in manifest covers the LaTeX kernel plus the most common packages. A real
document — a conference class, Times fonts, hyperref — needs many more files, and each
one the worker fetches on demand is a **serial** synchronous request that pays the full
mirror latency. Measured against the live mirror in a fresh browser context, that is
where a cold first compile goes (warm recompiles of the same documents take 0.1–0.2 s):

| Document | Mirror requests | No warmup | Built-in warmup | Exact set prefetched |
|---|---:|---:|---:|---:|
| article + amsmath (40 sections) | 19 | 8.3 s | 0.3 s (after a 5.3 s warmup) | 0.3 s (after a 1.5 s prefetch) |
| IEEEtran conference | 40 | 12–23 s | 11.5 s | 0.3 s (after 2.0 s) |
| NeurIPS 2026 | 89 | 31 s | 26 s | 0.4 s (after 2.4 s) |
| acmart sigconf | 185 | 57–175 s | 69 s | 0.8 s (after 5.0 s) |

Every compile therefore reports the **exact TeX Live dependency set** of the session as
`telemetry.texliveDependencies` — the union, across rerun passes and across every compile
since `init()` (a preamble-snapshot compile resolves only body files, so a single
compile's evidence would shrink after the first one), of every resource the TeX passes
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

The set is fetched **on top of** the built-in manifest (the union, deduplicated by
request name): an engine that reports only network lookups records a set without the
kernel files it received from warmup, and replacing the manifest would reintroduce
those fetches. `warmup` ignores a set whose `texliveVersion` differs from the requested
one, so a set recorded against one year can never seed the other year's mirror. `files` / `notFound` accept an explicit list when a host assembles
its own manifest (a template pack, a union over several projects). Because the same
engine runs byte-identically on a server (`wasmtex/node`), the set for a template or a
shared project can be recorded once there and served to every client.

## Persistent Cache

`warmup()` solves the *first* compile. The persistent cache solves *return visits*:
it durably stores every TeX Live asset the engine fetches (plus the bloom filter and
the 404 set) in IndexedDB, namespaced by TeX Live year, so a returning user performs
near-zero network fetches and can work offline.

Enable it with the `persistentCache` constructor flag:

```ts
const editor = new WasmTex('#editor', '#preview', {
  persistentCache: true, // durable IndexedDB cache of fetched assets
})
await editor.init()
```

It is safe to combine both: on init the engine rehydrates the durable cache and merges
it with any caller-provided `warmupCache`. It silently no-ops where IndexedDB is
unavailable (`isIndexedDbSupported()`). To wipe the cache for the active year, call
`editor.clearCache()`, or clear it without an engine instance:

```ts
import { clearTexliveCache } from 'wasmtex'

await clearTexliveCache({ version: '2025' }) // version defaults to '2025'
```

For direct control, the `PersistentCache` class (and `PersistentCacheOptions`:
`version`, `store`, `maxBytes`, `now`) is exported from `wasmtex`. The default byte
budget is 150 MB per version, with LRU eviction.

## Performance

Measured with Playwright (Chromium, localhost dev server):

| Metric | Before | After |
|--------|--------|-------|
| Sync XHR during compile | 90 (64 OK + 26 wasted 403) | 0 |
| Time to first PDF | ~4.9s | ~2.9s |

The warmup fetch runs concurrently with other page initialization (Monaco loading, DOM setup), so the effective cost is near zero when called early enough.
