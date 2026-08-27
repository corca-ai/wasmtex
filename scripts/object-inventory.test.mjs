import assert from 'node:assert/strict'
import test from 'node:test'
import { compareInventory } from './lib/object-inventory.mjs'

test('requires exact keys, sizes, and hashes with no stale destination objects', () => {
  const expected = [{ key: 'pdftex/26/a.sty', size: 3, sha256: 'aaa' }]
  assert.deepEqual(compareInventory(expected, expected), [])
  assert.deepEqual(compareInventory(expected, [
    { key: 'pdftex/26/a.sty', size: 4, sha256: 'bbb' },
    { key: 'stale', size: 1, sha256: 'ccc' },
  ]), ['size mismatch: pdftex/26/a.sty', 'SHA-256 mismatch: pdftex/26/a.sty',
    'stale object: stale'])
})
