import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const fixture = () => ({
  schemaVersion: 1, repetitions: 3, variants: ['xelatex'], sdkRevision: 'same', year: '2026', mirror: 'https://mirror.test/2026/', browser: 'test-browser',
  node: 'v24', platform: 'linux', architecture: 'x64', harnessSha256: 'same',
  project: null, checkpointProbe: false, fixedWorkerClock: true, traceEnabled: false,
  assetHashes: { 'wasmtex-xetex.wasm': 'engine', 'wasmtex-xetex.fmt.gz': 'format', 'wasmtex-pdftex.wasm': 'pdftex' },
  samples: [10, 20, 30].map((ms, repetition) => ({ measured: true, variant: 'xelatex', repetition, stages: ['init', 'first', 'repeat', 'body-edit', 'preamble-edit'].map(stage => ({ stage, ms, success: true, typesetSha256: 'pdf', artifacts: { aux: 'aux', synctex: 'sync' }, log: 'stable', errors: [] })) })),
})
function compare(...reports) {
  const root = mkdtempSync(join(tmpdir(), 'heap-report-test-'))
  try {
    const paths = reports.map((value, index) => {
      const path = join(root, `${index}.json`)
      writeFileSync(path, JSON.stringify(value))
      return path
    })
    return JSON.parse(execFileSync(process.execPath, ['scripts/compare-heap-growth-reports.mjs', ...paths], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('reports median and spread while accepting a rebuilt Unicode core', () => {
  const after = fixture()
  after.assetHashes['wasmtex-xetex.wasm'] = 'rebuilt'
  for (const sample of after.samples) sample.stages[0].ms *= 0.9
  const report = compare(fixture(), after)
  assert.equal(report.outputPreserved, true)
  assert.equal(report.comparisons[0].baselineMedianMs, 20)
  assert.equal(report.comparisons[0].candidateMedianMs, 18)
  assert.deepEqual(report.comparisons[0].candidateRangeMs, [9, 27])
})
for (const [name, mutate] of [
  ['PDF difference', report => { report.samples[0].stages[1].typesetSha256 = 'changed' }],
  ['SyncTeX difference', report => { report.samples[0].stages[1].artifacts.synctex = 'changed' }],
  ['format replacement', report => { report.assetHashes['wasmtex-xetex.fmt.gz'] = 'changed' }],
  ['unrelated engine replacement', report => { report.assetHashes['wasmtex-pdftex.wasm'] = 'changed' }],
  ['different workload', report => { report.project = { files: { 'main.tex': 'different' } } }],
  ['traced latency', report => { report.traceEnabled = true }],
  ['failed report', report => { report.error = 'timeout' }],
  ['zero timing', report => { report.samples[0].stages[0].ms = 0 }],
  ['missing stage', report => { report.samples[0].stages.pop() }],
  ['duplicate repetition', report => { report.samples[1].repetition = 0 }],
  ['partial measurement', report => { report.samples.pop() }],
  ['empty measurement', report => { report.samples = [] }],
]) {
  test(`rejects ${name} even with faster candidate timings`, () => {
    const after = fixture()
    for (const sample of after.samples) sample.stages[0].ms = 1
    mutate(after)
    assert.throws(() => compare(fixture(), after))
  })
}

for (const [name, mutate] of [
  ['environment', report => { report.browser = 'changed' }],
  ['candidate assets', report => { report.assetHashes['wasmtex-xetex.wasm'] = 'changed' }],
]) {
  test(`rejects ${name} changing between pairs`, () => {
    const before2 = fixture(), after2 = fixture()
    if (name === 'environment') mutate(before2)
    mutate(after2)
    assert.throws(() => compare(fixture(), fixture(), before2, after2))
  })
}
