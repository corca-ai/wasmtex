#!/usr/bin/env node
// Preserve raw traces; this report lists sampled stacks, not exact CPU timers.
import { readFileSync } from 'node:fs'
const files = process.argv.slice(2)
if (!files.length) throw Error('Usage: node scripts/summarize-font-profile.mjs TRACE.json ...')
const reports = []
for (const file of files) {
  const { traceEvents } = JSON.parse(readFileSync(file, 'utf8'))
  const profiles = new Map()
  for (const event of traceEvents) {
    if (event.name !== 'ProfileChunk') continue
    const key = `${event.pid}:${event.id}`
    const data = event.args.data
    const profile = profiles.get(key) || { pid: event.pid, tid: event.tid, nodes: new Map(), samples: [] }
    profiles.set(key, profile)
    for (const node of data.cpuProfile?.nodes || []) profile.nodes.set(node.id, node)
    for (let i = 0; i < (data.cpuProfile?.samples?.length || 0); i++) {
      profile.samples.push({ id: data.cpuProfile.samples[i], delta: data.timeDeltas?.[i] ?? 0 })
    }
  }
  const summaries = []
  for (const [key, profile] of profiles) {
    const functions = new Map()
    const lookup = (node) => {
      const f = node.callFrame
      const key = `${f.url || ''}:${f.functionName}:${f.lineNumber}:${f.columnNumber}`
      let result = functions.get(key)
      if (!result) {
        result = { ...f, selfSamples: 0, inclusiveSamples: 0, sampledDeltaUs: 0 }
        functions.set(key, result)
      }
      return result
    }
    for (const sample of profile.samples) {
      let node = profile.nodes.get(sample.id)
      if (!node) throw Error(`Missing sampled node ${sample.id}: ${file}`)
      const self = lookup(node)
      self.selfSamples++
      self.sampledDeltaUs += sample.delta
      const visited = new Set()
      const countedFunctions = new Set()
      while (node && !visited.has(node.id)) {
        visited.add(node.id)
        const frame = lookup(node)
        if (!countedFunctions.has(frame)) frame.inclusiveSamples++
        countedFunctions.add(frame)
        node = profile.nodes.get(node.parent)
      }
    }
    summaries.push({ key, pid: profile.pid, tid: profile.tid, samples: profile.samples.length,
      functions: [...functions.values()].sort((a, b) => b.selfSamples - a.selfSamples),
    })
  }
  reports.push({ file, profiles: summaries })
}
console.log(JSON.stringify({
  caveat: 'Sampling counts/deltas include scheduling and profiler effects; inclusive frames overlap. Font classification requires reading the named routine and its callers. Lua interpreter samples do not identify the Lua routine.',
  reports,
}, null, 2))
