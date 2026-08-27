import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const value = JSON.parse(readFileSync(resolve(root, 'scripts/texlive-profiles-2026.json'), 'utf8'))
const licenseManifest = JSON.parse(
  readFileSync(resolve(root, 'public/wasmtex/2026/LICENSE-MANIFEST.json'), 'utf8'),
)
const sha256 = /^[a-f0-9]{64}$/
const releaseId = /^2026-[a-f0-9]{16}$/
const revision = /^2026-[a-f0-9]{16}$/

test('2026 profiles expose only exact immutable mirror and engine identities', () => {
  assert.equal(value.schemaVersion, 1)
  assert.equal(value.texliveYear, '2026')
  assert.deepEqual(
    value.profiles.map((profile) => profile.id),
    ['2026-initial', '2026-20260826'],
  )
  for (const profile of value.profiles) {
    assert.match(profile.mirror.revision, revision)
    assert.match(profile.mirror.provenanceSha256, sha256)
    assert.equal(
      profile.mirror.url,
      `https://texlive.corca.ai/snapshots/${profile.mirror.revision}/2026/`,
    )
    assert.ok(!profile.mirror.url.includes('/latest/'))
    assert.ok(Number.isSafeInteger(profile.mirror.objects) && profile.mirror.objects > 0)
    assert.match(profile.engine.releaseId, releaseId)
    assert.equal(profile.engine.tag, `engine-${profile.engine.releaseId}`)
    assert.match(profile.engine.sourceRevision, /^[a-f0-9]{40}$/)
    assert.match(profile.engine.correspondingSourceSha256, sha256)
    assert.equal(new Set(profile.engine.buildRuns).size, 5)
    assert.equal(profile.qualification.browserGoldens, 7)
    assert.equal(profile.qualification.nodeBrowserParity, 7)
    assert.deepEqual(profile.qualification.representativeEngines, [
      'pdflatex',
      'xelatex',
      'lualatex',
    ])
  }
})

test('checked-in 2026 distribution is legally bound to its exact engine profile', () => {
  const profile = value.profiles.find((candidate) => candidate.id === value.distributionProfileId)
  assert.ok(profile)
  assert.ok(licenseManifest.correspondingSource.url.includes(`/engine-${profile.engine.releaseId}/`))
  assert.equal(
    licenseManifest.correspondingSource.sha256,
    profile.engine.correspondingSourceSha256,
  )
})

test('2026 discovery points to a qualified immutable profile and will stop at final', () => {
  assert.equal(value.discovery.name, '2026-latest')
  assert.ok(value.profiles.some((profile) => profile.id === value.discovery.profileId))
  assert.equal(value.discovery.frozenAtFinal, false)
  assert.equal(value.finalization.status, 'pending-texlive-2027-release')
  assert.equal(value.finalization.source, 'systems/texlive/2026/tlnet-final')
  assert.equal(value.finalization.freezeDiscoveryAtFinal, true)
})
