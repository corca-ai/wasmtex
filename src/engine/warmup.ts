/**
 * Standalone warmup function that pre-fetches TeX Live files before
 * the WASM engine starts. Eliminates blocking sync XHR during first compile.
 */
import type {
  CachedTexliveFile,
  TexliveDependency,
  TexliveDependencySet,
  TexliveFileEntry,
  TexliveVersion,
  WarmupCache,
} from '../types'
import { resolveTexliveUrl } from './base-worker-engine'
import { fetchBloomFilter } from './bloom-filter'
import { KNOWN_404S, PRELOAD_FILES } from './texlive-manifest'

export interface WarmupOptions {
  /** TeX Live version. Defaults to '2025'. */
  texliveVersion?: TexliveVersion
  /** Override TeX Live CDN endpoint. */
  texliveUrl?: string
  /** Max concurrent fetches. Defaults to 6. */
  concurrency?: number
  /** Replay a compile's exact dependency set (`telemetry.texliveDependencies`) on top of
   *  the built-in first-compile manifest (the union, deduplicated by request name). An
   *  engine that only reports network lookups records a set without the kernel files it
   *  got from warmup, so replacing the manifest would reintroduce those fetches. Ignored
   *  when its `texliveVersion` does not match the requested one, so a set recorded
   *  against another year can never seed the wrong mirror. */
  dependencies?: TexliveDependencySet
  /** Explicit file list, overriding both the built-in manifest and `dependencies`.
   *  Each entry is fetched as `candidate ?? filename` and injected as `filename`. */
  files?: TexliveDependency[]
  /** Explicit known-absent list, overriding the built-in one and `dependencies`. */
  notFound?: TexliveFileEntry[]
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
  const { entries, notFound } = selectPreloadSet(version, options)

  // Inject DNS preconnect hint
  injectPreconnect(baseUrl)

  const files: CachedTexliveFile[] = []
  const total = entries.length
  let completed = 0

  // Concurrency pool
  const queue = [...entries]

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      if (signal?.aborted) return

      const entry = queue.shift()!
      try {
        const url = `${baseUrl}pdftex/${entry.format}/${entry.candidate ?? entry.filename}`
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
  const bloomPromise = fetchBloomFilter(baseUrl, signal ? { signal } : undefined).catch(() => null)

  const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
  await Promise.all(workers)

  const bloomFilter = await bloomPromise

  // Make cancellation observable: every fetch rejection (incl. the AbortError from an
  // aborted in-flight fetch) is swallowed for graceful degradation, so without this an
  // aborted warmup would resolve with a partial cache indistinguishable from completion.
  // The documented `signal` option implies the AbortSignal convention: reject on abort.
  if (signal?.aborted) throw new DOMException('Warmup aborted', 'AbortError')

  const result: WarmupCache = { files, notFound }
  if (bloomFilter) result.bloomFilter = bloomFilter
  return result
}

/** Which files to prefetch: explicit lists win, then a version-matched dependency
 *  set, then the built-in first-compile manifest. */
function selectPreloadSet(
  version: TexliveVersion,
  options: WarmupOptions | undefined,
): { entries: TexliveDependency[]; notFound: TexliveFileEntry[] } {
  const dependencies =
    options?.dependencies && options.dependencies.texliveVersion === version
      ? options.dependencies
      : undefined
  const entries =
    options?.files ??
    (dependencies ? unionByName(PRELOAD_FILES, dependencies.files) : PRELOAD_FILES)
  const notFound =
    options?.notFound ??
    (dependencies ? unionByName(KNOWN_404S, dependencies.notFound) : KNOWN_404S)
  // A request the set resolved must not stay on the negative list from the manifest.
  const resolved = new Set(entries.map((entry) => `${entry.format}/${entry.filename}`))
  return {
    entries: entries.map((entry) => ({ ...entry })),
    notFound: notFound
      .filter((entry) => !resolved.has(`${entry.format}/${entry.filename}`))
      .map((entry) => ({ format: entry.format, filename: entry.filename })),
  }
}

/** Built-in entries first, then the set's entries not already present; the set's
 *  entry wins when both exist so its mirror `candidate` is kept. */
function unionByName<T extends TexliveFileEntry>(base: readonly T[], extra: readonly T[]): T[] {
  const byName = new Map<string, T>()
  for (const entry of base) byName.set(`${entry.format}/${entry.filename}`, entry)
  for (const entry of extra) byName.set(`${entry.format}/${entry.filename}`, entry)
  return [...byName.values()]
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
