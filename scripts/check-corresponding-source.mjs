#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { checkCorrespondingSourceDirectory, hashFile } from './lib/corresponding-source.mjs'

const [archiveArg, assetManifestArg, configArg] = process.argv.slice(2)
if (!archiveArg || !assetManifestArg) {
  console.error(
    'usage: node scripts/check-corresponding-source.mjs <source.tar.xz> ' +
      '<engine-manifest.json> [config.json]',
  )
  process.exit(1)
}

const archive = resolve(archiveArg)
const assetManifest = JSON.parse(readFileSync(resolve(assetManifestArg), 'utf8'))
const config = JSON.parse(
  readFileSync(resolve(configArg ?? 'scripts/corresponding-source-2025.json'), 'utf8'),
)
const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' }).trim().split('\n')
for (const entry of entries) {
  if (entry.startsWith('/') || entry.split('/').includes('..')) {
    console.error(`unsafe source archive entry: ${entry}`)
    process.exit(1)
  }
}
const topLevels = new Set(entries.filter(Boolean).map((entry) => entry.split('/')[0]))
if (topLevels.size !== 1) {
  console.error(`source archive must have one top-level directory, found ${topLevels.size}`)
  process.exit(1)
}
const temporary = mkdtempSync(join(tmpdir(), 'wasmtex-source-check-'))
try {
  execFileSync('tar', ['-xf', archive, '-C', temporary], { stdio: 'inherit' })
  const directory = join(temporary, [...topLevels][0])
  const failures = checkCorrespondingSourceDirectory({ directory, config, assetManifest })
  if (failures.length > 0) {
    console.error('Corresponding-source check failed:')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log(`Corresponding-source check passed: ${basename(archive)}`)
    console.log(`SHA-256 ${hashFile('sha256', archive)}`)
  }
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
