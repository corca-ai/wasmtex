#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { auditMirror, auditTlpdb } from './lib/texlive-provenance.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const values = { metadataOnly: false }
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`)
    if (key === '--metadata-only') {
      values.metadataOnly = true
      continue
    }
    const value = argv[++i]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2)] = value
  }
  return values
}

try {
  const args = parseArgs(process.argv.slice(2))
  for (const required of ['tlpdb', 'output']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  if (!args.metadataOnly && !args['texmf-dist']) throw new Error('--texmf-dist is required')
  const config = JSON.parse(
    readFileSync(resolve(args.config ?? join(root, 'scripts/texlive-mirror-2025.json')), 'utf8'),
  )
  const overrides = JSON.parse(
    readFileSync(
      resolve(args.overrides ?? join(root, 'scripts/texlive-mirror-overrides-2025.json')),
      'utf8',
    ),
  )
  const audit = args.metadataOnly
    ? auditTlpdb({ tlpdbPath: resolve(args.tlpdb), config, overrides })
    : auditMirror({
        texmfDist: resolve(args['texmf-dist']),
        tlpdbPath: resolve(args.tlpdb),
        config,
        overrides,
      })
  writeFileSync(resolve(args.output), `${JSON.stringify(audit, null, 2)}\n`)
  console.log(JSON.stringify(audit.summary, null, 2))
  if (audit.summary.errors > 0) process.exitCode = 2
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
