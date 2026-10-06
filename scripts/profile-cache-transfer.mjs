#!/usr/bin/env node
// Authored-controller protocol screening. Allocation volume is not process peak RSS.
import { readFile } from 'node:fs/promises'
import { writeFile } from 'node:fs/promises'
import { createContext, runInContext } from 'node:vm'
import { performance } from 'node:perf_hooks'
import { createHash } from 'node:crypto'
const [baselineDir, candidateDir, output] = process.argv.slice(2)
if (!output) throw Error('Usage: node scripts/profile-cache-transfer.mjs <baseline-year-assets> <candidate-year-assets> <report.json>')
const original = new Uint8Array(2 ** 20).fill(53)
const records = []
const inputs = {}
for (const engine of ['xetex', 'luatex', 'dvipdfm']) {
  const sources = await Promise.all([baselineDir, candidateDir].map(dir => readFile(`${dir}/wasmtex-${engine}.worker.js`, 'utf8')))
  inputs[engine] = sources.map(source => createHash('sha256').update(source).digest('hex'))
  for (let repetition = -1; repetition < 10; repetition++) {
    for (const candidate of (repetition % 2 ? [true,false] : [false,true])) {
      let readBytes = 0
      let extraBytes = 0
      let transferredBytes = 0
      const scope = createContext({ importScripts() {},
        Uint8Array: new Proxy(Uint8Array, {
          construct(target, args) {
            if (typeof args[0] === 'number') extraBytes += args[0]
            return Reflect.construct(target, args)
          },
        }),
        FS: { readFile() { readBytes += original.byteLength; return original.slice() } },
        postMessage(data, transfer) {
          const received = structuredClone(data, { transfer })
          transferredBytes = received.files.reduce((sum, file) => sum + file.data.byteLength, 0)
        },
      })
      scope.self = scope
      runInContext(sources[candidate ? 1 : 0], scope)
      runInContext("for (let index = 0; index < 16; index++) texlive200['47/font' + index + '.otf'] = '/tex/font' + index", scope)
      const start = performance.now()
      runInContext("self.onmessage({data:{cmd:'dumpcache'}})", scope)
      const ms = performance.now() - start
      if (transferredBytes !== 16 * original.byteLength || original.byteLength !== 2 ** 20) throw Error('Cache transfer failed')
      if (repetition >= 0) records.push({ engine, candidate, repetition, ms, readBytes, extraBytes, transferredBytes })
    }
  }
}
await writeFile(output, JSON.stringify({ node: process.version, architecture: process.arch, inputs,
  workload: '16 independently-owned 1MiB MEMFS readFile results; actual authored dumpcache protocol; actual structuredClone transfer',
  limitation: 'Controller mechanism screening, not native MEMFS/full compile/physical peak measurement.', records }, null, 2))
for (const engine of Object.keys(inputs)) for (const candidate of [false,true]) {
  const rows = records.filter(r => r.engine === engine && r.candidate === candidate)
  const times = rows.map(r => r.ms).sort((a,b)=>a-b)
  console.log(JSON.stringify({ engine, candidate, ms: (times[4]+times[5])/2, allocatedMiB: (rows[0].readBytes + rows[0].extraBytes)/2**20 }))
}
