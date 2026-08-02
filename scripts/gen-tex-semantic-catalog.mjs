#!/usr/bin/env node

import { resolve } from 'node:path'
import { generateTexSemanticCatalog } from './lib/tex-semantic-catalog.mjs'

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
  for (const required of ['manifest', 'mirror-root', 'output']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  const result = generateTexSemanticCatalog({
    manifestPath: resolve(args.manifest),
    mirrorRoot: resolve(args['mirror-root']),
    outputDir: resolve(args.output),
    ...(args.overrides ? { overridesPath: resolve(args.overrides) } : {}),
    ...(args.probes ? { probeReportPath: resolve(args.probes) } : {}),
  })
  const summary = result.index.summary
  console.log(
    `generated semantic catalog ${result.index.mirrorRevision}: ` +
      `${summary.scopesWithMetadata}/${summary.scopes} scopes, ` +
      `keys=${summary.keys}, commands=${summary.commands}, environments=${summary.environments}, ` +
      `exact=${summary.exact}, declared=${summary.declared}, observed=${summary.observed}, ` +
      `inferred=${summary.inferred}, overridden=${summary.overridden}, unresolved=${summary.unresolved}`,
  )
  if (summary.overrideScopesAbsent.length > 0) {
    console.log(`overrides absent from mirror: ${summary.overrideScopesAbsent.join(', ')}`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
