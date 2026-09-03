/**
 * Which bloom filter object a mirror snapshot serves.
 *
 * `bloom-filter.v2.bin` is built at a 1e-4 false-positive rate (about 19 bits per
 * key); the original `bloom-filter.bin` at 1e-2. A false positive is not free: the
 * worker then asks the mirror for a name that is not there, and every document
 * that uses the same package pays that round trip on every cold compile. Snapshots
 * published before v2 existed only carry the original, so the engine tries v2 and
 * falls back. Both share the `BF01` binary format the worker parses.
 */
export const BLOOM_FILTER_OBJECTS = ['bloom-filter.v2.bin', 'bloom-filter.bin'] as const

/** Fetch the tightest bloom filter the mirror offers, or null when none loads. */
export async function fetchBloomFilter(
  baseUrl: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer | null> {
  for (const name of BLOOM_FILTER_OBJECTS) {
    try {
      const resp = await fetchImpl(`${baseUrl}${name}`, init)
      if (resp.ok) return await resp.arrayBuffer()
    } catch (err) {
      // An aborted warmup must stay observable to the caller; a plain network failure
      // just moves on to the next candidate.
      if (err instanceof DOMException && err.name === 'AbortError') throw err
    }
  }
  return null
}
