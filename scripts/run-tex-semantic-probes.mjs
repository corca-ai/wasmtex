#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildProbeSandbox, runProbeCommand } from './lib/tex-semantic-probe.mjs'

function parseArguments(argv) {
  const values = { args: [] }
  for (let cursor = 0; cursor < argv.length; cursor++) {
    const name = argv[cursor]
    if (name === '--arg') {
      const value = argv[++cursor]
      if (value === undefined) throw new Error('--arg requires a value')
      values.args.push(value)
      continue
    }
    if (!name.startsWith('--')) throw new Error(`unexpected argument: ${name}`)
    const value = argv[++cursor]
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`)
    values[name.slice(2)] = value
  }
  return values
}

function available(command) {
  return spawnSync('command', ['-v', command], {
    shell: true,
    stdio: 'ignore',
  }).status === 0
}

try {
  const args = parseArguments(process.argv.slice(2))
  for (const required of ['input', 'command', 'output']) {
    if (!args[required]) throw new Error(`--${required} is required`)
  }
  const input = JSON.parse(readFileSync(resolve(args.input), 'utf8'))
  if (!/^\d{4}$/.test(input.texliveYear ?? '') || !/^\d{4}-[a-f0-9]{16}$/.test(input.mirrorRevision ?? '')) {
    throw new Error('probe input must carry an exact TeX Live year and mirror revision')
  }
  const plan = buildProbeSandbox({
    command: resolve(args.command),
    args: args.args,
    timeoutMs: Number(args['timeout-ms'] ?? 5000),
    memoryMb: Number(args['memory-mb'] ?? 256),
    available,
  })
  const output = runProbeCommand({ plan, input })
  writeFileSync(resolve(args.output), `${JSON.stringify(output, null, 2)}\n`)
  console.log(
    `semantic probes passed in a network-isolated sandbox: ` +
      `${Object.keys(output.scopes).length} scopes, timeout=${plan.timeoutMs}ms, memory=${plan.memoryMb}MiB`,
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
