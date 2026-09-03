import { describe, expect, it, vi } from 'vitest'
import { BLOOM_FILTER_OBJECTS, fetchBloomFilter } from './bloom-filter'

const ok = (bytes: number) =>
  ({ ok: true, arrayBuffer: async () => new ArrayBuffer(bytes) }) as unknown as Response
const missing = { ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response

describe('fetchBloomFilter', () => {
  it('prefers the v2 object', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('bloom-filter.v2.bin') ? ok(8) : ok(4),
    )
    const buf = await fetchBloomFilter(
      'https://m/2026/',
      undefined,
      fetchImpl as unknown as typeof fetch,
    )
    expect(buf?.byteLength).toBe(8)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(BLOOM_FILTER_OBJECTS[0]).toBe('bloom-filter.v2.bin')
  })

  it('falls back to the original object on a snapshot without v2', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      url.endsWith('bloom-filter.v2.bin') ? missing : ok(4),
    )
    const buf = await fetchBloomFilter(
      'https://m/2026/',
      undefined,
      fetchImpl as unknown as typeof fetch,
    )
    expect(buf?.byteLength).toBe(4)
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([
      'https://m/2026/bloom-filter.v2.bin',
      'https://m/2026/bloom-filter.bin',
    ])
  })

  it('returns null when neither loads and rethrows an abort', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('network')
    })
    expect(
      await fetchBloomFilter('https://m/2026/', undefined, failing as unknown as typeof fetch),
    ).toBeNull()
    const aborting = vi.fn(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    await expect(
      fetchBloomFilter('https://m/2026/', undefined, aborting as unknown as typeof fetch),
    ).rejects.toThrow('aborted')
  })
})
