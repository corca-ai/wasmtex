#!/usr/bin/env node
/**
 * Generate `public/wasmtex/<version>/manifest.json` — a deterministic listing
 * of the engine assets for a TeX Live version (name + byte size + SHA-256),
 * together with the release's machine-readable licensing status.
 *
 * Why: the engine WASM, dvipdfmx, BibTeX, and the prebuilt `.fmt`/`.fmt.gz` are
 * gitignored and shipped via CI artifacts, so a consumer self-hosting assets has
 * no way to know the exact, matching file set. CI runs this after downloading the
 * engine artifacts and deploys the manifest alongside them; consumers then sync +
 * verify against it with `scripts/sync-engine-assets.mjs` (see docs/engine.md).
 *
 * Deterministic: files sorted by name, content-hashed, no timestamps — so an
 * unchanged asset set yields a byte-identical manifest.
 *
 * Usage: node scripts/gen-asset-manifest.mjs [version] [--release]   (default 2025)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateBuildReceipt } from './lib/engine-build-receipt.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] ?? '2025'
const requireReleaseCleared = process.argv.includes('--release')
const dir = join(root, `public/wasmtex/${version}`)
const licenseManifestPath = join(dir, 'LICENSE-MANIFEST.json')
const sourceConfigPath = join(root, `scripts/corresponding-source-${version}.json`)

if (!existsSync(dir)) {
  console.error(`No asset dir: ${dir}`)
  process.exit(1)
}

if (!existsSync(licenseManifestPath)) {
  console.error(`Missing engine license manifest: ${licenseManifestPath}`)
  process.exit(1)
}
if (!existsSync(sourceConfigPath)) {
  console.error(`Missing corresponding-source config: ${sourceConfigPath}`)
  process.exit(1)
}

const legal = JSON.parse(readFileSync(licenseManifestPath, 'utf8'))
const sourceConfig = JSON.parse(readFileSync(sourceConfigPath, 'utf8'))
if (legal.texliveVersion !== version) {
  console.error(
    `License manifest version ${String(legal.texliveVersion)} does not match asset version ${version}`,
  )
  process.exit(1)
}

function clearedReleaseErrors(value) {
  const errors = []
  if (!value.correspondingSource?.url) errors.push('missing correspondingSource.url')
  if (!/^[a-f0-9]{64}$/i.test(value.correspondingSource?.sha256 ?? '')) {
    errors.push('missing or invalid correspondingSource.sha256')
  }
  if (!value.texliveProvenance?.url) errors.push('missing texliveProvenance.url')
  if (!/^[a-f0-9]{64}$/i.test(value.texliveProvenance?.sha256 ?? '')) {
    errors.push('missing or invalid texliveProvenance.sha256')
  }
  if (!Array.isArray(value.releaseBlockers) || value.releaseBlockers.length > 0) {
    errors.push('releaseBlockers is not an empty array')
  }
  if (
    !Array.isArray(value.artifactFamilies) ||
    value.artifactFamilies.some((family) => family.releaseBlocker)
  ) {
    errors.push('an artifact family still has a releaseBlocker')
  }
  return errors
}

if (legal.releaseStatus === 'release-cleared') {
  const errors = clearedReleaseErrors(legal)
  if (errors.length > 0) {
    console.error(`Invalid release-cleared license manifest: ${errors.join('; ')}`)
    process.exit(1)
  }
}
if (requireReleaseCleared && legal.releaseStatus !== 'release-cleared') {
  const blockers = Array.isArray(legal.releaseBlockers)
    ? legal.releaseBlockers.map((blocker) => blocker.id).filter(Boolean).join(', ')
    : 'unspecified'
  console.error(
    `Refusing release manifest: status is ${legal.releaseStatus}; blockers: ${blockers}`,
  )
  process.exit(1)
}

const files = readdirSync(dir)
  .filter((name) => name !== 'manifest.json' && statSync(join(dir, name)).isFile())
  .sort()
  .map((name) => {
    const buf = readFileSync(join(dir, name))
    return { name, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') }
  })

const receiptFiles = files.filter((file) => /^BUILD-RECEIPT\.[a-zA-Z0-9_-]+\.json$/.test(file.name))
const buildReceipts = []
const receiptCoverage = new Map()
const receiptErrors = []
for (const receiptFile of receiptFiles) {
  let receipt
  try {
    receipt = JSON.parse(readFileSync(join(dir, receiptFile.name), 'utf8'))
  } catch (error) {
    receiptErrors.push(`${receiptFile.name}: ${error instanceof Error ? error.message : String(error)}`)
    continue
  }
  const filenameFamily = receiptFile.name.match(/^BUILD-RECEIPT\.([a-zA-Z0-9_-]+)\.json$/)?.[1]
  if (receipt.family !== filenameFamily) {
    receiptErrors.push(`${receiptFile.name}: filename family does not match receipt family`)
  }
  if (receipt.texliveSourceCommit !== legal.texliveSourceCommit) {
    receiptErrors.push(`${receiptFile.name}: TeX Live source commit does not match license manifest`)
  }
  for (const error of validateBuildReceipt(receipt, { config: sourceConfig, actualDirectory: dir })) {
    receiptErrors.push(`${receiptFile.name}: ${error}`)
  }
  for (const artifact of receipt.files ?? []) {
    const owners = receiptCoverage.get(artifact.name) ?? []
    owners.push(receiptFile.name)
    receiptCoverage.set(artifact.name, owners)
  }
  buildReceipts.push({
    name: receiptFile.name,
    sha256: receiptFile.sha256,
    family: receipt.family,
    buildId: receipt.buildId,
    sourceRevision: receipt.sourceRevision,
  })
}

function patternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`)
}

const metadataNames = new Set(['LICENSE-MANIFEST.json', ...receiptFiles.map((file) => file.name)])
for (const file of files) {
  if (metadataNames.has(file.name)) continue
  const coverage = receiptCoverage.get(file.name) ?? []
  if (coverage.length !== 1) {
    receiptErrors.push(
      `${file.name}: expected exactly one build receipt, found ${coverage.length} (${coverage.join(', ')})`,
    )
  }
  const legalFamilies = legal.artifactFamilies.filter((family) =>
    family.patterns.some((pattern) => patternRegex(pattern).test(file.name)),
  )
  if (legalFamilies.length !== 1) {
    receiptErrors.push(
      `${file.name}: expected exactly one license artifact family, found ${legalFamilies.length}`,
    )
  }
}

for (const name of receiptCoverage.keys()) {
  if (!files.some((file) => file.name === name)) {
    receiptErrors.push(`${name}: build receipt names an artifact absent from the release directory`)
  }
}

if (requireReleaseCleared && (buildReceipts.length === 0 || receiptErrors.length > 0)) {
  console.error('Refusing release manifest because build receipts are incomplete:')
  if (buildReceipts.length === 0) console.error('- no build receipts found')
  for (const error of receiptErrors) console.error(`- ${error}`)
  process.exit(1)
}

const releaseHash = createHash('sha256')
  .update(JSON.stringify({ version, files, buildReceipts }))
  .digest('hex')

const manifest = {
  version,
  releaseId: `${version}-${releaseHash.slice(0, 16)}`,
  legal: {
    manifest: 'LICENSE-MANIFEST.json',
    releaseStatus: legal.releaseStatus,
    noticePath: legal.noticePath,
    requirementsPath: legal.requirementsPath,
    correspondingSource: legal.correspondingSource,
    texliveProvenance: legal.texliveProvenance,
    releaseBlockers: legal.releaseBlockers,
  },
  buildReceipts,
  files,
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${dir}/manifest.json (${files.length} files)`)
if (legal.releaseStatus !== 'release-cleared') {
  console.warn(`warning: engine license status is ${legal.releaseStatus}`)
}
if (receiptErrors.length > 0) {
  console.warn(`warning: ${receiptErrors.length} build receipt/classification issue(s) in development assets`)
}
for (const f of files) console.log(`  ${f.sha256.slice(0, 12)}  ${String(f.bytes).padStart(9)}  ${f.name}`)
