#!/usr/bin/env node
/**
 * Guard against #142: assert every package entry point ships a `.d.ts` that actually
 * exports its public surface. The `rollupTypes` dts bundler silently dropped a barrel's
 * re-exported named symbols, leaving `wasmtex`'s types with only the `WasmTex` class.
 * Run after `vite build` (the lib build) — it reads package.json "exports" and checks each
 * `types` file exists and has more than the bare minimum number of `export` statements.
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

// Minimum top-level `export` statements expected per entry — a floor that catches the
// "only the main class survived" failure mode without being brittle about exact counts.
const MIN_EXPORTS = { '.': 5, './headless': 5, './node': 1, './synctex': 4, './lsp': 3 }

const failures = []
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  if (!entry || typeof entry !== 'object') continue
  const types = entry.types
  if (!types) continue

  // #153: `types` MUST be the first condition. TS matches conditions in order; if `import`
  // (or `require`/`default`) precedes `types`, type resolution derives the .d.ts from the
  // JS entry's *sibling* (e.g. `wasmtex.js` → `wasmtex.d.ts`, the class-only file)
  // instead of this `types` target — so `import type … from "wasmtex"` loses the barrel.
  const keys = Object.keys(entry)
  const firstRuntime = keys.findIndex((k) => k === 'import' || k === 'require' || k === 'default')
  if (firstRuntime !== -1 && keys.indexOf('types') > firstRuntime) {
    failures.push(
      `${subpath}: "types" must come before "${keys[firstRuntime]}" in the exports conditions (#153)`,
    )
  }

  const file = join(root, types)
  if (!existsSync(file)) {
    failures.push(`${subpath}: types file missing — ${types}`)
    continue
  }
  const count = (readFileSync(file, 'utf8').match(/^export\b/gm) ?? []).length
  const min = MIN_EXPORTS[subpath] ?? 1
  if (count < min) {
    failures.push(`${subpath}: ${types} has ${count} top-level exports (expected >= ${min}) — barrel re-exports likely dropped (#142)`)
  }
}

if (failures.length) {
  console.error('check-dts-exports: entry point type declarations are incomplete:')
  for (const f of failures) console.error(`  - ${f}`)
  process.exit(1)
}
console.log('check-dts-exports: all entry point .d.ts export their public surface ✓')
