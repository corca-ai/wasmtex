import { describe, expect, it } from 'vitest'
import { binaryFileBlob } from './binary-file'

describe('binaryFileBlob', () => {
  it('honors a subarray-backed view (byteOffset/byteLength), not the whole buffer', async () => {
    const big = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])
    const view = big.subarray(2, 5) // byteOffset 2, length 3 → [2,3,4]
    const blob = binaryFileBlob(view)
    expect(blob.size).toBe(3) // would be 8 with `new Blob([view.buffer])`
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([2, 3, 4])
  })

  it('handles a full-buffer array unchanged', async () => {
    const data = new Uint8Array([9, 8, 7])
    const blob = binaryFileBlob(data)
    expect(blob.size).toBe(3)
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([9, 8, 7])
  })
})
