import assert from 'node:assert/strict'
import test from 'node:test'
import { compareWasm } from './compare-wasm-profile.mjs'

// A valid module exporting f(): i32, with a one-byte constant body.
function moduleBytes(value) {
  return Buffer.from([
    0, 97, 115, 109, 1, 0, 0, 0,
    1, 5, 1, 96, 0, 1, 127,
    3, 2, 1, 0,
    7, 5, 1, 1, 102, 0, 0,
    10, 6, 1, 4, 0, 65, value, 11,
  ])
}
// name custom section: function 0 is named "f".
const names = Buffer.from([0, 11, 4, 110, 97, 109, 101, 1, 4, 1, 0, 1, 102])
test('accepts function-name metadata without changing executable bytes', () => {
  const baseline = moduleBytes(1)
  const result = compareWasm(baseline, Buffer.concat([baseline, names]))
  assert.equal(result.executableBytesEqual, true)
  assert.equal(result.diagnosticHasNames, true)
  assert.notEqual(result.baseline.sha256, result.diagnostic.sha256)
})
test('rejects changed instructions even with matching function names', () => {
  const result = compareWasm(moduleBytes(1), Buffer.concat([moduleBytes(2), names]))
  assert.equal(result.executableBytesEqual, false)
})
test('does not mistake matching stripped binaries for symbol evidence', () => {
  const result = compareWasm(moduleBytes(1), moduleBytes(1))
  assert.equal(result.executableBytesEqual, true)
  assert.equal(result.diagnosticHasNames, false)
})
test('fails closed on truncated modules', () => {
  assert.throws(() => compareWasm(moduleBytes(1), moduleBytes(1).subarray(0, 20)))
})

test('a module name alone does not provide function symbols', () => {
  const moduleName = Buffer.from([0, 9, 4, 110, 97, 109, 101, 0, 2, 1, 109])
  const result = compareWasm(moduleBytes(1), Buffer.concat([moduleBytes(1), moduleName]))
  assert.equal(result.executableBytesEqual, true)
  assert.equal(result.diagnosticHasNames, false)
})
