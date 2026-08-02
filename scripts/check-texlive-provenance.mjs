#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkMirror } from './lib/texlive-provenance.mjs'

const manifestPath = process.argv[2]
const mirrorRoot = process.argv[3]
if (!manifestPath || !mirrorRoot) {
  console.error(
    'usage: node scripts/check-texlive-provenance.mjs <manifest.json> <mirror-root> [--release]',
  )
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'))
const failures = checkMirror({
  manifest,
  mirrorRoot: resolve(mirrorRoot),
  requireLicenseReview: process.argv.includes('--release'),
  allowCompletionMetadata: process.argv.includes('--completion-metadata'),
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
