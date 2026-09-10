import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import test from 'node:test'
import { createBuildReceipt } from './lib/engine-build-receipt.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const config = JSON.parse(readFileSync(join(root, 'scripts/corresponding-source-2026.json')))
const sourcePin = readFileSync(join(root, config.texliveSource.commitFile), 'utf8').trim()
const mirror = JSON.parse(readFileSync(join(root, 'scripts/engine-release-components.json'))).years['2026'].mirror
const beforeCommit = '1'.repeat(40)
const afterCommit = '2'.repeat(40)
const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])
const candidateWasm = Buffer.concat([wasm, Buffer.from([0, 2, 1, 120])])

function fixture(t, change = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'wasmtex-stage-qualification-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const baseline = join(directory, 'baseline')
  const output = join(directory, 'output')
  mkdirSync(baseline)
  for (const family of ['xetex', 'luahbtex']) {
    const candidate = join(directory, family)
    mkdirSync(candidate)
    const binary = family === 'xetex' ? 'xetex' : 'luatex'
    for (const [destination, updated] of [[baseline, false], [candidate, true]]) {
      const files = {
        [`wasmtex-${binary}.wasm`]: updated ? candidateWasm : wasm,
        [`wasmtex-${binary}.js`]: updated ? 'new glue' : 'old glue',
        [`wasmtex-${binary}.worker.js`]: 'authored controller',
        [`wasmtex-${binary}.fmt.gz`]: gzipSync(updated ? 'newly generated format' : 'original format'),
      }
      for (const [name, bytes] of Object.entries(files)) writeFileSync(join(destination, name), bytes)
      const receipt = createBuildReceipt({
        family, directory: destination, filenames: Object.keys(files), config,
        sourceRevision: updated ? (change.source ?? afterCommit) : beforeCommit,
        texliveSourceCommit: updated ? (change.pin ?? sourcePin) : sourcePin,
        mirror: updated ? (change.mirror ?? mirror) : mirror,
      })
      writeFileSync(join(destination, `BUILD-RECEIPT.${family}.json`), JSON.stringify(receipt))
    }
  }
  writeFileSync(join(baseline, 'manifest.json'), '{"oldRelease":true}')
  writeFileSync(join(baseline, 'LICENSE-MANIFEST.json'), '{"oldRelease":true}')
  return {
    baseline,
    candidate: join(directory, 'xetex'),
    staged: join(output, 'wasmtex/2026'),
    run: (families = ['xetex', 'luahbtex']) => spawnSync(process.execPath, [
      join(root, 'scripts/stage-unicode-qualification.mjs'),
      '--year', '2026', '--source', afterCommit, '--baseline', baseline,
      ...families.flatMap(family => [`--${family}`, join(directory, family)]),
      '--output-public', output,
    ], { encoding: 'utf8' }),
  }
}

test('stages new source-built engines with the original format bytes and provenance', t => {
  const f = fixture(t)
  const result = f.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readFileSync(join(f.staged, 'wasmtex-xetex.wasm')), candidateWasm)
  const format = 'wasmtex-xetex.fmt.gz'
  assert.deepEqual(readFileSync(join(f.staged, format)), readFileSync(join(f.baseline, format)))
  assert.notDeepEqual(readFileSync(join(f.staged, format)), readFileSync(join(f.candidate, format)))
  assert(!existsSync(join(f.staged, 'manifest.json')))
  assert(!existsSync(join(f.staged, 'BUILD-RECEIPT.xetex.json')))
  const provenance = JSON.parse(readFileSync(join(f.staged, 'QUALIFICATION-INPUTS.json')))
  assert.equal(provenance.releaseQualified, false)
  assert.equal(provenance.compositions[0].baselineReceipt.sourceRevision, beforeCommit)
  assert.equal(provenance.compositions[0].sourceBuildReceipt.sourceRevision, afterCommit)
})

test('can qualify one built family while retaining the untouched baseline family', t => {
  const f = fixture(t)
  const result = f.run(['luahbtex'])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(readFileSync(join(f.staged, 'wasmtex-luatex.wasm')), candidateWasm)
  assert.deepEqual(readFileSync(join(f.staged, 'wasmtex-xetex.wasm')), wasm)
  assert.deepEqual(readFileSync(join(f.staged, 'BUILD-RECEIPT.xetex.json')),
    readFileSync(join(f.baseline, 'BUILD-RECEIPT.xetex.json')))
})

for (const [name, change] of Object.entries({
  'wrong candidate commit': { source: '3'.repeat(40) },
  'different source pin': { pin: '4'.repeat(40) },
  'different mirror': { mirror: { ...mirror, provenanceSha256: '5'.repeat(64) } },
})) {
  test(`rejects ${name} before creating output`, t => {
    const f = fixture(t, change)
    assert.notEqual(f.run().status, 0)
    assert(!existsSync(f.staged))
  })
}

test('rejects altered build bytes before creating output', t => {
  const f = fixture(t)
  writeFileSync(join(f.candidate, 'wasmtex-xetex.wasm'), wasm)
  assert.notEqual(f.run().status, 0)
  assert(!existsSync(f.staged))
})

test('refuses to overwrite an existing asset directory', t => {
  const f = fixture(t)
  mkdirSync(f.staged, { recursive: true })
  writeFileSync(join(f.staged, 'sentinel'), 'keep')
  assert.notEqual(f.run().status, 0)
  assert.equal(readFileSync(join(f.staged, 'sentinel'), 'utf8'), 'keep')
})
