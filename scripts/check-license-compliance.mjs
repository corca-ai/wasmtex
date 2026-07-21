#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'))
const version = positional[0] ?? '2025'
const requireReleaseCleared = process.argv.includes('--release')
const failures = []

function fail(message) {
  failures.push(message)
}

function readJson(relativePath) {
  const path = resolve(root, relativePath)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail(`${relativePath}: ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

function requirePath(relativePath) {
  if (!existsSync(resolve(root, relativePath))) fail(`missing required path: ${relativePath}`)
}

function isSha256(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)
}

function validateDownload(value, label) {
  if (!value || typeof value !== 'object') {
    fail(`${label} is missing`)
    return
  }
  if (typeof value.url !== 'string' || !/^https:\/\//.test(value.url)) {
    fail(`${label}.url must be an HTTPS URL`)
  }
  if (!isSha256(value.sha256)) fail(`${label}.sha256 must be a SHA-256 digest`)
}

for (const path of [
  'LICENSE',
  'LICENSES/README.md',
  'LICENSES/GPL-3.0.txt',
  'LICENSES/SyncTeX.txt',
  'LICENSES/Xpdf-4.04-GPL-2.0.txt',
  'LICENSES/Xpdf-4.04-README.txt',
  'THIRD_PARTY_NOTICES.md',
  'docs/licensing.md',
  'docs/proprietary-integration.md',
  'fix-license.md',
  'wasm-build/texlive-source.ref',
]) {
  requirePath(path)
}

const packageJson = readJson('package.json')
const manifestRelativePath = `public/wasmtex/${version}/LICENSE-MANIFEST.json`
const manifest = readJson(manifestRelativePath)
const manifestDir = resolve(root, `public/wasmtex/${version}`)

if (packageJson && manifest) {
  if (typeof packageJson.license !== 'string' || packageJson.license.length === 0) {
    fail('package.json license must be a non-empty SPDX expression')
  }
  if (manifest.sdkLicense !== packageJson.license) {
    fail(
      `SDK license mismatch: package.json=${String(packageJson.license)}, manifest=${String(manifest.sdkLicense)}`,
    )
  }

  const packageFiles = Array.isArray(packageJson.files) ? packageJson.files : []
  for (const required of [
    'LICENSE',
    'LICENSES',
    'THIRD_PARTY_NOTICES.md',
    'docs/licensing.md',
    'docs/proprietary-integration.md',
  ]) {
    if (!packageFiles.includes(required)) fail(`package.json files omits ${required}`)
  }
  for (const forbidden of ['public', 'wasm-build']) {
    if (packageFiles.some((entry) => entry === forbidden || entry.startsWith(`${forbidden}/`))) {
      fail(`package.json files must not include the engine distribution path ${forbidden}`)
    }
  }

  if (manifest.schemaVersion !== 1) fail('license manifest schemaVersion must be 1')
  if (manifest.texliveVersion !== version) {
    fail(`license manifest texliveVersion must be ${version}`)
  }
  if (!/^[a-f0-9]{40}$/i.test(manifest.texliveSourceCommit ?? '')) {
    fail('license manifest texliveSourceCommit must be a 40-character Git commit')
  }

  const pinnedRef = readFileSync(resolve(root, 'wasm-build/texlive-source.ref'), 'utf8').trim()
  if (manifest.texliveSourceCommit !== pinnedRef) {
    fail('license manifest texliveSourceCommit does not match wasm-build/texlive-source.ref')
  }

  for (const field of ['noticePath', 'licenseDirectoryPath', 'requirementsPath']) {
    const relativePath = manifest[field]
    if (typeof relativePath !== 'string' || relativePath.length === 0) {
      fail(`license manifest ${field} is missing`)
      continue
    }
    if (!existsSync(resolve(manifestDir, relativePath))) {
      fail(`license manifest ${field} does not resolve: ${relativePath}`)
    }
  }

  const blockers = Array.isArray(manifest.releaseBlockers) ? manifest.releaseBlockers : null
  if (!blockers) {
    fail('license manifest releaseBlockers must be an array')
  }
  const blockerIds = new Set()
  for (const blocker of blockers ?? []) {
    if (!blocker || typeof blocker.id !== 'string' || typeof blocker.detail !== 'string') {
      fail('every release blocker must have string id and detail fields')
      continue
    }
    if (blockerIds.has(blocker.id)) fail(`duplicate release blocker: ${blocker.id}`)
    blockerIds.add(blocker.id)
  }

  const families = Array.isArray(manifest.artifactFamilies) ? manifest.artifactFamilies : null
  if (!families || families.length === 0) {
    fail('license manifest artifactFamilies must be a non-empty array')
  }
  const familyNames = new Set()
  for (const family of families ?? []) {
    if (!family || typeof family.name !== 'string' || familyNames.has(family.name)) {
      fail(`invalid or duplicate artifact family: ${String(family?.name)}`)
      continue
    }
    familyNames.add(family.name)
    if (!Array.isArray(family.patterns) || family.patterns.length === 0) {
      fail(`${family.name}: patterns must be a non-empty array`)
    }
    if (!Array.isArray(family.distributionTerms) || family.distributionTerms.length === 0) {
      fail(`${family.name}: distributionTerms must be a non-empty array`)
    }
    if (family.releaseBlocker && !blockerIds.has(family.releaseBlocker)) {
      fail(`${family.name}: unknown release blocker ${family.releaseBlocker}`)
    }
  }

  const xetex = (families ?? []).find((family) => family?.name === 'xetex')
  if (!xetex?.distributionTerms?.includes('GPL-2.0-only OR GPL-3.0-only')) {
    fail('xetex distribution terms must record the linked Xpdf GPL-2.0/GPL-3.0 choice')
  }
  if (xetex?.releaseBlocker === 'pplib-license-evidence') {
    fail('the WTPDF/Xpdf xetex family must not retain the legacy pplib release blocker')
  }
  const luahbtex = (families ?? []).find((family) => family?.name === 'luahbtex')
  if (!luahbtex?.distributionTerms?.includes('GPL-2.0-only OR GPL-3.0-only')) {
    fail('luahbtex distribution terms must record the linked Xpdf GPL-2.0/GPL-3.0 choice')
  }
  if (luahbtex?.releaseBlocker === 'pplib-license-evidence') {
    fail('the WTPDF/Xpdf luahbtex family must not retain the legacy pplib release blocker')
  }
  if (blockerIds.has('pplib-license-evidence')) {
    fail('the current WTPDF/Xpdf engine build must not retain the legacy pplib release blocker')
  }

  if (!['development-only', 'release-cleared'].includes(manifest.releaseStatus)) {
    fail(`unsupported license manifest releaseStatus: ${String(manifest.releaseStatus)}`)
  }
  if (manifest.releaseStatus === 'development-only' && blockerIds.size === 0) {
    fail('development-only manifest must record at least one release blocker')
  }
  if (manifest.releaseStatus === 'release-cleared') {
    if (blockerIds.size > 0) fail('release-cleared manifest must not have release blockers')
    if ((families ?? []).some((family) => family.releaseBlocker)) {
      fail('release-cleared manifest has an artifact-family release blocker')
    }
    validateDownload(manifest.correspondingSource, 'correspondingSource')
    validateDownload(manifest.texliveProvenance, 'texliveProvenance')
  }
  if (requireReleaseCleared && manifest.releaseStatus !== 'release-cleared') {
    fail(
      `public distribution denied: status=${String(manifest.releaseStatus)}, blockers=${[...blockerIds].join(', ') || 'unspecified'}`,
    )
  }
}

let tracked = []
try {
  tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
    .toString()
    .split('\0')
    .filter(Boolean)
} catch (error) {
  fail(`cannot inspect Git tracked files: ${error instanceof Error ? error.message : String(error)}`)
}

const forbiddenTracked = tracked.filter((path) => {
  if (path === '.DS_Store' || path === '.env' || (path.startsWith('.env.') && path !== '.env.example')) {
    return true
  }
  if (/^wasm-build\/dist[^/]*\//.test(path)) return true
  if (/^public\/wasmtex\/[^/]+\//.test(path) && !path.endsWith('/LICENSE-MANIFEST.json')) {
    return true
  }
  if (/(^|\/)libs\/pplib(\/|$)/.test(path)) return true
  if (/\.(wasm|fmt|fmt\.gz|a)$/i.test(path)) return true
  if (/(^|\/)icudt[^/]*\.dat(?:\.gz)?$/i.test(path)) return true
  return false
})
if (forbiddenTracked.length > 0) {
  fail(`forbidden generated, local, or uncleared files are tracked:\n  ${forbiddenTracked.join('\n  ')}`)
}

const synctexSource = resolve(root, 'src/synctex/synctex-parser.ts')
if (existsSync(synctexSource)) {
  const text = readFileSync(synctexSource, 'utf8')
  for (const marker of ['Jérôme Laurens', 'LICENSES/SyncTeX.txt']) {
    if (!text.includes(marker)) fail(`SyncTeX source header is missing marker: ${marker}`)
  }
}

const xetexBuild = resolve(root, 'wasm-build/build-xetex2.sh')
if (existsSync(xetexBuild)) {
  const text = readFileSync(xetexBuild, 'utf8')
  for (const forbiddenLink of [/find\s+"\$WB\/libs\/pplib"/, /"\$WB"\/libs\/pplib/]) {
    if (forbiddenLink.test(text)) fail('XeTeX build still links the forbidden pplib dependency')
  }
  for (const required of ['wtpdf-xpdf.cc', 'libxpdf.a', 'wasmtex-xetex.map']) {
    if (!text.includes(required)) fail(`XeTeX WTPDF build gate is missing marker: ${required}`)
  }
}

const luatexBuild = resolve(root, 'wasm-build/build-luatex.sh')
if (existsSync(luatexBuild)) {
  const text = readFileSync(luatexBuild, 'utf8')
  for (const forbiddenLink of [/find\s+"\$WB\/libs\/pplib"/, /"\$WB"\/libs\/pplib/]) {
    if (forbiddenLink.test(text)) fail('LuaHBTeX build still links the forbidden pplib dependency')
  }
  for (const required of [
    'wtpdf-xpdf.cc',
    'libxpdf.a',
    'wasmtex-luatex.map',
    'wasmtex-sha2-smoke.c',
    'sha(256|384|512)_digest',
  ]) {
    if (!text.includes(required)) fail(`LuaHBTeX WTPDF build gate is missing marker: ${required}`)
  }
}

const luatexDockerfile = resolve(root, 'wasm-build/Dockerfile.luatex')
if (existsSync(luatexDockerfile)) {
  const text = readFileSync(luatexDockerfile, 'utf8')
  for (const required of [
    'git apply --check',
    'luatexdir/luamd5/md5lib.c',
    'utilsha',
    'sha(256|384|512)_digest',
  ]) {
    if (!text.includes(required)) fail(`LuaHBTeX source audit is missing marker: ${required}`)
  }
}

if (failures.length > 0) {
  console.error('License compliance check failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `License compliance check passed (${requireReleaseCleared ? 'release' : 'source'} mode, TeX Live ${version}).`,
)
