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
const environmentFields = ['schemaVersion', 'year', 'mirror', 'browser', 'node', 'platform', 'architecture', 'harnessSha256', 'sdkRevision', 'project', 'checkpointProbe', 'cacheProbe', 'luaNamesProbe', 'fixedWorkerClock', 'variants', 'repetitions']
const anchor = read(paths[0])
const sideHashes = {}
const sideSdks = {}
for (let pair = 0; pair < paths.length; pair += 2) {
  const baseline = read(paths[pair])
  const candidate = read(paths[pair + 1])
  for (const report of [baseline, candidate]) {
    for (const field of environmentFields) assert.deepEqual(report[field], anchor[field], `Probe mismatch: ${field}`)
  }
  assert.equal(baseline.traceEnabled, false, 'Timing must exclude tracing')
  assert.equal(candidate.traceEnabled, false, 'Timing must exclude tracing')
  for (const [name, digest] of Object.entries(baseline.assetHashes)) {
    if (!/\.(?:js|wasm|fmt|gz)$/.test(name)) continue
    if (/^wasmtex-(?:xetex|luatex|dvipdfm)\.(?:js|wasm|worker\.js)$/.test(name)) continue
    assert.equal(candidate.assetHashes[name], digest, `Unchanged artifact: ${name}`)
  }
  for (const [side, report] of [['baseline', baseline], ['candidate', candidate]]) {
    assert(!report.error, 'Probe failed')
    if (report.schemaVersion >= 2) {
      assert(report.sdkHashes && Object.keys(report.sdkHashes).length > 0, 'Missing actual SDK hashes')
      sideSdks[side] ??= report.sdkHashes
      assert.deepEqual(report.sdkHashes, sideSdks[side], `SDK changed across ${side} series`)
    }
    assert(Number.isInteger(report.repetitions) && report.repetitions > 0, 'Invalid repetitions')
    assert(Array.isArray(report.variants) && report.variants.length > 0 && new Set(report.variants).size === report.variants.length, 'Invalid variants')
    sideHashes[side] ??= report.assetHashes
    assert.deepEqual(report.assetHashes, sideHashes[side], `Assets changed across ${side} series`)
    const measured = report.samples.filter(sample => sample.measured)
    const expected = []
    for (let repetition = 0; repetition < report.repetitions; repetition++) {
      for (const variant of report.variants) expected.push({ variant, repetition })
    }
    assert.deepEqual(measured.map(({ variant, repetition }) => ({ variant, repetition })), expected, 'Incomplete or duplicate samples')
    const stages = ['init', 'first', 'repeat', ...(report.checkpointProbe ? ['prepare-checkpoint'] : []), 'body-edit', 'preamble-edit', ...(report.project?.stages?.restore ? ['restore'] : [])]
    for (const sample of measured) {
      assert.deepEqual(sample.stages.map(stage => stage.stage), stages, 'Incomplete stages')
      for (const stage of sample.stages) {
        const key = `${sample.variant}/${stage.stage}`
        if (report.cacheProbe) {
          assert(Number.isFinite(stage.persistence?.retainedWarmupBytes) && stage.persistence.retainedWarmupBytes >= 0, `Invalid warmup bytes: ${key}`)
          if (stage.stage === 'init') {
            assert(Array.isArray(stage.cacheReadOwnership) && stage.cacheReadOwnership.length === (sample.variant === 'xelatex' ? 2 : 1), 'Missing native cache ownership probe')
            assert(stage.cacheReadOwnership.every(entry => entry.independent === true && Number.isFinite(entry.bytes) && entry.bytes > 0), 'Invalid cache ownership evidence')
            assert(stage.seedCache?.lastPersisted >= 0 && stage.seedCache.downloadCount === stage.seedCache.lastPersisted, 'Seed cache save incomplete')
            assert(stage.returnInitMs > 0 && Number.isFinite(stage.returnInitMs), 'Missing return-init timing')
            const returnKey = `${sample.variant}/return-init`
            const timings = groups[side].get(returnKey) ?? []
            timings.push(stage.returnInitMs)
            groups[side].set(returnKey, timings)
          }
        }
        if (stage.stage !== 'init' && stage.stage !== 'prepare-checkpoint') {
          const output = Object.fromEntries(observables.map(field => [field, stage[field]]))
          if (!references.has(key)) references.set(key, output)
          assert.deepEqual(output, references.get(key), `Output mismatch: ${side} ${key}`)
        }
        assert(Number.isFinite(stage.ms) && stage.ms > 0, `Invalid timing: ${key}`)
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
