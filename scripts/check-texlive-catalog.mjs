#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkTexliveCatalog } from './lib/texlive-catalog.mjs'

const [manifestPath, catalogDir] = process.argv.slice(2)
if (!manifestPath || !catalogDir) {
  console.error('usage: node scripts/check-texlive-catalog.mjs <manifest.json> <catalog-dir>')
  process.exit(2)
}

const manifestBytes = readFileSync(resolve(manifestPath))
const failures = checkTexliveCatalog({
  manifest: JSON.parse(manifestBytes),
  manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
  catalogDir: resolve(catalogDir),
})
if (failures.length > 0) {
  console.error(`TeX Live catalog check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log('TeX Live catalog check passed')
