import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { prepareEngineSourceCandidate } from './prepare-engine-source-candidate.mjs'

const components = JSON.parse(readFileSync(new URL('./engine-release-components.json', import.meta.url)))
for (const year of ['2025', '2026']) {
  const license = JSON.parse(readFileSync(new URL(`../public/wasmtex/${year}/LICENSE-MANIFEST.json`, import.meta.url)))
  test(`${year}: candidate changes only paired engines and explicitly removes stale source clearance`, () => {
    const original = structuredClone({ components, license })
    const result = prepareEngineSourceCandidate(components, license, year, '123456789')
    const expected = structuredClone(components)
    expected.years[year].downloads.find((entry) => entry.id === 'pdftex-bibtex').runId = 123456789
    assert.deepEqual(result.components, expected)
    assert.equal(result.license.releaseStatus, 'development-only')
    assert.equal(result.license.correspondingSource, undefined)
    assert.ok(result.license.releaseBlockers.length > 0)
    const { releaseStatus, releaseBlockers, correspondingSource, ...rest } = license
    assert.deepEqual(result.license, { ...rest, releaseStatus: 'development-only', releaseBlockers: result.license.releaseBlockers })
    assert.deepEqual({ components, license }, original)
  })
}

test('a LuaHBTeX candidate replaces only its own download, alone or with pdfTeX', () => {
  const license = JSON.parse(readFileSync(new URL('../public/wasmtex/2026/LICENSE-MANIFEST.json', import.meta.url)))
  const runOf = (result, id) => result.components.years['2026'].downloads.find((entry) => entry.id === id).runId
  const pinned = (id) => components.years['2026'].downloads.find((entry) => entry.id === id).runId
  const lua = prepareEngineSourceCandidate(components, license, '2026', undefined, '987654321', ['luahbtex'])
  assert.equal(runOf(lua, 'luahbtex'), 987654321)
  assert.equal(runOf(lua, 'pdftex-bibtex'), pinned('pdftex-bibtex'))
  const both = prepareEngineSourceCandidate(components, license, '2026', '123456789', '987654321', ['luahbtex'])
  assert.equal(runOf(both, 'pdftex-bibtex'), 123456789)
  assert.equal(runOf(both, 'luahbtex'), 987654321)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', undefined, 'x'), /luatex run/)
})

test('a new run keeps its format reused unless the release rebuilds it', () => {
  const license = JSON.parse(readFileSync(new URL('../public/wasmtex/2026/LICENSE-MANIFEST.json', import.meta.url)))
  const reuse = { family: 'luahbtex', runId: 1, artifact: 'wasm-luatex-2026' }
  const pinned = structuredClone(components)
  pinned.years['2026'].reusedFormats = pinned.years['2026'].reusedFormats.filter(entry => entry.family !== 'luahbtex')
  const withoutReuse = structuredClone(pinned)
  pinned.years['2026'].reusedFormats.push(reuse)
  const families = (result) => result.components.years['2026'].reusedFormats.map((entry) => entry.family)

  const kept = prepareEngineSourceCandidate(pinned, license, '2026', undefined, '987654321')
  assert.deepEqual(families(kept), ['pdftex', 'xetex', 'luahbtex'])
  const rebuilt = prepareEngineSourceCandidate(pinned, license, '2026', undefined, '987654321', ['luahbtex'])
  assert.deepEqual(families(rebuilt), ['pdftex', 'xetex'])

  assert.throws(
    () => prepareEngineSourceCandidate(withoutReuse, license, '2026', undefined, '987654321'),
    /would change its format bytes/,
  )
  assert.doesNotThrow(
    () => prepareEngineSourceCandidate(components, license, '2026', undefined, '987654321', ['luahbtex']),
  )
  assert.throws(
    () => prepareEngineSourceCandidate(pinned, license, '2026', '123456789', undefined, ['luahbtex']),
    /needs a new run/,
  )
  assert.throws(
    () => prepareEngineSourceCandidate(pinned, license, '2026', undefined, '987654321', ['xetex']),
    /needs a new run/,
  )
})

test('rejects malformed years, unsafe runs, annual mismatch and invalid component catalogs', () => {
  const license = { texliveVersion: '2026' }
  for (const run of ['', '0', '-1', '1.5', '1e3', '9007199254740992', '$(echo bad)', undefined]) {
    assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', run), /positive safe integer/)
  }
  assert.throws(() => prepareEngineSourceCandidate(components, license, '../2026', '123'), /unsupported/)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2025', '123'), /mismatch/)
  assert.throws(() => prepareEngineSourceCandidate({}, license, '2026', '123'), /schemaVersion/)
  const conflicting = String(components.years['2026'].downloads.find((entry) => entry.id === 'xetex').runId)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', conflicting), /five independently/)
})


test('all worker families can be sourced together without changing mirror or formats', () => {
  const license = { texliveVersion: '2026' }
  const result = prepareEngineSourceCandidate(components, license, '2026', '101', '102', [], { xetex: '103', bibtex8: '104', makeindex: '105' })
  const release = result.components.years['2026']
  assert.deepEqual(release.downloads.map(x => x.runId).sort(), [101, 102, 103, 104, 105])
  assert.deepEqual(release.reusedFormats, components.years['2026'].reusedFormats)
  assert.deepEqual(release.mirror, components.years['2026'].mirror)
  assert.equal(result.license.releaseStatus, 'development-only')
  assert.equal(result.license.correspondingSource, undefined)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', undefined, undefined, [], { xetex: 'invalid' }), /positive safe integer/)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', undefined, undefined, [], { unknown: '123' }), /unknown candidate family/)
  assert.throws(() => prepareEngineSourceCandidate(components, license, '2026', undefined, undefined, ['bibtex8'], { bibtex8: '123' }), /needs a new run/)
})
