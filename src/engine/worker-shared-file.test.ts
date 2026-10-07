import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

function sharedFiles() {
  const heap = new Uint8Array(64)
  const nodes = new Map<string, { contents: Uint8Array; stream_ops: typeof operations }>()
  const operations = {
    write(
      stream: { node: { contents: Uint8Array } },
      input: Uint8Array,
      offset: number,
      length: number,
      position: number,
      canOwn?: boolean,
    ) {
      if (length === 0) return 0
      if (canOwn && input.buffer !== heap.buffer)
        stream.node.contents = input.subarray(offset, offset + length)
      else stream.node.contents.set(input.subarray(offset, offset + length), position)
      return length
    },
    msync(
      stream: { node: { contents: Uint8Array } },
      input: Uint8Array,
      offset: number,
      length: number,
      flags: number,
    ) {
      // The actual MEMFS implementation bypasses node.stream_ops.write.
      void flags
      operations.write(stream, input, 0, length, offset, false)
      return 0
    },
  }
  const FS = {
    writeFile(path: string, bytes: Uint8Array, options?: { canOwn?: boolean }) {
      let node = nodes.get(path)
      if (!node) {
        node = { contents: new Uint8Array(bytes.length), stream_ops: operations }
        nodes.set(path, node)
      }
      node.stream_ops.write({ node }, bytes, 0, bytes.length, 0, options?.canOwn)
    },
    lookupPath(path: string) {
      return { node: nodes.get(path)! }
    },
  }
  const scope = createContext({ FS, HEAPU8: heap, Uint8Array, WeakMap, WeakSet })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/shared-file.js', import.meta.url), 'utf8'),
    scope,
  )
  return {
    heap,
    nodes,
    write: (path: string, bytes: Uint8Array) => scope.wasmtexSharedFiles.write(path, bytes),
  }
}

describe('shared engine file storage', () => {
  it('shares immutable bytes and isolates a partial write from aliases and retained source', () => {
    const { write, nodes } = sharedFiles()
    const bytes = new Uint8Array([1, 2, 3, 4])
    write('/tex/font.otf', bytes)
    write('/tex/font', bytes)
    const font = nodes.get('/tex/font')!,
      alias = nodes.get('/tex/font.otf')!
    expect(font.contents.buffer).toBe(bytes.buffer)
    expect(alias.contents.buffer).toBe(bytes.buffer)
    font.stream_ops.write({ node: font }, new Uint8Array([9]), 0, 1, 2)
    expect(font.contents).toEqual(new Uint8Array([1, 2, 9, 4]))
    expect(alias.contents).toEqual(bytes)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]))
    expect(font.contents.buffer).not.toBe(bytes.buffer)
  })
  it.each([0, 2])('mmap writeback isolates aliases with MEMFS flags %s', (flags) => {
    const { write, nodes } = sharedFiles()
    const bytes = new Uint8Array([1, 2, 3, 4])
    write('/tex/font.otf', bytes)
    write('/tex/font', bytes)
    const font = nodes.get('/tex/font')!,
      alias = nodes.get('/tex/font.otf')!
    expect(font.stream_ops.msync({ node: font }, new Uint8Array([7]), 1, 1, flags)).toBe(0)
    expect(font.contents).toEqual(new Uint8Array([1, 7, 3, 4]))
    expect(alias.contents).toEqual(bytes)
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]))
  })
  it('no-op writes keep ownership protected for the next actual write', () => {
    const { write, nodes } = sharedFiles()
    const bytes = new Uint8Array([1, 2, 3])
    write('/tex/pdflatex.fmt', bytes)
    const node = nodes.get('/tex/pdflatex.fmt')!
    node.stream_ops.write({ node }, new Uint8Array(0), 0, 0, 0, true)
    node.stream_ops.write({ node }, new Uint8Array(0), 0, 0, 0, false)
    node.stream_ops.write({ node }, new Uint8Array([9]), 0, 1, 1)
    expect(node.contents).toEqual(new Uint8Array([1, 9, 3]))
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
  })
  it('an already-open writer isolates a replacement generation without stacking wrappers', () => {
    const { write, nodes } = sharedFiles()
    write('/tex/pdflatex.fmt', new Uint8Array([1, 2, 3]))
    const node = nodes.get('/tex/pdflatex.fmt')!,
      opened = { node },
      operations = node.stream_ops
    const replacement = new Uint8Array([4, 5, 6])
    for (let i = 0; i < 100; i++) write('/tex/pdflatex.fmt', replacement)
    expect(node.stream_ops).toBe(operations)
    operations.write(opened, new Uint8Array([8]), 0, 1, 1)
    expect(node.contents).toEqual(new Uint8Array([4, 8, 6]))
    expect(replacement).toEqual(new Uint8Array([4, 5, 6]))
  })
  it('does not borrow WASM heap storage even when a replacing writer requests ownership', () => {
    const { write, nodes, heap } = sharedFiles()
    const original = new Uint8Array([1, 2, 3])
    write('/tex/pdflatex.fmt', original)
    heap.set([6, 7, 8])
    write('/tex/pdflatex.fmt', heap.subarray(0, 3))
    expect(nodes.get('/tex/pdflatex.fmt')!.contents.buffer).not.toBe(heap.buffer)
    expect(original).toEqual(new Uint8Array([1, 2, 3]))
    write('/tex/pdflatex.fmt', original)
    const node = nodes.get('/tex/pdflatex.fmt')!
    node.stream_ops.write({ node }, heap, 0, 3, 0, true)
    expect(node.contents).toEqual(new Uint8Array([6, 7, 8]))
    expect(original).toEqual(new Uint8Array([1, 2, 3]))
  })
})
