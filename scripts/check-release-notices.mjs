#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadAndValidateEngineLicenseInventory } from './lib/engine-license-inventory.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)

function option(name, fallback = null) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

const assets = resolve(option('--assets', join(root, 'public/wasmtex/2025')))
const demoArg = option('--demo')
const demo = demoArg ? resolve(demoArg) : null
const release = args.includes('--release')
const failures = []

function fail(message) {
  failures.push(message)
}

function requireFile(path, label = path) {
  if (!existsSync(path)) {
    fail(`missing ${label}`)
    return null
  }
  return readFileSync(path, 'utf8')
}

let validated
try {
  validated = loadAndValidateEngineLicenseInventory(root, 'scripts/engine-components-2025.json')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

const moduleByFamily = {
  pdftex: 'wasmtex-pdftex.js',
  bibtex: 'wasmtex-bibtex.js',
  bibtex8: 'wasmtex-bibtex8.js',
  makeindex: 'wasmtex-makeindex.js',
  xetex: 'wasmtex-xetex.js',
  dvipdfmx: 'wasmtex-dvipdfm.js',
  luahbtex: 'wasmtex-luatex.js',
}

for (const family of validated?.inventory.families ?? []) {
  const name = moduleByFamily[family.family]
  const path = join(assets, name)
  if (!existsSync(path) && !release) continue
  const text = requireFile(path, `${family.family} Emscripten module`)
  if (!text) continue
  const prefix = text.slice(0, 220)
  for (const marker of ['@license', 'Copyright 2010 The Emscripten Authors', 'SPDX-License-Identifier: MIT']) {
    if (!prefix.includes(marker)) fail(`${name}: generated Emscripten license header is missing ${marker}`)
  }
  if (/pplib|ppdoc_|ppdict_|pparray_|ppstream_|ppref_|utilsha/.test(text)) {
    fail(`${name}: forbidden legacy marker in release JavaScript`)
  }
}

const legal = JSON.parse(
  requireFile(join(assets, 'LICENSE-MANIFEST.json'), 'engine license manifest') ?? '{}',
)
if (release) {
  if (legal.releaseStatus !== 'release-cleared') fail('engine license manifest is not release-cleared')
  if (!/^https:\/\//.test(legal.correspondingSource?.url ?? '')) {
    fail('release has no HTTPS corresponding-source URL')
  }
  if (!/^[a-f0-9]{64}$/i.test(legal.correspondingSource?.sha256 ?? '')) {
    fail('release has no corresponding-source SHA-256')
  }
}

const thirdParty = requireFile(join(root, 'THIRD_PARTY_NOTICES.md')) ?? ''
for (const marker of [
  'The WebAssembly port is a modified version',
  'LICENSES/MakeIndex.txt',
  'corresponding-source archive',
]) {
  if (!thirdParty.includes(marker)) fail(`MakeIndex/source notice is missing marker: ${marker}`)
}

if (demo) {
  for (const relative of [
    'THIRD_PARTY_NOTICES.md',
    'LICENSES/Monaco-Editor.txt',
    'LICENSES/Apache-2.0.txt',
    'LICENSES/pdf-lib.txt',
    'LICENSES/MakeIndex.txt',
    'LICENSES/BibTeX.txt',
    'LICENSES/LLVM-exception.txt',
    'LICENSES/musl.txt',
  ]) {
    requireFile(join(demo, relative), `demo notice ${relative}`)
  }
}

if (failures.length > 0) {
  console.error('Release notice check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Release notice check passed (${basename(assets)} assets${demo ? `, ${basename(demo)} demo` : ''}${release ? ', release mode' : ''}).`,
)
