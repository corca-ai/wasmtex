import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createBuildReceipt } from './lib/engine-build-receipt.mjs'

test('same-origin format reuse preserves exact receipt bytes and still verifies artifacts', () => {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-same-origin-format-'))
  try {
    const assets = join(root, 'assets'), formats = join(root, 'formats')
    mkdirSync(assets)
    const names = ['engine.js', 'engine.wasm', 'engine.fmt']
    for (const name of names) writeFileSync(join(assets, name), name)
    const config = JSON.parse(readFileSync(new URL('./corresponding-source-2025.json', import.meta.url)))
    const components = JSON.parse(readFileSync(new URL('./engine-release-components.json', import.meta.url)))
    const receipt = createBuildReceipt({ family: 'luahbtex', directory: assets, filenames: names,
      sourceRevision: '1'.repeat(40), texliveSourceCommit: '2'.repeat(40), mirror: components.years['2025'].mirror, config })
    const file = 'BUILD-RECEIPT.luahbtex.json'
    const bytes = JSON.stringify(receipt, null, 4) + '\n'
    writeFileSync(join(assets, file), bytes)
    cpSync(assets, formats, { recursive: true })
    const run = () => spawnSync(process.execPath, ['scripts/reuse-engine-formats.mjs', '--year', '2025', '--assets', assets, '--formats', formats, '--family', 'luahbtex'], { encoding: 'utf8' })
    const valid = run()
    assert.equal(valid.status, 0, valid.stderr)
    assert.equal(readFileSync(join(assets, file), 'utf8'), bytes)
    writeFileSync(join(formats, 'engine.fmt'), 'corrupt')
    assert.notEqual(run().status, 0)
    assert.equal(readFileSync(join(assets, file), 'utf8'), bytes)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
