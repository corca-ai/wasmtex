#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { reconcileDeployedCompletionInventory } from './lib/deployed-completion.mjs'

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
  for (const required of ['manifest', 'mirror-root', 'base-url', 'policy']) {
    if (!value[required]) throw new Error(`--${required} is required`)
  }
  const manifestPath = resolve(value.manifest)
  const result = await reconcileDeployedCompletionInventory({
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    mirrorRoot: resolve(value['mirror-root']),
    baseUrl: value['base-url'],
    policy: JSON.parse(readFileSync(resolve(value.policy), 'utf8')),
    concurrency: value.concurrency ? Number(value.concurrency) : undefined,
  })
  if (result.failures.length > 0) {
    console.error(`Deployed completion reconciliation failed:\n- ${result.failures.join('\n- ')}`)
    process.exit(1)
  }
  writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
  console.log(
    `Deployed completion reconciliation passed (${result.checkedFiles} files, ` +
      `${result.checkedBytes} bytes).`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
