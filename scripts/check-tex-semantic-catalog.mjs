#!/usr/bin/env node

import { resolve } from 'node:path'
import {
  checkTexSemanticCatalog,
  loadTexSemanticInputs,
} from './lib/tex-semantic-catalog.mjs'

function argumentsOf(argv) {
  const values = {}
  for (let cursor = 0; cursor < argv.length; cursor++) {
    const name = argv[cursor]
    if (!name.startsWith('--')) throw new Error(`unexpected argument: ${name}`)
    const value = argv[++cursor]
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
    values[name.slice(2)] = value
  }
  return values
}

try {
  const args = argumentsOf(process.argv.slice(2))
  for (const required of ['manifest', 'mirror-root', 'catalog']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  const inputPaths = {
    manifestPath: resolve(args.manifest),
    ...(args.overrides ? { overridesPath: resolve(args.overrides) } : {}),
    ...(args.probes ? { probeReportPath: resolve(args.probes) } : {}),
  }
  const failures = checkTexSemanticCatalog({
    ...loadTexSemanticInputs(inputPaths),
    mirrorRoot: resolve(args['mirror-root']),
    catalogDir: resolve(args.catalog),
  })
  if (failures.length > 0) {
    console.error(`TeX semantic catalog check failed:\n- ${failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log('TeX semantic catalog check passed')
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
