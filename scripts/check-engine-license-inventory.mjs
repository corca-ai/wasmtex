#!/usr/bin/env node

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAndValidateEngineLicenseInventory } from './lib/engine-license-inventory.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] ?? '2025'
const result = loadAndValidateEngineLicenseInventory(
  root,
  `scripts/engine-components-${version}.json`,
)
const families = new Set(result.coverage.map((entry) => entry.family))
console.log(
  `Engine license inventory passed (${result.coverage.length} linked archives, ${result.inventory.components.length} components, ${families.size} executable families).`,
)
