#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateMirror } from './lib/texlive-provenance.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function args(argv) {
  const values = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    const value = argv[++i]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2)] = value
  }
  return values
}

try {
  const value = args(process.argv.slice(2))
  for (const required of ['texmf-dist', 'tlpdb', 'output', 'manifest']) {
    if (!value[required]) throw new Error(`--${required} is required`)
  }
  const configPath = resolve(value.config ?? `${root}/scripts/texlive-mirror-2025.json`)
  const overridesPath = resolve(
    value.overrides ?? `${root}/scripts/texlive-mirror-overrides-2025.json`,
  )
  const manifest = generateMirror({
    texmfDist: resolve(value['texmf-dist']),
    tlpdbPath: resolve(value.tlpdb),
    outputDir: resolve(value.output),
    manifestPath: resolve(value.manifest),
    config: JSON.parse(readFileSync(configPath, 'utf8')),
    overrides: JSON.parse(readFileSync(overridesPath, 'utf8')),
    texmfArchivePath: value['texmf-archive'] ? resolve(value['texmf-archive']) : null,
    metadataArchivePath: value['metadata-archive'] ? resolve(value['metadata-archive']) : null,
  })
  console.log(
    `generated ${manifest.summary.files} files from ${manifest.summary.packages} packages; ` +
      `${manifest.summary.collisions} collisions recorded`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
