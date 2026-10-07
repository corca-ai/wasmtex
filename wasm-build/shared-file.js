/* Immutable format/font aliases share MEMFS storage until a writer changes one.
 * Bundled before the engine controllers; never borrow a live WASM heap view. */
self.wasmtexSharedFiles = (() => {
  const borrowed = new WeakMap()
  const wrapped = new WeakSet()
  const isolate = (node) => {
    const backing = borrowed.get(node)
    if (backing && node.contents?.buffer === backing) node.contents = node.contents.slice()
    borrowed.delete(node)
  }
  return {
    write(path, bytes) {
      if (!(bytes instanceof Uint8Array) || bytes.buffer === HEAPU8.buffer) {
        FS.writeFile(path, bytes)
        return
      }
      FS.writeFile(path, bytes, { canOwn: true })
      const node = FS.lookupPath(path).node
      borrowed.set(node, bytes.buffer)
      if (wrapped.has(node.stream_ops)) return
      const original = node.stream_ops
      const shared = {
        ...original,
        write(stream, buffer, offset, length, position, canOwn) {
          // Open streams can outlive a format replacement. Resolve ownership
          // from the node's current buffer rather than the opening generation.
          if (length > 0) {
            const replaces = canOwn && buffer.buffer !== HEAPU8.buffer
            if (replaces) borrowed.delete(stream.node)
            else isolate(stream.node)
          }
          return original.write(stream, buffer, offset, length, position, canOwn)
        },
        msync(stream, buffer, offset, length, flags) {
          // MEMFS.msync calls its static write operation, bypassing node.write.
          // The syscall layer filters private mappings before reaching MEMFS.
          if (length > 0) isolate(stream.node)
          return original.msync(stream, buffer, offset, length, flags)
        },
      }
      wrapped.add(shared)
      node.stream_ops = shared
    },
  }
})()
