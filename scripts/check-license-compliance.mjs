#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateSourceConfig } from './lib/engine-build-receipt.mjs'
import { loadAndValidateEngineLicenseInventory } from './lib/engine-license-inventory.mjs'

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
  'LICENSES/BibTeX.txt',
  'LICENSES/LLVM-exception.txt',
  'LICENSES/Lua-5.3.txt',
  'LICENSES/LuaHBTeX-embedded.txt',
  'LICENSES/musl.txt',
  'LICENSES/SyncTeX.txt',
  'LICENSES/Xpdf-4.04-GPL-2.0.txt',
  'LICENSES/Xpdf-4.04-README.txt',
  'THIRD_PARTY_NOTICES.md',
  'docs/licensing.md',
  'docs/corresponding-source.md',
  'docs/develop.md',
  'docs/license-evidence/texlive-2025-metadata-audit-124bfca.md',
  'docs/license-evidence/engine-release-2025-23ee539.md',
  'docs/license-evidence/link-inventory-23ee539.json',
  'docs/license-evidence/linked-components-2025-23ee539.md',
  'docs/license-evidence/engine-sbom-2025-23ee539.spdx.json',
  'docs/license-evidence/format-inputs-pdftex-23ee539.json',
  'docs/license-evidence/format-inputs-xetex-23ee539.json',
  'docs/license-evidence/format-inputs-luahbtex-23ee539.json',
  'docs/proprietary-integration.md',
  'fix-license.md',
  'scripts/audit-texlive-provenance.mjs',
  'scripts/build-corresponding-source.mjs',
  'scripts/check-corresponding-source.mjs',
  'scripts/check-texlive-provenance.mjs',
  'scripts/corresponding-source-2025.json',
  'scripts/gen-engine-build-receipt.mjs',
  'scripts/gen-link-inventory.mjs',
  'scripts/gen-engine-sbom.mjs',
  'scripts/check-engine-license-inventory.mjs',
  'scripts/check-release-notices.mjs',
  'scripts/engine-components-2025.json',
  'scripts/gen-texlive-provenance.mjs',
  'scripts/lib/engine-build-receipt.mjs',
  'scripts/lib/engine-license-inventory.mjs',
  'scripts/lib/format-input-evidence.mjs',
  'scripts/lib/link-inventory.mjs',
  'scripts/lib/corresponding-source.mjs',
  'scripts/lib/release-assets.mjs',
  'scripts/lib/texlive-provenance.mjs',
  'scripts/texlive-mirror-2025.json',
  'scripts/texlive-mirror-overrides-2025.json',
  'wasm-build/texlive-source.ref',
]) {
  requirePath(path)
}

const packageJson = readJson('package.json')
const manifestRelativePath = `public/wasmtex/${version}/LICENSE-MANIFEST.json`
const manifest = readJson(manifestRelativePath)
const mirrorConfig = readJson(`scripts/texlive-mirror-${version}.json`)
const mirrorOverrides = readJson(`scripts/texlive-mirror-overrides-${version}.json`)
const sourceConfig = readJson(`scripts/corresponding-source-${version}.json`)
const linkInventory = readJson('docs/license-evidence/link-inventory-23ee539.json')
const manifestDir = resolve(root, `public/wasmtex/${version}`)

