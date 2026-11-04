import assert from 'node:assert/strict'
import test from 'node:test'
import { checkpointFrames, functionNames, stripNames } from './checkpoint-frames.mjs'

// One imported function (index 0) and two defined functions (indices 1 and 2).
const core = Buffer.from([
  0, 97, 115, 109, 1, 0, 0, 0,
  1, 4, 1, 96, 0, 0,
  2, 7, 1, 1, 109, 1, 105, 0, 0,
  3, 3, 2, 0, 0,
  10, 7, 2, 2, 0, 11, 2, 0, 11,
])
// name section: 0 -> "imp", 1 -> "get_next", 2 -> "main".
const entries = Buffer.from([
  3,
  0, 3, 105, 109, 112,
  1, 8, 103, 101, 116, 95, 110, 101, 120, 116,
  2, 4, 109, 97, 105, 110,
])
const content = Buffer.concat([Buffer.from([4, 110, 97, 109, 101, 1, entries.length]), entries])
const names = Buffer.concat([Buffer.from([0, content.length]), content])
const named = new Uint8Array(Buffer.concat([core, names]))

test('reads function names in the module index space, imports included', () => {
  assert.deepEqual([...functionNames(named)], [[0, 'imp'], [1, 'get_next'], [2, 'main']])
})

test('resolves onlylist names to indices and strips only the name section', () => {
  assert.deepEqual(checkpointFrames(named, ['main', 'get_next']), [2, 1])
  const stripped = stripNames(named)
  assert.deepEqual(Buffer.from(stripped), core)
  new WebAssembly.Module(stripped)
  assert.equal(functionNames(stripped).size, 0)
})

test('refuses a name the build does not contain', () => {
  assert.throws(() => checkpointFrames(named, ['main', 'macro_call']), /macro_call matches 0/)
})

test('refuses a build without names', () => {
  assert.throws(() => checkpointFrames(new Uint8Array(core), ['main']), /no function names/)
})

test('the LuaHBTeX list runs from the read (innermost) to the entry point (outermost)', async () => {
  const { readFileSync } = await import('node:fs')
  const frames = JSON.parse(readFileSync(new URL('../wasm-build/luatex-checkpoint-frames.json', import.meta.url), 'utf8'))
  // The worker's stack guard anchors on these two ends.
  assert.equal(frames[0], '__stdio_read')
  assert.equal(frames.at(-1), 'compileLaTeX')
  assert.equal(new Set(frames).size, frames.length)
  // Chromium reports sscanf's reader beside the read when it inlines __uflow's indirect call.
  assert.equal(frames[1], 'string_read')
})
