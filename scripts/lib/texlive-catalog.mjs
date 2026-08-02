import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { mirrorRevisionFor } from './texlive-provenance.mjs'

export const TEXLIVE_CATALOG_SCHEMA_VERSION = 1

export const CATALOG_SHARDS = {
  'tex-class': 'classes.json',
  'tex-package': 'packages.json',
  'bib-style': 'bib-styles.json',
  'biblatex-style': 'biblatex-styles.json',
  'font-file': 'fonts.json',
}

const EXTENSION_KIND = new Map([
  ['cls', 'tex-class'],
  ['sty', 'tex-package'],
  ['bst', 'bib-style'],
  ['bbx', 'biblatex-style'],
  ['cbx', 'biblatex-style'],
  ['lbx', 'biblatex-style'],
  ['otf', 'font-file'],
  ['ttf', 'font-file'],
  ['ttc', 'font-file'],
])

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function fileExtension(fileName) {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function engineConstraints(sourcePath) {
  if (/\/tex\/(?:xetex|xelatex)\//.test(sourcePath)) return ['xetex']
  if (/\/tex\/(?:luatex|lualatex)\//.test(sourcePath)) return ['luatex']
  return []
}

function resourceRecord(manifest, file) {
  const fileName = basename(file.key)
  const extension = fileExtension(fileName)
  const name = fileName.slice(0, -(extension.length + 1))
  const engines = engineConstraints(file.source.path)
  return {
    name,
    fileName,
    extension,
    key: file.key,
    format: file.format,
    bytes: file.bytes,
    sha256: file.sha256,
    texliveYear: manifest.texliveYear,
    mirrorRevision: manifest.mirrorRevision,
    sourcePath: file.source.path,
    texlivePackage: file.source.package,
    packageRevision: file.source.packageRevision,
    catalogue: file.source.catalogue,
    ...(file.source.catalogue
      ? { documentationUrl: `https://ctan.org/pkg/${encodeURIComponent(file.source.catalogue)}` }
      : {}),
    ...(engines.length > 0 ? { engines } : {}),
    ...(file.collision ? { collision: file.collision } : {}),
  }
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('TeX Live provenance schemaVersion must be 1')
  if (!/^\d{4}$/.test(manifest.texliveYear ?? '')) throw new Error('invalid TeX Live year')
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('TeX Live provenance files must be non-empty')
  }
  const expectedRevision = mirrorRevisionFor(manifest.texliveYear, manifest.files)
  if (manifest.mirrorRevision !== expectedRevision) {
    throw new Error('TeX Live provenance mirrorRevision does not match its file inventory')
  }
}

export function classifyCatalogResource(file) {
  if (!file || typeof file.key !== 'string') return null
  return EXTENSION_KIND.get(fileExtension(basename(file.key))) ?? null
}

export function buildTexliveCatalogs(manifest, sourceManifestSha256 = null) {
  validateManifest(manifest)
  const resources = new Map(Object.keys(CATALOG_SHARDS).map((kind) => [kind, []]))
  for (const file of manifest.files) {
    const kind = classifyCatalogResource(file)
    if (!kind) continue
    if (!file.source?.path || !file.source?.package) {
      throw new Error(`${file.key}: catalog resource has incomplete provenance`)
    }
    resources.get(kind).push(resourceRecord(manifest, file))
  }

  const shards = {}
  const shardBytes = new Map()
  for (const [kind, path] of Object.entries(CATALOG_SHARDS)) {
    const records = resources
      .get(kind)
      .sort((a, b) =>
        a.name.localeCompare(b.name) ||
        a.fileName.localeCompare(b.fileName) ||
        a.sourcePath.localeCompare(b.sourcePath),
      )
    const shard = {
      schemaVersion: TEXLIVE_CATALOG_SCHEMA_VERSION,
      texliveYear: manifest.texliveYear,
      mirrorRevision: manifest.mirrorRevision,
      kind,
      resources: records,
    }
    const bytes = jsonBytes(shard)
    shardBytes.set(path, bytes)
    shards[kind] = { path, count: records.length, sha256: sha256(bytes) }
  }

  const index = {
    schemaVersion: TEXLIVE_CATALOG_SCHEMA_VERSION,
    texliveYear: manifest.texliveYear,
    mirrorRevision: manifest.mirrorRevision,
    source: {
      manifest: 'texlive-provenance.json',
      ...(sourceManifestSha256 ? { sha256: sourceManifestSha256 } : {}),
      tlpdbSha256: manifest.source?.tlpdb?.sha256 ?? null,
    },
    summary: {
      mirrorFiles: manifest.files.length,
      catalogResources: [...resources.values()].reduce((sum, values) => sum + values.length, 0),
      collisions: manifest.summary?.collisions ?? 0,
      byKind: Object.fromEntries(
        Object.entries(shards).map(([kind, value]) => [kind, value.count]),
      ),
    },
    shards,
  }
  return { index, shardBytes }
}

export function generateTexliveCatalog({ manifestPath, outputDir }) {
  const manifestBytes = readFileSync(manifestPath)
  const manifest = JSON.parse(manifestBytes)
  const result = buildTexliveCatalogs(manifest, sha256(manifestBytes))
  if (existsSync(outputDir) && readdirSync(outputDir).length > 0) {
    throw new Error(`catalog output directory is not empty: ${outputDir}`)
  }
  mkdirSync(outputDir, { recursive: true })
  for (const [path, bytes] of result.shardBytes) writeFileSync(join(outputDir, path), bytes)
  writeFileSync(join(outputDir, 'index.json'), jsonBytes(result.index))
  return result.index
}

function checkRecord(record, kind, manifest, manifestFiles, failures, seen) {
  if (!record || typeof record !== 'object' || typeof record.key !== 'string') {
    failures.push(`${kind}: shard contains an invalid resource record`)
    return
  }
  const source = manifestFiles.get(record.key)
  if (!source) {
    failures.push(`${record.key}: resource is absent from the provenance manifest`)
    return
  }
  if (classifyCatalogResource(source) !== kind) failures.push(`${record.key}: wrong catalog kind`)
  if (JSON.stringify(record) !== JSON.stringify(resourceRecord(manifest, source))) {
    failures.push(`${record.key}: resource does not exactly match derived mirror metadata`)
  }
  if (seen.has(record.key)) failures.push(`${record.key}: duplicated catalog resource`)
  seen.add(record.key)
}

export function checkTexliveCatalog({ manifest, catalogDir, manifestSha256 = null }) {
  const failures = []
  try {
    validateManifest(manifest)
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)]
  }
  const indexPath = join(catalogDir, 'index.json')
  if (!existsSync(indexPath)) return ['catalog index.json is missing']
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  if (index.schemaVersion !== TEXLIVE_CATALOG_SCHEMA_VERSION) failures.push('catalog schema mismatch')
  if (index.texliveYear !== manifest.texliveYear) failures.push('catalog TeX Live year mismatch')
  if (index.mirrorRevision !== manifest.mirrorRevision) failures.push('catalog mirror revision mismatch')
  if (index.source?.manifest !== 'texlive-provenance.json') {
    failures.push('catalog source manifest name mismatch')
  }
  if (manifestSha256 && index.source?.sha256 !== manifestSha256) {
    failures.push('catalog source manifest SHA-256 mismatch')
  }
  if (index.source?.tlpdbSha256 !== (manifest.source?.tlpdb?.sha256 ?? null)) {
    failures.push('catalog TLPDB provenance mismatch')
  }

  const manifestFiles = new Map(manifest.files.map((file) => [file.key, file]))
  const seen = new Set()
  const expectedCatalog = buildTexliveCatalogs(manifest)
  for (const [kind, expectedPath] of Object.entries(CATALOG_SHARDS)) {
    const descriptor = index.shards?.[kind]
    if (descriptor?.path !== expectedPath) {
      failures.push(`${kind}: index has an invalid shard path`)
      continue
    }
    const path = join(catalogDir, expectedPath)
    if (!existsSync(path) || !statSync(path).isFile()) {
      failures.push(`${kind}: shard is missing`)
      continue
    }
    const bytes = readFileSync(path)
    if (sha256(bytes) !== descriptor.sha256) failures.push(`${kind}: shard SHA-256 mismatch`)
    if (bytes.toString('utf8') !== expectedCatalog.shardBytes.get(expectedPath)) {
      failures.push(`${kind}: shard has deterministic generation drift`)
    }
    const shard = JSON.parse(bytes)
    if (
      shard.schemaVersion !== index.schemaVersion ||
      shard.texliveYear !== index.texliveYear ||
      shard.mirrorRevision !== index.mirrorRevision ||
      shard.kind !== kind
    ) {
      failures.push(`${kind}: shard identity mismatch`)
      continue
    }
    if (shard.resources.length !== descriptor.count) failures.push(`${kind}: shard count mismatch`)
    for (const record of shard.resources) {
      checkRecord(record, kind, manifest, manifestFiles, failures, seen)
    }
  }

  if (JSON.stringify(index.summary) !== JSON.stringify(expectedCatalog.index.summary)) {
    failures.push('catalog summary does not match the mirror inventory')
  }
  if (JSON.stringify(index.shards) !== JSON.stringify(expectedCatalog.index.shards)) {
    failures.push('catalog shard descriptors do not match deterministic output')
  }

  const expected = manifest.files.filter(classifyCatalogResource).map((file) => file.key)
  for (const key of expected) if (!seen.has(key)) failures.push(`${key}: missing catalog resource`)
  if (seen.size !== expected.length) failures.push('catalog resource total does not match manifest')
  const allowed = new Set(['index.json', ...Object.values(CATALOG_SHARDS)])
  for (const entry of readdirSync(catalogDir)) {
    if (!allowed.has(entry)) failures.push(`${entry}: unexpected catalog output`)
  }
  return failures
}