if (sourceConfig) {
  try {
    validateSourceConfig(sourceConfig)
  } catch (error) {
    fail(`corresponding-source config: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (sourceConfig.texliveYear !== version) {
    fail(`corresponding-source config year must be ${version}`)
  }
  if (manifest && sourceConfig.emscripten?.version !== manifest.emscriptenVersion) {
    fail('corresponding-source Emscripten version does not match license manifest')
  }
  const portNames = new Set(sourceConfig.ports?.map((port) => port.name))
  for (const requiredPort of ['freetype', 'icu', 'libpng', 'zlib']) {
    if (!portNames.has(requiredPort)) {
      fail(`corresponding-source config omits Emscripten port: ${requiredPort}`)
    }
  }
  const dockerImage = sourceConfig.emscripten?.dockerImage
  for (const dockerfile of [
    'wasm-build/Dockerfile',
    'wasm-build/Dockerfile.bibtex8',
    'wasm-build/Dockerfile.luatex',
    'wasm-build/Dockerfile.makeindex',
    'wasm-build/Dockerfile.xetex',
  ]) {
    const text = readFileSync(resolve(root, dockerfile), 'utf8')
    if (!text.includes(`FROM ${dockerImage}`)) {
      fail(`${dockerfile} does not use the pinned corresponding-source Docker image`)
    }
  }
}

if (linkInventory) {
  if (linkInventory.schemaVersion !== 1) fail('link inventory schemaVersion must be 1')
  if (!/^[a-f0-9]{40}$/i.test(linkInventory.sourceRevision ?? '')) {
    fail('link inventory sourceRevision must be a Git commit')
  }
  const expectedMapFamilies = [
    'pdftex',
    'bibtex',
    'bibtex8',
    'makeindex',
    'xetex',
    'dvipdfmx',
    'luahbtex',
  ].sort()
  const actualMapFamilies = (linkInventory.maps ?? []).map((map) => map.family).sort()
  if (JSON.stringify(actualMapFamilies) !== JSON.stringify(expectedMapFamilies)) {
    fail('link inventory does not cover every executable artifact family exactly once')
  }
  for (const map of linkInventory.maps ?? []) {
    if (!isSha256(map.mapSha256) || !isSha256(map.buildId)) {
      fail(`${String(map.family)}: link inventory has an invalid map or build digest`)
    }
    if (!Array.isArray(map.archives) || map.archives.length === 0) {
      fail(`${String(map.family)}: link inventory has no static archives`)
    }
  }
}

try {
  loadAndValidateEngineLicenseInventory(root, `scripts/engine-components-${version}.json`)
} catch (error) {
  fail(`engine component inventory: ${error instanceof Error ? error.message : String(error)}`)
}

try {
  execFileSync(
    process.execPath,
    [
      resolve(root, 'scripts/gen-engine-sbom.mjs'),
      version,
      '--check',
      'docs/license-evidence/engine-sbom-2025-23ee539.spdx.json',
    ],
    { cwd: root, stdio: 'pipe' },
  )
} catch (error) {
  fail(`engine SPDX SBOM is stale: ${error instanceof Error ? error.message : String(error)}`)
}

if (mirrorConfig) {
  if (mirrorConfig.schemaVersion !== 1) fail('TeX Live mirror config schemaVersion must be 1')
  if (mirrorConfig.texliveYear !== version) {
    fail(`TeX Live mirror config year must be ${version}`)
  }
  const archiveDates = new Set()
  for (const key of ['texmfArchive', 'metadataArchive']) {
    const archive = mirrorConfig[key]
    if (!archive || typeof archive !== 'object') {
      fail(`TeX Live mirror config ${key} is missing`)
      continue
    }
    if (!/^[a-f0-9]{128}$/i.test(archive.sha512 ?? '')) {
      fail(`TeX Live mirror config ${key}.sha512 must be a SHA-512 digest`)
    }
    if (
      typeof archive.filename !== 'string' ||
      typeof archive.url !== 'string' ||
      !archive.url.startsWith('https://') ||
      !archive.url.includes(`/texlive/${version}/`) ||
      !archive.url.endsWith(`/${archive.filename}`)
    ) {
      fail(`TeX Live mirror config ${key} must pin an HTTPS historic archive URL`)
    }
    const date = archive.filename?.match(/^texlive-(\d{8})-/)?.[1]
    if (!date) fail(`TeX Live mirror config ${key} filename must include its release date`)
    else archiveDates.add(date)
  }
  if (archiveDates.size !== 1) {
    fail('TeX Live texmf and metadata archives must come from the same release date')
  }
  if (typeof mirrorConfig.tlpdb?.archiveMember !== 'string') {
    fail('TeX Live mirror config must pin the TLPDB archive member')
  }
  if (!isSha256(mirrorConfig.tlpdb?.sha256)) {
    fail('TeX Live mirror config must pin the extracted TLPDB SHA-256')
  }
}

if (mirrorOverrides) {
  if (mirrorOverrides.schemaVersion !== 1) {
    fail('TeX Live mirror overrides schemaVersion must be 1')
  }
  for (const key of ['fileOwners', 'packageLicenses', 'collisions']) {
    const value = mirrorOverrides[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      fail(`TeX Live mirror overrides ${key} must be an object`)
    }
  }
}

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

  for (const field of [
    'noticePath',
    'licenseDirectoryPath',
    'requirementsPath',
    'componentInventoryPath',
  ]) {
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

  const requiredBuildFamilies = Array.isArray(manifest.requiredBuildFamilies)
    ? manifest.requiredBuildFamilies
    : null
  const expectedBuildFamilies = ['pdftex', 'bibtex', 'bibtex8', 'makeindex', 'xetex', 'luahbtex']
  if (
    !requiredBuildFamilies ||
    JSON.stringify([...new Set(requiredBuildFamilies)].sort()) !==
      JSON.stringify([...expectedBuildFamilies].sort())
  ) {
    fail(`license manifest requiredBuildFamilies must be ${expectedBuildFamilies.join(', ')}`)
  }
  for (const family of requiredBuildFamilies ?? []) {
    if (!familyNames.has(family)) fail(`required build family is absent from artifactFamilies: ${family}`)
  }

  const xetex = (families ?? []).find((family) => family?.name === 'xetex')
  if (!xetex?.distributionTerms?.includes('GPL-2.0-only')) {
    fail('xetex distribution terms must record the selected Xpdf/FreeType GPL-2.0-only terms')
  }
  if (xetex?.releaseBlocker === 'pplib-license-evidence') {
    fail('the WTPDF/Xpdf xetex family must not retain the legacy pplib release blocker')
  }
  const luahbtex = (families ?? []).find((family) => family?.name === 'luahbtex')
  if (!luahbtex?.distributionTerms?.includes('GPL-2.0-only')) {
    fail('luahbtex distribution terms must record the selected Xpdf GPL-2.0-only terms')
  }
  if (luahbtex?.releaseBlocker === 'pplib-license-evidence') {
    fail('the WTPDF/Xpdf luahbtex family must not retain the legacy pplib release blocker')
  }
  if (blockerIds.has('pplib-license-evidence')) {
    fail('the current WTPDF/Xpdf engine build must not retain the legacy pplib release blocker')
  }
  const pdftex = (families ?? []).find((family) => family?.name === 'pdftex')
  if (!pdftex?.distributionTerms?.includes('GPL-2.0-only')) {
    fail('pdftex distribution terms must record the selected Xpdf GPL-2.0-only terms')
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

for (const [relativePath, requiredMaps] of [
  ['wasm-build/Makefile', ['wasmtex-pdftex.map', 'wasmtex-bibtex.map']],
  ['wasm-build/build-bibtex8.sh', ['wasmtex-bibtex8.map']],
  ['wasm-build/build-makeindex.sh', ['wasmtex-makeindex.map']],
  ['wasm-build/build-dvipdfm2.sh', ['wasmtex-dvipdfm.map']],
]) {
  const text = readFileSync(resolve(root, relativePath), 'utf8')
  for (const requiredMap of requiredMaps) {
    if (!text.includes(requiredMap) || !text.includes('-Wl,-Map')) {
      fail(`${relativePath} does not generate required link-map evidence: ${requiredMap}`)
    }
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

const mirrorSync = resolve(root, 'scripts/sync-texlive-s3.sh')
if (existsSync(mirrorSync)) {
  const text = readFileSync(mirrorSync, 'utf8')
  for (const required of [
    'gen-texlive-provenance.mjs',
    'check-texlive-provenance.mjs',
    'TEXMF_ARCHIVE',
    'TEXLIVE_METADATA_ARCHIVE',
    'npm run check:licenses -- --release',
  ]) {
    if (!text.includes(required)) fail(`TeX Live mirror release gate is missing marker: ${required}`)
  }
  for (const forbidden of ['copy_flat', 'first-found wins', '--size-only']) {
    if (text.includes(forbidden)) fail(`TeX Live mirror retains unsafe behavior: ${forbidden}`)
  }
}

const texliveAudit = resolve(root, 'scripts/audit-texlive-provenance.mjs')
if (existsSync(texliveAudit)) {
  const text = readFileSync(texliveAudit, 'utf8')
  for (const required of ['auditMirror', 'auditTlpdb', '--metadata-only']) {
    if (!text.includes(required)) fail(`TeX Live audit tool is missing marker: ${required}`)
  }
}

const texliveBundle = resolve(root, 'scripts/bundle-texlive.mjs')
if (existsSync(texliveBundle)) {
  const text = readFileSync(texliveBundle, 'utf8')
  for (const required of ['TEXLIVE_PROVENANCE_MANIFEST', 'record.sha256', 'developmentOnly']) {
    if (!text.includes(required)) fail(`TeX Live development capture gate is missing marker: ${required}`)
  }
}

const assetManifestGenerator = resolve(root, 'scripts/gen-asset-manifest.mjs')
if (existsSync(assetManifestGenerator)) {
  const text = readFileSync(assetManifestGenerator, 'utf8')
  for (const required of ['inspectReleaseAssets', 'buildReceipts', 'releaseIdFor']) {
    if (!text.includes(required)) fail(`asset manifest build-receipt gate is missing marker: ${required}`)
  }
}

const sourceBuilder = resolve(root, 'scripts/build-corresponding-source.mjs')
if (existsSync(sourceBuilder)) {
  const text = readFileSync(sourceBuilder, 'utf8')
  for (const required of [
    'inspectReleaseAssets',
    'validateWrittenAssetManifest',
    'libs/pplib',
    'source/emscripten',
    'source/ports',
    'SOURCE-MANIFEST.json',
    '--sort=name',
  ]) {
    if (!text.includes(required)) fail(`corresponding-source builder is missing marker: ${required}`)
  }
}

for (const workflow of [
  '.github/workflows/wasm-build.yml',
  '.github/workflows/wasm-bibtex8.yml',
  '.github/workflows/wasm-luatex.yml',
  '.github/workflows/wasm-makeindex.yml',
  '.github/workflows/wasm-xetex.yml',
]) {
  const text = readFileSync(resolve(root, workflow), 'utf8')
  if (!text.includes('gen-engine-build-receipt.mjs') || !text.includes('BUILD-RECEIPT.')) {
    fail(`${workflow} does not publish an engine build receipt`)
  }
}

const pdftexWorkflow = readFileSync(resolve(root, '.github/workflows/wasm-build.yml'), 'utf8')
for (const required of [
  'extract-format.mjs',
  'wasmtex-pdftex.fmt',
  'wasmtex-kpse-resolve.js public/wasmtex/2025/',
]) {
  if (!pdftexWorkflow.includes(required)) {
    fail(`pdfTeX workflow does not bind its generated format dependency: ${required}`)
  }
}

const aggregateWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8')
for (const requiredArtifact of [
  'wasm-pdftex',
  'wasm-bibtex',
  'wasm-bibtex8',
  'wasm-makeindex',
  'wasm-xetex',
  'wasm-luatex',
]) {
  if (!aggregateWorkflow.includes(`name: ${requiredArtifact}`)) {
    fail(`aggregate workflow omits required build artifact: ${requiredArtifact}`)
  }
}

for (const workflow of ['.github/workflows/wasm-xetex.yml', '.github/workflows/wasm-luatex.yml']) {
  const text = readFileSync(resolve(root, workflow), 'utf8')
  if (!text.includes('gzip -n -9 -c')) {
    fail(`${workflow} must produce timestamp-free deterministic format archives`)
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
