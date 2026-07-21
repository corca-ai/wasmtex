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

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = process.argv[2] ?? '2025'
const requireReleaseCleared = process.argv.includes('--release')
const dir = join(root, `public/wasmtex/${version}`)
const licenseManifestPath = join(dir, 'LICENSE-MANIFEST.json')

if (!existsSync(dir)) {
  console.error(`No asset dir: ${dir}`)
  process.exit(1)
}

if (!existsSync(licenseManifestPath)) {
  console.error(`Missing engine license manifest: ${licenseManifestPath}`)
  process.exit(1)
}

const legal = JSON.parse(readFileSync(licenseManifestPath, 'utf8'))
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

const manifest = {
  version,
  legal: {
    manifest: 'LICENSE-MANIFEST.json',
    releaseStatus: legal.releaseStatus,
    noticePath: legal.noticePath,
    requirementsPath: legal.requirementsPath,
    correspondingSource: legal.correspondingSource,
    texliveProvenance: legal.texliveProvenance,
    releaseBlockers: legal.releaseBlockers,
  },
  files,
}
writeFileSync(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${dir}/manifest.json (${files.length} files)`)
if (legal.releaseStatus !== 'release-cleared') {
  console.warn(`warning: engine license status is ${legal.releaseStatus}`)
}
for (const f of files) console.log(`  ${f.sha256.slice(0, 12)}  ${String(f.bytes).padStart(9)}  ${f.name}`)
