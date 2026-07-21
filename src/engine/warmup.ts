/**
 * Standalone warmup function that pre-fetches TeX Live files before
 * the WASM engine starts. Eliminates blocking sync XHR during first compile.
 */
import type { CachedTexliveFile, TexliveVersion, WarmupCache } from '../types'
import { resolveTexliveUrl } from './base-worker-engine'
import { KNOWN_404S, PRELOAD_FILES } from './texlive-manifest'

export interface WarmupOptions {
  /** TeX Live version. Defaults to '2025'. */
  texliveVersion?: TexliveVersion
  /** Override TeX Live CDN endpoint. */
  texliveUrl?: string
  /** Max concurrent fetches. Defaults to 6. */
  concurrency?: number
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
  /** Progress callback: called with (completed, total). */
  onProgress?: (completed: number, total: number) => void
}

/**
 * Pre-fetch TeX Live files needed for first compilation.
 *
 * Call this as early as possible (e.g. on page load), then pass the
 * result as `warmupCache` to the `WasmTex` constructor.
 *
 * ```ts
 * const cache = await warmup()
 * const editor = new WasmTex('#editor', '#preview', { warmupCache: cache })
 * ```
 */
export async function warmup(options?: WarmupOptions): Promise<WarmupCache> {
  const version = options?.texliveVersion ?? '2025'
  const concurrency = options?.concurrency ?? 6
  const signal = options?.signal
  const onProgress = options?.onProgress

  const baseUrl = resolveTexliveUrl(options?.texliveUrl ?? null, version)

  // Inject DNS preconnect hint
  injectPreconnect(baseUrl)

  const files: CachedTexliveFile[] = []
  const total = PRELOAD_FILES.length
  let completed = 0

  // Concurrency pool
  const queue = [...PRELOAD_FILES]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (signal?.aborted) return

      const entry = queue.shift()!
      try {
        const url = `${baseUrl}pdftex/${entry.format}/${entry.filename}`
        const resp = await fetch(url, signal ? { signal } : {})
        if (resp.ok) {
          const data = await resp.arrayBuffer()
          files.push({ format: entry.format, filename: entry.filename, data })
        }
      } catch {
        // Fetch failed — file will be fetched on demand by the worker
      }
      completed++
      onProgress?.(completed, total)
    }
  }

  // Fetch bloom filter in parallel with file preloads
  const bloomPromise = fetch(`${baseUrl}bloom-filter.bin`, signal ? { signal } : {})
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null)

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
  await Promise.all(workers)

  const bloomFilter = await bloomPromise

  // Make cancellation observable: every fetch rejection (incl. the AbortError from an
  // aborted in-flight fetch) is swallowed for graceful degradation, so without this an
  // aborted warmup would resolve with a partial cache indistinguishable from completion.
  // The documented `signal` option implies the AbortSignal convention: reject on abort.
  if (signal?.aborted) throw new DOMException('Warmup aborted', 'AbortError')

  const result: WarmupCache = { files, notFound: [...KNOWN_404S] }
  if (bloomFilter) result.bloomFilter = bloomFilter
  return result
}

function injectPreconnect(baseUrl: string): void {
  try {
    const origin = new URL(baseUrl).origin
    if (document.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return
    const link = document.createElement('link')
    link.rel = 'preconnect'
    link.href = origin
    document.head.appendChild(link)
  } catch {
    // Not in a browser environment
  }
}
