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

## How It Works

1. `warmup()` injects a `<link rel="preconnect">` hint for the CDN
2. Fetches all 64 known TeX Live files in parallel (concurrency pool of 6)
3. Fetches the bloom filter (`bloom-filter.bin`) in parallel with file preloads
4. Returns a `WarmupCache` `{ files, notFound, bloomFilter? }` — the fetched `ArrayBuffer`s, the known-404 entries (`KNOWN_404S`), and the bloom filter when it loaded
5. When passed to the constructor, the engine sends all files to the worker via `postMessage` (with transferables) before compilation starts
6. Known-404 entries are batch-injected into the worker's 404 cache, preventing wasted XHR
7. The bloom filter is sent to the worker, which uses it to skip XHR for files not on the CDN (if warmup is not used, the engine fetches the bloom filter directly during `init()`)

## Options

```ts
interface WarmupOptions {
  texliveVersion?: '2025'           // default: '2025'; versioned for future releases
  texliveUrl?: string               // override CDN endpoint
  concurrency?: number              // max parallel fetches (default: 6)
  signal?: AbortSignal              // cancellation
  onProgress?: (completed: number, total: number) => void
}
```

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
