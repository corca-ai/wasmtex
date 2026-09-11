#!/usr/bin/env node
// A correctness expectation, not the optimization comparator: this warning is
// intentionally corrected. Other errors/output remain checked by paired reports.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const paths = process.argv.slice(2)
assert(paths.length > 0, 'Supply one or more recovery report.json files')
for (const path of paths) {
  const report = JSON.parse(readFileSync(path, 'utf8'))
  assert(!report.error, report.error)
  const samples = report.samples.filter((s) => s.measured)
  assert.equal(samples.length, report.repetitions)
  assert(samples.length > 0)
  for (const sample of samples) {
    assert.deepEqual(sample.stages.map((s) => s.stage), ['init', 'first', 'repeat', 'body-edit', 'preamble-edit'])
    for (const stage of sample.stages.slice(1)) {
      assert(stage.success && stage.typesetSha256, `${path}: conversion failed after ${stage.stage}`)
      const warnings = stage.log.split('\n').filter((line) => line.includes('Could not open SFD file:'))
      assert.deepEqual(warnings, stage.stage === 'body-edit' ? [] : ['xdvipdfmx:warning: Could not open SFD file: MissingSFD'])
      assert.match(stage.log, /preloaded format=wasmtex-xetex/)
    }
  }
  console.log(`${path}: PASS (${samples.length} workers, exact warning and recovery)`)
}
