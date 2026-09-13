import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'

// Runtime JS is authored directly under wasm-build/. Generated engines live in
// dist*/; tests/ contains Node development probes, not shipped controllers.
const config = JSON.parse(readFileSync(new URL('../biome.workers.json', import.meta.url), 'utf8'))
const owned = readdirSync(new URL('../wasm-build/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:c?js)$/.test(entry.name))
  .map((entry) => `wasm-build/${entry.name}`)
  .sort()
assert.deepEqual([...config.files.includes].sort(), owned,
  'Update biome.workers.json when adding/removing authored runtime JavaScript')
console.log(`Worker lint scope: ${owned.length} authored runtime files`)
