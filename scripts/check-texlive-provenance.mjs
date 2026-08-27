#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { checkMirror } from './lib/texlive-provenance.mjs'
import { selectSupplementalArtifacts } from './lib/snapshot-artifacts.mjs'

const manifestPath = process.argv[2]
const mirrorRoot = process.argv[3]
if (!manifestPath || !mirrorRoot) {
  console.error(
    'usage: node scripts/check-texlive-provenance.mjs <manifest.json> <mirror-root> [--release]',
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'))
const artifactManifestPath = join(resolve(mirrorRoot), 'snapshot-artifacts.json')
let supplementalArtifacts = []
if (existsSync(artifactManifestPath)) {
  const artifactManifest = JSON.parse(readFileSync(artifactManifestPath, 'utf8'))
  const expectedKeys = [
    'bloom-filter.bin',
    'icudt68l.dat',
    'pdftex/11/pdftex.map',
    'pdftex/26/xetexfontlist.txt',
    'pdftex/51/luaotfload-names.lua',
  ]
  const actualKeys = (artifactManifest.artifacts ?? []).map(({ key }) => key).sort()
  const provenanceSha256 = createHash('sha256')
    .update(readFileSync(resolve(manifestPath)))
    .digest('hex')
  if (
    artifactManifest.schemaVersion !== 1 ||
    artifactManifest.mirrorRevision !== manifest.mirrorRevision ||
    artifactManifest.provenanceSha256 !== provenanceSha256 ||
    JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)
  ) {
    console.error('snapshot artifact manifest does not bind the exact provenance/runtime set')
    process.exit(1)
  }
  supplementalArtifacts = selectSupplementalArtifacts(artifactManifest, manifest)
}
const failures = checkMirror({
  manifest,
  mirrorRoot: resolve(mirrorRoot),
  requireLicenseReview: process.argv.includes('--release'),
  allowCompletionMetadata: process.argv.includes('--completion-metadata'),
  supplementalArtifacts,
})
if (failures.length > 0) {
  console.error('TeX Live provenance check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log(
  `TeX Live provenance check passed (${manifest.files.length} files, ` +
    `${process.argv.includes('--release') ? 'release' : 'structural'} mode).`,
)
