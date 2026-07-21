import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  loadAndValidateEngineLicenseInventory,
  validateEngineLicenseInventory,
} from './lib/engine-license-inventory.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the exact release link inventory has complete component coverage', () => {
  const result = loadAndValidateEngineLicenseInventory(root, 'scripts/engine-components-2025.json')
  assert.equal(result.coverage.length, 81)
  assert.equal(new Set(result.coverage.map((entry) => entry.family)).size, 7)
})

test('an unknown linked archive fails closed', () => {
  const inventory = JSON.parse(readFileSync(resolve(root, 'scripts/engine-components-2025.json')))
  const linkInventory = JSON.parse(
    readFileSync(resolve(root, inventory.linkInventory), 'utf8'),
  )
  linkInventory.maps[0].archives.push({ path: 'unknown/libmystery.a', members: [] })
  assert.throws(
    () => validateEngineLicenseInventory(inventory, linkInventory, root),
    /matched 0 component inventory entries/,
  )
})

test('a statically linked LGPL component must name its relink method', () => {
  const inventory = JSON.parse(readFileSync(resolve(root, 'scripts/engine-components-2025.json')))
  const linkInventory = JSON.parse(
    readFileSync(resolve(root, inventory.linkInventory), 'utf8'),
  )
  delete inventory.components.find((entry) => entry.id === 'kpathsea').staticLinking
  assert.throws(
    () => validateEngineLicenseInventory(inventory, linkInventory, root),
    /statically linked LGPL component has no relink method/,
  )
})
