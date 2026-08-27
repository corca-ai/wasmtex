#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const REQUIRED_ARTIFACTS = Object.freeze([
  { key: 'bloom-filter.bin', kind: 'package-existence-filter' },
  { key: 'icudt68l.dat', kind: 'icu-data' },
  { key: 'pdftex/11/pdftex.map', kind: 'pdftex-font-map' },
  { key: 'pdftex/26/xetexfontlist.txt', kind: 'xetex-font-database' },
  { key: 'pdftex/51/luaotfload-names.lua', kind: 'luaotfload-font-database' },
])

function parseArgs(argv) {
  const values = { check: false }
  for (let index = 0; index < argv.length; index++) {
    const key = argv[index]
    if (key === '--check') {
      values.check = true
      continue
    }
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    const value = argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2)] = value
  }
  return values
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function expectedArtifactManifest(releaseRoot) {
  const provenance = JSON.parse(readFileSync(join(releaseRoot, 'texlive-provenance.json'), 'utf8'))
  if (!/^\d{4}-[a-f0-9]{16}$/.test(provenance.mirrorRevision ?? '')) {
    throw new Error('provenance does not contain a valid mirror revision')
  }
  return {
    schemaVersion: 1,
    texliveYear: provenance.texliveYear,
    mirrorRevision: provenance.mirrorRevision,
    provenanceSha256: sha256(join(releaseRoot, 'texlive-provenance.json')),
    artifacts: REQUIRED_ARTIFACTS.map(({ key, kind }) => {
      const path = join(releaseRoot, key)
      return { key, kind, size: statSync(path).size, sha256: sha256(path) }
    }),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args['release-root']) {
    throw new Error('usage: snapshot-artifacts.mjs --release-root <dir> [--output <json>] [--check]')
  }
  const releaseRoot = resolve(args['release-root'])
  const output = resolve(args.output ?? join(releaseRoot, 'snapshot-artifacts.json'))
  const expected = expectedArtifactManifest(releaseRoot)
  const serialized = `${JSON.stringify(expected, null, 2)}\n`
  if (args.check) {
    const actual = readFileSync(output, 'utf8')
    if (actual !== serialized) throw new Error('snapshot artifact manifest does not match release bytes')
    console.log(`Verified ${expected.artifacts.length} artifacts for ${expected.mirrorRevision}`)
    return
  }
  writeFileSync(output, serialized)
  console.log(`Recorded ${expected.artifacts.length} artifacts for ${expected.mirrorRevision}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
