import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'
import { selectSupplementalArtifacts } from './lib/snapshot-artifacts.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-snapshot-artifacts-'))
  writeFileSync(
    join(root, 'texlive-provenance.json'),
    JSON.stringify({ texliveYear: '2026', mirrorRevision: '2026-0123456789abcdef' }),
  )
  for (const [key, value] of [
    ['bloom-filter.bin', 'bloom'],
    ['icudt68l.dat', 'icu'],
    ['pdftex/11/pdftex.map', 'map'],
    ['pdftex/26/xetexfontlist.txt', 'xetex'],
    ['pdftex/51/luaotfload-names.lua', 'luatex'],
  ]) {
    const path = join(root, key)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, value)
  }
  return root
}

test('records and verifies every snapshot-coupled runtime artifact', () => {
  const root = fixture()
  const command = ['scripts/snapshot-artifacts.mjs', '--release-root', root]
  execFileSync(process.execPath, command, { cwd: new URL('..', import.meta.url) })
  const manifest = JSON.parse(readFileSync(join(root, 'snapshot-artifacts.json'), 'utf8'))
  assert.equal(manifest.mirrorRevision, '2026-0123456789abcdef')
  assert.deepEqual(
    manifest.artifacts.map((artifact) => artifact.key),
    [
      'bloom-filter.bin',
      'icudt68l.dat',
      'pdftex/11/pdftex.map',
      'pdftex/26/xetexfontlist.txt',
      'pdftex/51/luaotfload-names.lua',
    ],
  )
  execFileSync(process.execPath, [...command, '--check'], {
    cwd: new URL('..', import.meta.url),
  })

  writeFileSync(join(root, 'bloom-filter.bin'), 'drift')
  const drift = spawnSync(process.execPath, [...command, '--check'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
  })
  assert.notEqual(drift.status, 0)
  assert.match(drift.stderr, /does not match release bytes/)
})

test('does not count a core provenance file again as a supplemental artifact', () => {
  const artifacts = [
    { key: 'pdftex/11/pdftex.map', size: 3, sha256: 'a'.repeat(64) },
    { key: 'pdftex/26/xetexfontlist.txt', size: 5, sha256: 'b'.repeat(64) },
    { key: 'pdftex/51/luaotfload-names.lua', size: 6, sha256: 'c'.repeat(64) },
  ]
  assert.deepEqual(
    selectSupplementalArtifacts(
      { artifacts },
      { files: [{ key: 'pdftex/11/pdftex.map' }] },
    ),
    artifacts.slice(1),
  )
})
