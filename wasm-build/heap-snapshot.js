/* Bundled before Unicode controllers by their build scripts. Initialization
 * snapshots preserve C state; these are not resumable execution checkpoints. */
self.wasmtexHeapSnapshot = {
  capture(buffer) {
    const words = new Float64Array(buffer)
    const ranges = []
    let size = 0
    // Scan 64 KiB pages, omitting zero pages and each page's zero suffix.
    // Object.is rejects negative zero and NaNs: only all-zero bytes are omitted.
    for (let start = 0; start < words.length; start += 8192) {
      let end = Math.min(start + 8192, words.length)
      while (end > start && Object.is(words[end - 1], 0)) end--
      if (end === start) continue
      const from = start * 8
      const to = end * 8
      if (ranges.length && ranges[ranges.length - 1] === from) ranges[ranges.length - 1] = to
      else ranges.push(from, to)
      size += to - from
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (let i = 0; i < ranges.length; i += 2) {
      const length = ranges[i + 1] - ranges[i]
      bytes.set(new Uint8Array(buffer, ranges[i], length), offset)
      offset += length
    }
    return { bytes, ranges: new Uint32Array(ranges), byteLength: buffer.byteLength }
  },
  restore(buffer, snapshot) {
    const dst = new Uint8Array(buffer)
    let end = 0
    let offset = 0
    for (let i = 0; i < snapshot.ranges.length; i += 2) {
      const from = snapshot.ranges[i]
      const to = snapshot.ranges[i + 1]
      dst.fill(0, end, from)
      dst.set(snapshot.bytes.subarray(offset, offset + to - from), from)
      offset += to - from
      end = to
    }
    // Preserve the original snapshot extent. Later-grown memory stays untouched.
    dst.fill(0, end, snapshot.byteLength)
  },
}
