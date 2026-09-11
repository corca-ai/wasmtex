#!/usr/bin/env node
// Compare one or more alternating baseline/candidate report pairs. No goldens
// are updated: any observable mismatch fails, independently of speedup.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const paths = process.argv.slice(2)
if (!paths.length || paths.length % 2) throw Error('Usage: compare-fontmap-reports.mjs baseline.json candidate.json [baseline.json candidate.json ...]')
const timings = new Map()
let compiles = 0
for (let i = 0; i < paths.length; i += 2) {
  const [baseline, candidate] = paths.slice(i, i + 2).map((path) => JSON.parse(readFileSync(path, 'utf8')))
  assert(!baseline.error && !candidate.error, 'Incomplete experiment')
  for (const field of ['year', 'mirror', 'browser', 'node', 'platform', 'architecture', 'harnessSha256', 'project']) {
    assert.deepEqual(candidate[field], baseline[field], `Different ${field}`)
  }
  assert.equal(baseline.traceEnabled, false, 'Performance comparison requires tracing disabled')
  assert.equal(candidate.traceEnabled, false)
  const engineFiles = (report) => Object.keys(report.assetHashes).filter((name) => /\.(js|wasm|fmt|gz)$/.test(name)).sort()
  assert.deepEqual(engineFiles(candidate), engineFiles(baseline), 'Engine file inventory changed')
  let formats = 0
  for (const [name, hash] of Object.entries(baseline.assetHashes)) {
    if (!/\.(js|wasm|fmt|gz)$/.test(name) || /^wasmtex-dvipdfm\.(js|wasm)$/.test(name)) continue
    assert.equal(candidate.assetHashes[name], hash, `Unaffected artifact changed: ${name}`)
    if (/xetex\.fmt(?:\.gz)?$/.test(name)) formats++
  }
  assert(formats > 0, 'Baseline XeTeX format missing')
  const before = baseline.samples.filter((sample) => sample.measured)
  const after = candidate.samples.filter((sample) => sample.measured)
  assert(before.length > 0, 'No measured samples')
  assert.equal(before.length, baseline.repetitions, 'Incomplete baseline')
  assert.equal(after.length, candidate.repetitions, 'Incomplete candidate')
  assert.equal(after.length, before.length)
  for (let j = 0; j < before.length; j++) {
    assert.equal(after[j].variant, 'xelatex')
    assert.equal(before[j].variant, 'xelatex')
    assert.deepEqual(before[j].stages.map((s) => s.stage), ['init', 'first', 'repeat', 'body-edit', 'preamble-edit'])
    assert.equal(after[j].stages.length, before[j].stages.length)
    for (let k = 0; k < before[j].stages.length; k++) {
      const a = before[j].stages[k], b = after[j].stages[k]
      assert.equal(b.stage, a.stage)
      for (const field of ['success', 'typesetSha256', 'pdfBytes', 'artifacts', 'synctexPresent', 'errors', 'diagnostics', 'geometry', 'log', 'dependencies', 'pdfConversionInputs', 'glyphCoverage']) {
        assert.deepEqual(b[field], a[field], `${paths[i + 1]} ${j}/${a.stage}: changed ${field}`)
      }
      const requests = (stage) => stage.requests.map(({ url, status }) => ({ url, status }))
      assert.deepEqual(requests(b), requests(a), `Changed file requests: ${a.stage}`)
      for (const stage of [a, b]) {
        assert(!stage.requests.some((r) => r.error || ['upstream', 'blocked-miss'].includes(r.source)))
        if (stage.stage !== 'init') assert.match(stage.log, /preloaded format=wasmtex-xetex/, 'Base format was not used')
      }
      if (a.stage !== 'init') compiles++
      const key = `${baseline.year}/${a.stage}`
      const rows = timings.get(key) || []
      rows.push({ baselineMs: a.ms, candidateMs: b.ms,
        baselineConversionMs: (a.conversionMs || []).reduce((x, y) => x + y, 0),
        candidateConversionMs: (b.conversionMs || []).reduce((x, y) => x + y, 0) })
      timings.set(key, rows)
    }
  }
}
const median = (values) => {
  const ordered = values.toSorted((a, b) => a - b), middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}
const summary = Object.fromEntries([...timings].map(([stage, rows]) => {
  const b = median(rows.map((r) => r.baselineMs)), c = median(rows.map((r) => r.candidateMs))
  const bd = median(rows.map((r) => r.baselineConversionMs)), cd = median(rows.map((r) => r.candidateConversionMs))
  return [stage, { samples: rows.length, baselineMs: b, candidateMs: c, improvementPercent: 100 * (b - c) / b,
    baselineConversionMs: bd, candidateConversionMs: cd, conversionImprovementPercent: bd ? 100 * (bd - cd) / bd : null }]
}))
console.log(JSON.stringify({ compatibleCompiles: compiles, summary }, null, 2))
