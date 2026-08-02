#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkDeployedCompletionInventory } from './lib/deployed-completion.mjs'

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
  if (!value.manifest || !value['base-url']) {
    throw new Error('--manifest and --base-url are required')
  }
  const manifest = JSON.parse(readFileSync(resolve(value.manifest), 'utf8'))
  const result = await checkDeployedCompletionInventory({
    manifest,
    baseUrl: value['base-url'],
    concurrency: value.concurrency ? Number(value.concurrency) : undefined,
  })
  if (result.failures.length > 0) {
    console.error(`Deployed completion verification failed:\n- ${result.failures.join('\n- ')}`)
    process.exit(1)
  }
  console.log(
    `Deployed completion verification passed (${result.checkedFiles} files, ` +
      `${result.checkedBytes} bytes).`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
