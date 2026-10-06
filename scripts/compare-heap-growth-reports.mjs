#!/usr/bin/env node
// Compare alternating baseline/candidate browser probes, including binary inputs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const paths = process.argv.slice(2)
assert(paths.length >= 2 && paths.length % 2 === 0, 'Pass alternating baseline/candidate report pairs')
const groups = { baseline: new Map(), candidate: new Map() }
const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const observables = [
  'success', 'typesetSha256', 'pdfBytes', 'artifacts', 'synctexPresent', 'errors',
  'diagnostics', 'geometry', 'dependencies', 'pdfConversionInputs', 'glyphCoverage', 'log',
]
const read = path => JSON.parse(readFileSync(path, 'utf8'))
const references = new Map()
for (let pair = 0; pair < paths.length; pair += 2) {
  const baseline = read(paths[pair])
  const candidate = read(paths[pair + 1])
  for (const field of ['year', 'mirror', 'browser', 'node', 'platform', 'architecture', 'harnessSha256', 'project', 'checkpointProbe', 'fixedWorkerClock']) {
    assert.deepEqual(candidate[field], baseline[field], `Probe mismatch: ${field}`)
  }
  assert.equal(baseline.traceEnabled, false, 'Timing must exclude tracing')
  assert.equal(candidate.traceEnabled, false, 'Timing must exclude tracing')
  for (const [name, digest] of Object.entries(baseline.assetHashes)) {
    if (!/\.(?:js|wasm|fmt|gz)$/.test(name)) continue
    if (/^wasmtex-(?:xetex|luatex|dvipdfm)\.(?:js|wasm|worker\.js)$/.test(name)) continue
    assert.equal(candidate.assetHashes[name], digest, `Unchanged artifact: ${name}`)
  }
  for (const [side, report] of [['baseline', baseline], ['candidate', candidate]]) {
    const measured = report.samples.filter(sample => sample.measured)
    assert(measured.length > 0, 'No measured samples')
    for (const sample of measured) {
      for (const stage of sample.stages) {
        const key = `${sample.variant}/${stage.stage}`
        if (stage.stage !== 'init' && stage.stage !== 'prepare-checkpoint') {
          const output = Object.fromEntries(observables.map(field => [field, stage[field]]))
          if (!references.has(key)) references.set(key, output)
          assert.deepEqual(output, references.get(key), `Output mismatch: ${side} ${key}`)
        }
        assert(Number.isFinite(stage.ms) && stage.ms >= 0, `Invalid timing: ${key}`)
        const timings = groups[side].get(key) ?? []
        timings.push(stage.ms)
        groups[side].set(key, timings)
      }
    }
  }
  assert.deepEqual([...groups.candidate.keys()], [...groups.baseline.keys()], 'Different stages')
}
const comparisons = [...groups.baseline].map(([stage, before]) => {
  const after = groups.candidate.get(stage)
  assert.equal(after.length, before.length, `Different sample counts: ${stage}`)
  const baselineMedianMs = median(before)
  const candidateMedianMs = median(after)
  return {
    stage, samplesPerSide: before.length, baselineMedianMs, candidateMedianMs,
    changePercent: (candidateMedianMs / baselineMedianMs - 1) * 100,
    baselineRangeMs: [Math.min(...before), Math.max(...before)],
    candidateRangeMs: [Math.min(...after), Math.max(...after)],
  }
})
console.log(JSON.stringify({ outputPreserved: true, comparisons }, null, 2))
