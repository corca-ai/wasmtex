#!/usr/bin/env node

import { resolve } from 'node:path'
import { generateTexliveCatalog } from './lib/texlive-catalog.mjs'

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
  if (!value.manifest || !value.output) throw new Error('--manifest and --output are required')
  const index = generateTexliveCatalog({
    manifestPath: resolve(value.manifest),
    outputDir: resolve(value.output),
  })
  console.log(
    `generated catalog ${index.mirrorRevision}: ${index.summary.catalogResources} resources; ` +
      Object.entries(index.summary.byKind)
        .map(([kind, count]) => `${kind}=${count}`)
        .join(', '),
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
