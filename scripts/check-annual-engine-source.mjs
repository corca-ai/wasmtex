#!/usr/bin/env node
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAnnualEngineSource } from './lib/annual-engine-source.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  const year = process.argv[2]
  const { ref } = validateAnnualEngineSource(root, year)
  console.log(`TeX Live ${year} engine source is pinned to ${ref}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
