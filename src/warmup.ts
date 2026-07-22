// Public warmup / preload entry — a dependency-light path to pre-fetch TeX Live files and
// eliminate first-compile cold start (see docs/warmup.md), WITHOUT pulling in the editor and
// Monaco that the root `wasmtex` barrel carries. Hosts that only warm the cache — a headless
// compile pipeline, a server, or a preview surface that renders its own PDF viewer — import from
// here so a warmup-only context never drags in the full editor bundle. `warmup` is also
// re-exported from the root `wasmtex` barrel for the all-in-one editor case.

export { type WarmupOptions, warmup } from './engine/warmup'
export type { CachedTexliveFile, WarmupCache } from './types'
