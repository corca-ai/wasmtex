import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { extractTexSemantics, mergeSemanticMetadata } from './tex-semantic-extractor.mjs'
import { mirrorRevisionFor } from './texlive-provenance.mjs'

export const TEX_SEMANTIC_SCHEMA_VERSION = 1

const VALUE_TYPES = new Set([
  'flag',
  'boolean',
  'enum',
  'number',
  'dimension',
  'color',
  'file',
  'command',
  'free-text',
  'tex-class',
  'tex-package',
  'bib-style',
  'biblatex-style',
  'font-family',
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function extension(fileName) {
  const dot = fileName.lastIndexOf('.')
  return dot < 0 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function resourceScope(file) {
  const fileName = basename(file.key)
  const ext = extension(fileName)
  const kind = ext === 'cls' ? 'class' : ext === 'sty' ? 'package' : null
  if (!kind) return null
  const name = fileName.slice(0, -(ext.length + 1))
  return { id: `${kind}/${name}`, kind, name, fileName }
}

function engineConstraints(sourcePath) {
  if (/\/tex\/(?:xetex|xelatex)\//.test(sourcePath)) return ['xetex']
  if (/\/tex\/(?:luatex|lualatex)\//.test(sourcePath)) return ['luatex']
  return []
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('TeX Live provenance schemaVersion must be 1')
  if (!/^\d{4}$/.test(manifest.texliveYear ?? '')) throw new Error('invalid TeX Live year')
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error('TeX Live provenance files must be non-empty')
  }
  if (manifest.mirrorRevision !== mirrorRevisionFor(manifest.texliveYear, manifest.files)) {
    throw new Error('TeX Live provenance mirrorRevision does not match its file inventory')
  }
}

function validateSupplement(value, label, manifest, requireIdentity) {
  if (!value) return
  if (value.schemaVersion !== TEX_SEMANTIC_SCHEMA_VERSION) {
    throw new Error(`${label} schemaVersion must be ${TEX_SEMANTIC_SCHEMA_VERSION}`)
  }
  if (value.texliveYear !== manifest.texliveYear) throw new Error(`${label} TeX Live year mismatch`)
  if (requireIdentity && value.mirrorRevision !== manifest.mirrorRevision) {
    throw new Error(`${label} mirror revision mismatch`)
  }
  if (!value.scopes || typeof value.scopes !== 'object') throw new Error(`${label} has no scopes`)
}

function validateMetadata(metadata, scopeId) {
  for (const family of metadata.keyFamilies) {
    if (!family.name || !Array.isArray(family.keys)) throw new Error(`${scopeId}: invalid key family`)
    for (const key of family.keys) {
      if (!key.name || !VALUE_TYPES.has(key.value?.type)) {
        throw new Error(`${scopeId}/${family.name}: invalid semantic key`)
      }
      if (key.value.type === 'enum' && !Array.isArray(key.value.values)) {
        throw new Error(`${scopeId}/${family.name}/${key.name}: enum has no values`)
      }
      if (!Array.isArray(key.provenance) || key.provenance.length === 0) {
        throw new Error(`${scopeId}/${family.name}/${key.name}: missing provenance`)
      }
    }
  }
}

function metadataCoverage(metadata) {
  const keys = metadata.keyFamilies.flatMap((family) => family.keys)
  const records = [...keys, ...metadata.commands, ...metadata.environments]
  const hasEvidence = (record, evidence) =>
    record.provenance?.some((entry) => entry.evidence === evidence) ?? false
  const unresolved = metadata.unsupported.length + (records.length === 0 ? 1 : 0)
  return {
    keys: keys.length,
    commands: metadata.commands.length,
    environments: metadata.environments.length,
    exact: records.filter((record) => record.confidence === 'exact').length,
    declared: records.filter((record) => hasEvidence(record, 'declared')).length,
    observed: records.filter((record) => hasEvidence(record, 'observed')).length,
    inferred: records.filter((record) => record.confidence === 'inferred').length,
    overridden: records.filter((record) => hasEvidence(record, 'override')).length,
    unresolved,
  }
}

function sumCoverage(shards) {
  const keys = [
    'keys',
    'commands',
    'environments',
    'exact',
    'declared',
    'observed',
    'inferred',
    'overridden',
    'unresolved',
  ]
  return Object.fromEntries(
    keys.map((key) => [key, shards.reduce((sum, shard) => sum + shard.coverage[key], 0)]),
  )
}

function supplementMetadata(scope, supplement, label, sourcePath, confidence, evidence) {
  const value = supplement?.scopes?.[scope.id]
  if (!value) return null
  return {
    value,
    defaults: {
      confidence,
      provenance: {
        evidence,
        sourcePath,
        extractor: label,
        ...(value.sourceId ? { note: value.sourceId } : {}),
      },
    },
  }
}

function mergeScopeMetadata(base, supplement) {
  return supplement
    ? mergeSemanticMetadata(base, supplement.value, supplement.defaults)
    : base
}

function descriptorPath(scope) {
  return `${scope.kind === 'class' ? 'classes' : 'packages'}/${encodeURIComponent(scope.name)}.json`
}

function verifyMirrorFile(mirrorRoot, file) {
  const path = join(mirrorRoot, file.key)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${file.key}: mirror file is missing`)
  const bytes = readFileSync(path)
  if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) {
    throw new Error(`${file.key}: mirror bytes do not match provenance`)
  }
  return bytes.toString('utf8')
}

export function buildTexSemanticCatalog({
  manifest,
  mirrorRoot,
  overrides = null,
  probeReport = null,
  sourceHashes = {},
}) {
  validateManifest(manifest)
  validateSupplement(overrides, 'semantic overrides', manifest, false)
  validateSupplement(probeReport, 'semantic probe report', manifest, true)

  const shardBytes = new Map()
  const descriptors = {}
  const builtShards = []
  const presentScopes = new Set()
  for (const file of manifest.files) {
    const scope = resourceScope(file)
    if (!scope) continue
    presentScopes.add(scope.id)
    const source = verifyMirrorFile(mirrorRoot, file)
    let metadata = extractTexSemantics({
      source,
      sourcePath: file.source.path,
      scopeKind: scope.kind,
      scopeName: scope.name,
    })
    metadata = mergeScopeMetadata(
      metadata,
      supplementMetadata(
        scope,
        probeReport,
        'offline-probe',
        probeReport?.source ?? 'tex-semantic-probe-report.json',
        'observed',
        'observed',
      ),
    )
    metadata = mergeScopeMetadata(
      metadata,
      supplementMetadata(
        scope,
        overrides,
        'curated-override',
        overrides?.source ?? 'scripts/tex-semantic-overrides.json',
        'overridden',
        'override',
      ),
    )
    validateMetadata(metadata, scope.id)
    const coverage = metadataCoverage(metadata)
    const override = overrides?.scopes?.[scope.id]
    const engines = [
      ...new Set([...engineConstraints(file.source.path), ...(override?.engines ?? [])]),
    ].sort()
    const shard = {
      schemaVersion: TEX_SEMANTIC_SCHEMA_VERSION,
      texliveYear: manifest.texliveYear,
      mirrorRevision: manifest.mirrorRevision,
      scope: {
        ...scope,
        key: file.key,
        sourcePath: file.source.path,
        texlivePackage: file.source.package,
        packageRevision: file.source.packageRevision,
        catalogue: file.source.catalogue,
        ...(file.source.catalogue
          ? { documentationUrl: `https://ctan.org/pkg/${encodeURIComponent(file.source.catalogue)}` }
          : {}),
        ...(engines.length > 0 ? { engines } : {}),
      },
      keyFamilies: metadata.keyFamilies,
      commands: metadata.commands,
      environments: metadata.environments,
      dependencies: metadata.dependencies,
      unsupported: metadata.unsupported,
      coverage,
    }
    const path = descriptorPath(scope)
    const bytes = jsonBytes(shard)
    shardBytes.set(path, bytes)
    descriptors[scope.id] = { path, sha256: sha256(bytes), coverage }
    builtShards.push(shard)
  }

  const overrideScopesAbsent = Object.keys(overrides?.scopes ?? {})
    .filter((scope) => !presentScopes.has(scope))
    .sort()
  const coverage = sumCoverage(builtShards)
  const index = {
    schemaVersion: TEX_SEMANTIC_SCHEMA_VERSION,
    texliveYear: manifest.texliveYear,
    mirrorRevision: manifest.mirrorRevision,
    source: {
      manifest: 'texlive-provenance.json',
      ...(sourceHashes.manifest ? { manifestSha256: sourceHashes.manifest } : {}),
      ...(sourceHashes.overrides ? { overridesSha256: sourceHashes.overrides } : {}),
      ...(sourceHashes.probes ? { probesSha256: sourceHashes.probes } : {}),
    },
    summary: {
      scopes: builtShards.length,
      scopesWithMetadata: builtShards.filter(
        (shard) => shard.coverage.keys + shard.coverage.commands + shard.coverage.environments > 0,
      ).length,
      ...coverage,
      overrideScopesAbsent,
    },
    scopes: Object.fromEntries(Object.entries(descriptors).sort(([a], [b]) => a.localeCompare(b))),
  }
  const coverageReport = {
    schemaVersion: TEX_SEMANTIC_SCHEMA_VERSION,
    texliveYear: manifest.texliveYear,
    mirrorRevision: manifest.mirrorRevision,
    summary: index.summary,
    scopes: builtShards
      .map((shard) => ({
        id: shard.scope.id,
        coverage: shard.coverage,
        unsupported: shard.unsupported,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  }
  return { index, coverageReport, shardBytes }
}

function readOptionalJson(path) {
  if (!path) return { value: null, hash: null }
  const bytes = readFileSync(path)
  return { value: JSON.parse(bytes), hash: sha256(bytes) }
}

export function generateTexSemanticCatalog({
  manifestPath,
  mirrorRoot,
  overridesPath = null,
  probeReportPath = null,
  outputDir,
}) {
  const manifestBytes = readFileSync(manifestPath)
  const overrides = readOptionalJson(overridesPath)
  const probes = readOptionalJson(probeReportPath)
  const result = buildTexSemanticCatalog({
    manifest: JSON.parse(manifestBytes),
    mirrorRoot,
    overrides: overrides.value,
    probeReport: probes.value,
    sourceHashes: {
      manifest: sha256(manifestBytes),
      ...(overrides.hash ? { overrides: overrides.hash } : {}),
      ...(probes.hash ? { probes: probes.hash } : {}),
    },
  })
  if (existsSync(outputDir) && readdirSync(outputDir).length > 0) {
    throw new Error(`semantic catalog output directory is not empty: ${outputDir}`)
  }
  mkdirSync(outputDir, { recursive: true })
  for (const [path, bytes] of result.shardBytes) {
    mkdirSync(dirname(join(outputDir, path)), { recursive: true })
    writeFileSync(join(outputDir, path), bytes)
  }
  writeFileSync(join(outputDir, 'index.json'), jsonBytes(result.index))
  writeFileSync(join(outputDir, 'coverage.json'), jsonBytes(result.coverageReport))
  return result
}

export function checkTexSemanticCatalog(options) {
  const expected = buildTexSemanticCatalog(options)
  const failures = []
  const expectedFiles = new Map([
    ['index.json', jsonBytes(expected.index)],
    ['coverage.json', jsonBytes(expected.coverageReport)],
    ...expected.shardBytes,
  ])
  for (const [path, bytes] of expectedFiles) {
    const actualPath = join(options.catalogDir, path)
    if (!existsSync(actualPath)) {
      failures.push(`${path}: semantic catalog output is missing`)
      continue
    }
    if (readFileSync(actualPath, 'utf8') !== bytes) {
      failures.push(`${path}: semantic catalog has deterministic generation drift`)
    }
  }
  const visit = (dir, prefix = '') => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) visit(join(dir, entry.name), relative)
      else if (!expectedFiles.has(relative)) failures.push(`${relative}: unexpected semantic output`)
    }
  }
  visit(options.catalogDir)
  return failures
}

export function loadTexSemanticInputs({ manifestPath, overridesPath, probeReportPath }) {
  const manifestBytes = readFileSync(manifestPath)
  const overrides = readOptionalJson(overridesPath)
  const probes = readOptionalJson(probeReportPath)
  return {
    manifest: JSON.parse(manifestBytes),
    overrides: overrides.value,
    probeReport: probes.value,
    sourceHashes: {
      manifest: sha256(manifestBytes),
      ...(overrides.hash ? { overrides: overrides.hash } : {}),
      ...(probes.hash ? { probes: probes.hash } : {}),
    },
  }
}
