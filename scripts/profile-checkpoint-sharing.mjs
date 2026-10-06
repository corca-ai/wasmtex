#!/usr/bin/env node
// Diagnostic screening only: exact-byte sharing versus copying browser-style
// checkpoint buffers. No WASM format, live checkpoint, or release is changed.
import { writeFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'
const out = process.argv[2]
if (!out) throw Error('Usage: node scripts/profile-checkpoint-sharing.mjs <report.json>')
function equal(a, b) {
  if (!b || a.length !== b.length) return false
  const x = new Uint32Array(a.buffer, a.byteOffset, a.length >>> 2)
  const y = new Uint32Array(b.buffer, b.byteOffset, b.length >>> 2)
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false
  for (let i = x.length * 4; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}
const heap = new Uint8Array(64 * 2 ** 20).fill(37)
const image = new Uint8Array(32 * 2 ** 20).fill(51)
const samples = []
for (let repetition = -1; repetition < 12; repetition++) {
  for (const sharing of (repetition % 2 ? [true, false] : [false, true])) {
    const held = []
    const times = []
    for (let index = 0; index < 4; index++) {
      // Dirty one occupied page as real TeX state changes across boundaries.
      heap[index * 65536]++
      const previous = held.at(-1)
      const start = performance.now()
      const pages = []
      for (let at = 0; at < heap.length; at += 65536) {
        const page = heap.subarray(at, at + 65536)
        const old = previous?.pages[at / 65536]
        pages.push(sharing && equal(page, old) ? old : page.slice())
      }
      const file = sharing && equal(image, previous?.file) ? previous.file : image.slice()
      times.push(performance.now() - start)
      held.push({ pages, file })
    }
    const buffers = new Set(held.flatMap(snapshot => [...snapshot.pages, snapshot.file]))
    if (repetition >= 0) samples.push({ repetition, sharing, times, uniqueBytes: [...buffers].reduce((sum, buffer) => sum + buffer.byteLength, 0) })
  }
}
const median = values => values.sort((a,b) => a-b)[Math.floor(values.length / 2)]
const summary = [false,true].map(sharing => {
  const selected = samples.filter(s => s.sharing === sharing)
  return { sharing, captureMs: median(selected.flatMap(s => s.times)),
    uniqueMiB: median(selected.map(s => s.uniqueBytes / 2 ** 20)) }
})
const report = { node: process.version, architecture: process.arch, workload: 'four 64MiB occupied heap + 32MiB stable file snapshots; exact-byte comparisons; one page changes per boundary', samples, summary,
  limitation: 'Mechanism screening under Node V8, not end-to-end engine or Safari evidence.' }
await writeFile(out, JSON.stringify(report, null, 2))
console.log(JSON.stringify(summary))
