import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildRunsFor,
  resolveEngineBuildMirror,
  validateComposedEngineRelease,
  validateEngineReleaseComponents,
} from './lib/engine-release-components.mjs'

const config = JSON.parse(
  readFileSync(resolve(import.meta.dirname, 'engine-release-components.json'), 'utf8'),
)

test('pins one exact workflow run for every annual artifact family', () => {
  for (const year of ['2025', '2026']) {
    const release = validateEngineReleaseComponents(config, year)
    assert.equal(release.downloads.length, 5)
    assert.equal(Object.keys(buildRunsFor(release)).length, 5)
  }
})

test('builds default to the promoted mirror and require a complete candidate override', () => {
  const release = validateEngineReleaseComponents(config, '2026')
  assert.equal(resolveEngineBuildMirror(release, '2026'), release.mirror)
  assert.throws(
    () => resolveEngineBuildMirror(release, '2026', { revision: release.mirror.revision }),
    /must provide URL, revision, and provenance together/,
  )
  assert.throws(
    () =>
      resolveEngineBuildMirror(release, '2026', {
        ...release.mirror,
        url: 'https://texlive.corca.ai/snapshots/2026-0000000000000000/2026/',
      }),
    /URL does not contain its immutable identity/,
  )
})

test('requires every composed receipt to bind the pinned mirror', () => {
  const release = validateEngineReleaseComponents(config, '2026')
  const receipts = ['pdftex', 'bibtex', 'bibtex8', 'makeindex', 'xetex', 'luahbtex'].map(
    (family) => ({ name: `BUILD-RECEIPT.${family}.json`, value: { family, mirror: release.mirror } }),
  )
  assert.deepEqual(validateComposedEngineRelease({ receipts }, release), [])
  receipts[0].value.mirror = { ...release.mirror, revision: '2026-0000000000000000' }
  assert.match(
    validateComposedEngineRelease({ receipts }, release).join('\n'),
    /receipt mirror does not match the pinned release mirror/,
  )
})

test('pins reused formats separately and rejects cross-year or duplicate origins', () => {
  const candidate = structuredClone(config)
  candidate.years['2026'].reusedFormats = [{ family: 'xetex', runId: 1, artifact: 'wasm-xetex-2026' }]
  assert.doesNotThrow(() => validateEngineReleaseComponents(candidate, '2026'))
  candidate.years['2026'].reusedFormats[0].artifact = 'wasm-xetex'
  assert.throws(() => validateEngineReleaseComponents(candidate, '2026'), /format workflow/)
  candidate.years['2026'].reusedFormats[0].artifact = 'wasm-xetex-2026'
  candidate.years['2026'].reusedFormats.push({ ...candidate.years['2026'].reusedFormats[0] })
  assert.throws(() => validateEngineReleaseComponents(candidate, '2026'), /duplicate reused format/)
})
