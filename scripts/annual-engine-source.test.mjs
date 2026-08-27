import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { validateAnnualEngineSource } from './lib/annual-engine-source.mjs'

const root = resolve(import.meta.dirname, '..')

test('2025 and 2026 have distinct valid immutable engine pins', () => {
  const oldLine = validateAnnualEngineSource(root, '2025')
  const newLine = validateAnnualEngineSource(root, '2026')
  assert.notEqual(oldLine.ref, newLine.ref)
  assert.equal(newLine.ref, 'fb6158926661cb7a7246b3a94a0cb170a9624d5a')
})

test('rejects an unsupported annual line', () => {
  assert.throws(() => validateAnnualEngineSource(root, 'latest'), /unsupported TeX Live year/)
})
