#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBuildReceipt } from './lib/engine-build-receipt.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [family, directoryArg, outputArg, ...filenames] = process.argv.slice(2)
const texliveYear = process.env.TEXLIVE_YEAR ?? '2025'
if (!/^(2025|2026)$/.test(texliveYear)) throw new Error(`unsupported TEXLIVE_YEAR: ${texliveYear}`)
if (!family || !directoryArg || !outputArg || filenames.length === 0) {
  console.error(
    'usage: node scripts/gen-engine-build-receipt.mjs <family> <artifact-dir> ' +
      '<output.json> <artifact>...',
  )
  process.exit(1)
}

try {
  const config = JSON.parse(
    readFileSync(resolve(root, `scripts/corresponding-source-${texliveYear}.json`), 'utf8'),
  )
  const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const texliveSourceCommit = readFileSync(
    resolve(root, config.texliveSource.commitFile),
    'utf8',
  ).trim()
  const receipt = createBuildReceipt({
    family,
    directory: resolve(directoryArg),
    filenames,
    sourceRevision,
    texliveSourceCommit,
    config,
  })
  writeFileSync(resolve(outputArg), `${JSON.stringify(receipt, null, 2)}\n`)
  console.log(`wrote ${outputArg} (${receipt.buildId})`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
