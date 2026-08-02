import { createHash } from 'node:crypto'
import {
  copyFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, extname, join, relative, resolve, sep } from 'node:path'

const FILE_SECTION = /^(runfiles|docfiles|srcfiles|binfiles)(?:\s|$)/
const NOTICE_BASENAME = /(^|[-_.])(copying|copyright|licen[cs]e|notice|readme)([-_.]|$)/i
const SHA256 = /^[a-f0-9]{64}$/i
const SHA512 = /^[a-f0-9]{128}$/i
const COMPLETION_METADATA_EXTENSIONS = new Set([
  '.bbx',
  '.bst',
  '.cbx',
  '.cls',
  '.lbx',
  '.otf',
  '.sty',
  '.ttc',
  '.ttf',
])
const COMPLETION_METADATA_EXTRA_FILES = new Set(['dvipsnam.def', 'svgnam.def', 'x11nam.def'])

export const FORMAT_RULES = [
  {
    format: 26,
    roots: [
      'tex/latex',
      'tex/generic',
      'tex/plain',
      'tex/xetex',
      'tex/xelatex',
      'tex/luatex',
      'tex/lualatex',
    ],
  },
  { format: 3, roots: ['fonts/tfm'], extensions: ['.tfm'], stripExtension: true },
  { format: 32, roots: ['fonts/type1'], extensions: ['.pfb'] },
  { format: 33, roots: ['fonts/vf'], extensions: ['.vf'], stripExtension: true },
  { format: 11, roots: ['fonts/map'], extensions: ['.map'] },
  { format: 11, roots: ['fonts/map/glyphlist'], extensions: ['.txt'] },
  { format: 44, roots: ['fonts/enc'], extensions: ['.enc'] },
  { format: 47, roots: ['fonts/opentype'], extensions: ['.otf'] },
  { format: 36, roots: ['fonts/truetype'], extensions: ['.ttf', '.ttc'] },
  { format: 4, roots: ['fonts/afm'], extensions: ['.afm'] },
  { format: 51, roots: ['tex', 'scripts'], extensions: ['.lua'] },
  { format: 7, roots: ['bibtex/bst'], extensions: ['.bst'] },
  { format: 6, roots: ['bibtex/bib'], extensions: ['.bib'] },
]

function normalizePath(value) {
  return value.split(sep).join('/')
}

function sha(algorithm, path) {
  const hash = createHash(algorithm)
  const descriptor = openSync(path, 'r')
  const buffer = Buffer.allocUnsafe(1024 * 1024)
  try {
    let bytesRead
    while ((bytesRead = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead))
    }
  } finally {
    closeSync(descriptor)
  }
  return hash.digest('hex')
}

function validateHex(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new Error(`${label} is not a valid ${pattern === SHA256 ? 'SHA-256' : 'SHA-512'} digest`)
  }
}

/** Immutable identity of the flattened mirror bytes and their selected provenance. */
export function mirrorRevisionFor(texliveYear, files) {
  if (!/^\d{4}$/.test(texliveYear ?? '')) throw new Error('mirror revision requires a year')
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('mirror revision requires a non-empty file inventory')
  }
  const inventory = [...files]
    .map((file) => ({
      key: file.key,
      sha256: file.sha256,
      sourcePath: file.source?.path,
      package: file.source?.package,
      packageRevision: file.source?.packageRevision,
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)))
  const digest = createHash('sha256').update(JSON.stringify(inventory)).digest('hex')
  return `${texliveYear}-${digest.slice(0, 16)}`
}

function parseFileEntry(line) {
  const value = line.trim()
  if (value.length === 0) return null
  return value.split(/\s+/)[0]
}

export function parseTlpdb(text) {
  const packages = new Map()
  let current = null
  let section = null

  const finish = () => {
    if (!current) return
    if (!current.name) throw new Error('TLPDB record is missing a package name')
    if (packages.has(current.name)) throw new Error(`duplicate TLPDB package: ${current.name}`)
    current.noticePaths = [
      ...new Set(current.files.filter((path) => NOTICE_BASENAME.test(basename(path)))),
    ].sort()
    packages.set(current.name, current)
    current = null
    section = null
  }

  for (const line of text.replaceAll('\r\n', '\n').split('\n')) {
    if (line.length === 0) {
      finish()
      continue
    }
    if (!current) {
      current = {
        name: null,
        revision: null,
        catalogue: null,
        catalogueLicenses: [],
        files: [],
        noticePaths: [],
      }
    }
    if (line.startsWith(' ') && section) {
      const path = parseFileEntry(line)
      if (path) current.files.push(path)
      continue
    }
    section = null
    const sectionMatch = line.match(FILE_SECTION)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }
    const space = line.indexOf(' ')
    const field = space === -1 ? line : line.slice(0, space)
    const value = space === -1 ? '' : line.slice(space + 1)
    if (field === 'name') current.name = value
    else if (field === 'revision') current.revision = value
    else if (field === 'catalogue') current.catalogue = value
    else if (field === 'catalogue-license') {
      current.catalogueLicenses.push(...value.split(/\s+/).filter(Boolean))
    }
  }
  finish()

  const owners = new Map()
  for (const pkg of packages.values()) {
    for (const path of pkg.files) {
      const found = owners.get(path) ?? []
      found.push(pkg.name)
      owners.set(path, found)
    }
  }
  return { packages, owners }
}

function walkFiles(root) {
  if (!existsSync(root)) return []
  const out = []
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) out.push(path)
    }
  }
  visit(root)
  return out
}

function matchesRule(path, rule) {
  if (!rule.extensions) return true
  return rule.extensions.some((extension) => path.toLowerCase().endsWith(extension))
}

function outputName(path, rule) {
  const name = basename(path)
  if (!rule.stripExtension) return name
  const extension = rule.extensions.find((candidate) => name.toLowerCase().endsWith(candidate))
  return extension ? name.slice(0, -extension.length) : name
}

function isCompletionMetadataKey(key) {
  const name = basename(key).toLowerCase()
  return (
    COMPLETION_METADATA_EXTENSIONS.has(extname(name)) || COMPLETION_METADATA_EXTRA_FILES.has(name)
  )
}

function validateConfig(config, overrides) {
  if (config.schemaVersion !== 1) throw new Error('mirror config schemaVersion must be 1')
  if (!/^\d{4}$/.test(config.texliveYear ?? '')) {
    throw new Error('mirror config texliveYear must be a year')
  }
  for (const [key, archive] of [
    ['texmfArchive', config.texmfArchive],
    ['metadataArchive', config.metadataArchive],
  ]) {
    if (
      !archive ||
      typeof archive.filename !== 'string' ||
      !/^https:\/\//.test(archive.url ?? '')
    ) {
      throw new Error(`${key} must declare filename and HTTPS url`)
    }
    validateHex(archive.sha512, SHA512, `${key}.sha512`)
  }
  if (!config.tlpdb || typeof config.tlpdb.archiveMember !== 'string') {
    throw new Error('mirror config must declare tlpdb.archiveMember')
  }
  validateHex(config.tlpdb.sha256, SHA256, 'tlpdb.sha256')
  if (overrides.schemaVersion !== 1) throw new Error('mirror overrides schemaVersion must be 1')
  for (const key of ['fileOwners', 'packageLicenses', 'collisions']) {
    if (!overrides[key] || typeof overrides[key] !== 'object' || Array.isArray(overrides[key])) {
      throw new Error(`mirror overrides ${key} must be an object`)
    }
  }
}

function verifyInput(path, algorithm, expected, label) {
  if (!path) return { verified: false, reason: `${label} path was not supplied` }
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const actual = sha(algorithm, path)
  if (actual !== expected) {
    throw new Error(`${label} digest mismatch: expected ${expected}, got ${actual}`)
  }
  return { verified: true }
}

function resolveOwner(sourcePath, parsed, overrides) {
  const explicit = overrides.fileOwners[sourcePath]
  const owners = parsed.owners.get(sourcePath) ?? []
  if (explicit) {
    if (!owners.includes(explicit)) {
      throw new Error(
        `${sourcePath}: owner override ${explicit} is not among TLPDB owners: ${owners.join(', ')}`,
      )
    }
    return explicit
  }
  if (owners.length === 0) throw new Error(`${sourcePath}: no owning package in the pinned TLPDB`)
  if (owners.length > 1) {
    throw new Error(`${sourcePath}: ambiguous package ownership (${owners.join(', ')}); add fileOwners override`)
  }
  return owners[0]
}

function resolveLicense(pkg, overrides) {
  const explicit = overrides.packageLicenses[pkg.name]
  const licenseIds = explicit?.licenseIds ?? pkg.catalogueLicenses
  if (!Array.isArray(licenseIds) || licenseIds.length === 0) {
    throw new Error(`${pkg.name}: no catalogue license; add a reviewed packageLicenses override`)
  }
  if (licenseIds.some((value) => typeof value !== 'string' || value.length === 0)) {
    throw new Error(`${pkg.name}: invalid license identifier override`)
  }
  const evidence = explicit?.evidence ?? []
  if (!Array.isArray(evidence) || evidence.some((value) => typeof value !== 'string')) {
    throw new Error(`${pkg.name}: package license evidence must be an array of strings`)
  }
  const noticePaths = explicit?.noticePaths ?? pkg.noticePaths
  if (!Array.isArray(noticePaths) || noticePaths.some((value) => typeof value !== 'string')) {
    throw new Error(`${pkg.name}: package noticePaths must be an array of strings`)
  }
  const reviewed = explicit?.reviewed === true
  if (reviewed && evidence.length === 0) {
    throw new Error(`${pkg.name}: a reviewed license override must cite evidence`)
  }
  return {
    ids: [...new Set(licenseIds)].sort(),
    references: [
      ...new Set([
        ...(explicit
          ? []
          : licenseIds.map((id) => `https://ctan.org/license/${encodeURIComponent(id)}`)),
        ...evidence,
      ]),
    ].sort(),
    source: explicit ? 'package-override' : 'texlive-tlpdb-catalogue-license',
    reviewed,
    noticePaths: [...new Set(noticePaths)].sort(),
  }
}

function resolveCollision(key, candidates, overrides) {
  if (candidates.length === 1) return { selected: candidates[0], collision: null }
  const hashes = new Set(candidates.map((candidate) => candidate.sha256))
  if (hashes.size === 1) {
    return {
      selected: candidates[0],
      collision: {
        decision: 'identical-content',
        selectedSource: candidates[0].sourcePath,
        candidateSources: candidates.map((candidate) => candidate.sourcePath),
      },
    }
  }

  const override = overrides.collisions[key]
  if (
    !override ||
    typeof override.selectedSource !== 'string' ||
    typeof override.rationale !== 'string'
  ) {
    throw new Error(`${key}: differing basename collision requires a reviewed collision override`)
  }
  const selected = candidates.find((candidate) => candidate.sourcePath === override.selectedSource)
  if (!selected) throw new Error(`${key}: collision override selectedSource is not a candidate`)
  const rejected = candidates
    .filter((candidate) => candidate !== selected)
    .map((candidate) => candidate.sourcePath)
    .sort()
  const declaredRejected = [...(override.rejectedSources ?? [])].sort()
  if (JSON.stringify(rejected) !== JSON.stringify(declaredRejected) || override.rationale.trim() === '') {
    throw new Error(`${key}: collision override must enumerate every rejected source and give a rationale`)
  }
  return {
    selected,
    collision: {
      decision: 'reviewed-override',
      selectedSource: selected.sourcePath,
      candidateSources: candidates.map((candidate) => candidate.sourcePath),
      rationale: override.rationale,
    },
  }
}

function validateNoticePaths(texmfDist, pkg, noticePaths) {
  const texmfRoot = resolve(texmfDist)
  for (const noticePath of noticePaths) {
    if (!noticePath.startsWith('texmf-dist/')) {
      throw new Error(`${pkg.name}: notice path must be inside texmf-dist: ${noticePath}`)
    }
    const absolute = resolve(texmfDist, noticePath.slice('texmf-dist/'.length))
    if (absolute !== texmfRoot && !absolute.startsWith(`${texmfRoot}${sep}`)) {
      throw new Error(`${pkg.name}: notice path escapes texmf-dist: ${noticePath}`)
    }
    if (!pkg.files.includes(noticePath)) {
      throw new Error(`${pkg.name}: notice path is not owned by the package: ${noticePath}`)
    }
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      throw new Error(`${pkg.name}: notice evidence does not exist: ${noticePath}`)
    }
  }
}

function collectCandidates(texmfDist, includeKey = null) {
  const candidatesByKey = new Map()
  for (const rule of FORMAT_RULES) {
    for (const root of rule.roots) {
      const absoluteRoot = join(texmfDist, root)
      for (const path of walkFiles(absoluteRoot)) {
        if (!matchesRule(path, rule)) continue
        const relativePath = normalizePath(relative(texmfDist, path))
        const sourcePath = `texmf-dist/${relativePath}`
        const name = outputName(path, rule)
        const key = `pdftex/${rule.format}/${name}`
        if (includeKey && !includeKey(key)) continue
        const fileStat = statSync(path)
        const candidates = candidatesByKey.get(key) ?? []
        candidates.push({
          absolutePath: path,
          sourcePath,
          bytes: fileStat.size,
          sha256: sha('sha256', path),
        })
        candidatesByKey.set(key, candidates)
      }
    }
  }
  return candidatesByKey
}

function collectMetadataCandidates(parsed) {
  const candidatesByKey = new Map()
  for (const sourcePath of parsed.owners.keys()) {
    if (!sourcePath.startsWith('texmf-dist/')) continue
    const relativePath = sourcePath.slice('texmf-dist/'.length)
    for (const rule of FORMAT_RULES) {
      if (!rule.roots.some((root) => relativePath.startsWith(`${root}/`))) continue
      if (!matchesRule(relativePath, rule)) continue
      const name = outputName(relativePath, rule)
      const key = `pdftex/${rule.format}/${name}`
      const candidates = candidatesByKey.get(key) ?? []
      candidates.push({ sourcePath, bytes: null, sha256: sourcePath })
      candidatesByKey.set(key, candidates)
    }
  }
  return candidatesByKey
}

function loadPinnedTlpdb(tlpdbPath, config) {
  if (!existsSync(tlpdbPath)) throw new Error(`TLPDB does not exist: ${tlpdbPath}`)
  const tlpdbSha256 = sha('sha256', tlpdbPath)
  if (tlpdbSha256 !== config.tlpdb.sha256) {
    throw new Error(`TLPDB digest mismatch: expected ${config.tlpdb.sha256}, got ${tlpdbSha256}`)
  }
  return { tlpdbSha256, parsed: parseTlpdb(readFileSync(tlpdbPath, 'utf8')) }
}

function packageAuditEntry(pkg, license, reviewIssues) {
  return {
    package: pkg.name,
    revision: pkg.revision,
    catalogue: pkg.catalogue,
    catalogueLicenses: pkg.catalogueLicenses,
    resolvedLicenseIds: license?.ids ?? [],
    licenseReviewed: license?.reviewed ?? false,
    noticePaths: license?.noticePaths ?? pkg.noticePaths,
    reviewIssues,
  }
}

function reviewQueue(packageList) {
  return packageList
    .map((pkg) => {
      const reasons = []
      if (pkg.resolvedLicenseIds.length === 0) reasons.push('missing-license-metadata')
      if (!pkg.licenseReviewed) reasons.push('license-review-required')
      if (pkg.noticePaths.length === 0) reasons.push('notice-evidence-required')
      reasons.push(...pkg.reviewIssues.map((issue) => issue.type))
      return {
        package: pkg.package,
        revision: pkg.revision,
        catalogue: pkg.catalogue,
        catalogueLicenses: pkg.catalogueLicenses,
        noticePaths: pkg.noticePaths,
        reasons: [...new Set(reasons)].sort(),
      }
    })
    .filter((pkg) => pkg.reasons.length > 0)
}

function auditSummary(packageList, queue) {
  return {
    packages: packageList.length,
    packagesRequiringReview: queue.length,
    unreviewedPackages: packageList.filter((pkg) => !pkg.licenseReviewed).length,
    missingLicensePackages: packageList.filter((pkg) => pkg.resolvedLicenseIds.length === 0).length,
    packagesWithoutNoticeEvidence: packageList.filter((pkg) => pkg.noticePaths.length === 0).length,
  }
}

export function auditMirror({ texmfDist, tlpdbPath, config, overrides }) {
  validateConfig(config, overrides)
  if (!existsSync(texmfDist) || !statSync(texmfDist).isDirectory()) {
    throw new Error(`texmf-dist directory does not exist: ${texmfDist}`)
  }
  const { tlpdbSha256, parsed } = loadPinnedTlpdb(tlpdbPath, config)
  const candidatesByKey = collectCandidates(texmfDist)
  const collisions = []
  const errors = []
  const packages = new Map()

  const inspectCandidate = (key, candidate) => {
    let owner
    try {
      owner = resolveOwner(candidate.sourcePath, parsed, overrides)
    } catch (error) {
      errors.push({
        type: 'package-owner',
        key,
        sourcePath: candidate.sourcePath,
        detail: error instanceof Error ? error.message : String(error),
      })
      return
    }
    const pkg = parsed.packages.get(owner)
    if (packages.has(owner)) return
    let license = null
    const reviewIssues = []
    try {
      license = resolveLicense(pkg, overrides)
    } catch (error) {
      const issue = {
        type: 'license-metadata',
        detail: error instanceof Error ? error.message : String(error),
      }
      reviewIssues.push(issue)
      errors.push({
        type: issue.type,
        package: owner,
        detail: issue.detail,
      })
    }
    try {
      if (license) validateNoticePaths(texmfDist, pkg, license.noticePaths)
    } catch (error) {
      const issue = {
        type: 'notice-evidence',
        detail: error instanceof Error ? error.message : String(error),
      }
      reviewIssues.push(issue)
      errors.push({
        type: issue.type,
        package: owner,
        detail: issue.detail,
      })
    }
    packages.set(owner, packageAuditEntry(pkg, license, reviewIssues))
  }

  for (const key of [...candidatesByKey.keys()].sort()) {
    const candidates = candidatesByKey.get(key)
    let selected = null
    try {
      const resolution = resolveCollision(key, candidates, overrides)
      selected = resolution.selected
      if (resolution.collision) collisions.push({ key, ...resolution.collision })
    } catch (error) {
      collisions.push({
        key,
        decision: 'unresolved',
        candidates: candidates.map(({ sourcePath, bytes, sha256 }) => ({ sourcePath, bytes, sha256 })),
        detail: error instanceof Error ? error.message : String(error),
      })
      errors.push({
        type: 'collision',
        key,
        detail: error instanceof Error ? error.message : String(error),
      })
    }
    if (selected) inspectCandidate(key, selected)
    else for (const candidate of candidates) inspectCandidate(key, candidate)
  }

  const packageList = [...packages.values()].sort((a, b) => a.package.localeCompare(b.package))
  const packageReviewQueue = reviewQueue(packageList)
  return {
    schemaVersion: 1,
    texliveYear: config.texliveYear,
    tlpdbSha256,
    summary: {
      mirrorKeys: candidatesByKey.size,
      sourceCandidates: [...candidatesByKey.values()].reduce((sum, values) => sum + values.length, 0),
      ...auditSummary(packageList, packageReviewQueue),
      collisions: collisions.length,
      unresolvedCollisions: collisions.filter((collision) => collision.decision === 'unresolved').length,
      errors: errors.length,
    },
    packages: packageList,
    reviewQueue: packageReviewQueue,
    collisions,
    errors,
  }
}

export function auditTlpdb({ tlpdbPath, config, overrides }) {
  validateConfig(config, overrides)
  const { tlpdbSha256, parsed } = loadPinnedTlpdb(tlpdbPath, config)
  const candidatesByKey = collectMetadataCandidates(parsed)
  const collisions = []
  const errors = []
  const packages = new Map()

  const inspectCandidate = (key, candidate) => {
    let owner
    try {
      owner = resolveOwner(candidate.sourcePath, parsed, overrides)
    } catch (error) {
      errors.push({
        type: 'package-owner',
        key,
        sourcePath: candidate.sourcePath,
        detail: error instanceof Error ? error.message : String(error),
      })
      return
    }
    const pkg = parsed.packages.get(owner)
    if (packages.has(owner)) return
    let license = null
    const reviewIssues = []
    try {
      license = resolveLicense(pkg, overrides)
    } catch (error) {
      const issue = {
        type: 'license-metadata',
        detail: error instanceof Error ? error.message : String(error),
      }
      reviewIssues.push(issue)
      errors.push({
        type: issue.type,
        package: owner,
        detail: issue.detail,
      })
    }
    packages.set(owner, packageAuditEntry(pkg, license, reviewIssues))
  }

  for (const key of [...candidatesByKey.keys()].sort()) {
    const candidates = candidatesByKey.get(key)
    let selected = candidates[0]
    if (candidates.length > 1) {
      const override = overrides.collisions[key]
      if (override) {
        try {
          const resolution = resolveCollision(key, candidates, overrides)
          selected = resolution.selected
          collisions.push({ key, ...resolution.collision })
        } catch (error) {
          collisions.push({
            key,
            decision: 'invalid-override',
            candidateSources: candidates.map((candidate) => candidate.sourcePath),
            detail: error instanceof Error ? error.message : String(error),
          })
          errors.push({
            type: 'collision-override',
            key,
            detail: error instanceof Error ? error.message : String(error),
          })
          selected = null
        }
      } else {
        collisions.push({
          key,
          decision: 'content-check-required',
          candidateSources: candidates.map((candidate) => candidate.sourcePath),
        })
        selected = null
      }
    }
    if (selected) inspectCandidate(key, selected)
    else for (const candidate of candidates) inspectCandidate(key, candidate)
  }

  const packageList = [...packages.values()].sort((a, b) => a.package.localeCompare(b.package))
  const packageReviewQueue = reviewQueue(packageList)
  return {
    schemaVersion: 1,
    mode: 'metadata-only',
    texliveYear: config.texliveYear,
    tlpdbSha256,
    summary: {
      mirrorKeys: candidatesByKey.size,
      sourceCandidates: [...candidatesByKey.values()].reduce((sum, values) => sum + values.length, 0),
      ...auditSummary(packageList, packageReviewQueue),
      collisionCandidates: collisions.length,
      contentCheckCollisions: collisions.filter(
        (collision) => collision.decision === 'content-check-required',
      ).length,
      errors: errors.length,
    },
    packages: packageList,
    reviewQueue: packageReviewQueue,
    collisions,
    errors,
  }
}

export function generateMirror({
  texmfDist,
  tlpdbPath,
  outputDir,
  manifestPath,
  config,
  overrides,
  texmfArchivePath = null,
  metadataArchivePath = null,
  scope = 'full-mirror',
}) {
  validateConfig(config, overrides)
  if (!['full-mirror', 'completion-metadata'].includes(scope)) {
    throw new Error(`unsupported provenance scope: ${String(scope)}`)
  }
  if (!existsSync(texmfDist) || !statSync(texmfDist).isDirectory()) {
    throw new Error(`texmf-dist directory does not exist: ${texmfDist}`)
  }
  const { tlpdbSha256, parsed } = loadPinnedTlpdb(tlpdbPath, config)
  const candidatesByKey = collectCandidates(
    texmfDist,
    scope === 'completion-metadata' ? isCompletionMetadataKey : null,
  )

  const files = []
  for (const key of [...candidatesByKey.keys()].sort()) {
    const candidates = candidatesByKey.get(key)
    const { selected, collision } = resolveCollision(key, candidates, overrides)
    const owner = resolveOwner(selected.sourcePath, parsed, overrides)
    const pkg = parsed.packages.get(owner)
    const license = scope === 'full-mirror' ? resolveLicense(pkg, overrides) : null
    if (license) validateNoticePaths(texmfDist, pkg, license.noticePaths)
    files.push({
      key,
      format: Number(key.split('/')[1]),
      bytes: selected.bytes,
      sha256: selected.sha256,
      source: {
        path: selected.sourcePath,
        package: pkg.name,
        packageRevision: pkg.revision,
        catalogue: pkg.catalogue,
        ...(license
          ? {
              license: {
                ids: license.ids,
                references: license.references,
                source: license.source,
                reviewed: license.reviewed,
              },
              noticePaths: license.noticePaths,
            }
          : {}),
      },
      ...(collision ? { collision } : {}),
      _absolutePath: selected.absolutePath,
    })
  }

  const texmfArchiveVerification = verifyInput(
    texmfArchivePath,
    'sha512',
    config.texmfArchive.sha512,
    'TeX Live texmf archive',
  )
  const metadataArchiveVerification = verifyInput(
    metadataArchivePath,
    'sha512',
    config.metadataArchive.sha512,
    'TeX Live metadata archive',
  )
  if (existsSync(outputDir)) {
    const entries = readdirSync(outputDir)
    if (entries.length > 0) throw new Error(`output directory is not empty: ${outputDir}`)
  }
  mkdirSync(outputDir, { recursive: true })
  for (const file of files) {
    const target = join(outputDir, file.key)
    mkdirSync(resolve(target, '..'), { recursive: true })
    copyFileSync(file._absolutePath, target)
    delete file._absolutePath
  }

  const byFormat = {}
  for (const file of files) byFormat[file.format] = (byFormat[file.format] ?? 0) + 1
  const unreviewedPackages =
    scope === 'full-mirror'
      ? [
          ...new Set(
            files
              .filter((file) => file.source.license?.reviewed !== true)
              .map((file) => file.source.package),
          ),
        ].sort()
      : []
  const packagesWithoutNoticeEvidence =
    scope === 'full-mirror'
      ? [
          ...new Set(
            files
              .filter((file) => (file.source.noticePaths?.length ?? 0) === 0)
              .map((file) => file.source.package),
          ),
        ].sort()
      : []
  const manifest = {
    schemaVersion: 1,
    ...(scope === 'completion-metadata' ? { scope } : {}),
    texliveYear: config.texliveYear,
    mirrorRevision: mirrorRevisionFor(config.texliveYear, files),
    releaseStatus:
      scope === 'completion-metadata'
        ? 'metadata-only'
        : unreviewedPackages.length === 0 && packagesWithoutNoticeEvidence.length === 0
          ? 'provenance-reviewed'
          : 'review-required',
    source: {
      texmfArchive: { ...config.texmfArchive, ...texmfArchiveVerification },
      metadataArchive: { ...config.metadataArchive, ...metadataArchiveVerification },
      tlpdb: { ...config.tlpdb, sha256: tlpdbSha256 },
    },
    layout: {
      root: 'pdftex',
      keyScheme: 'pdftex/<kpathsea-format-id>/<flattened-name>',
      collisionPolicy: 'identical content or reviewed exact-path override',
    },
    summary: {
      files: files.length,
      packages: new Set(files.map((file) => file.source.package)).size,
      collisions: files.filter((file) => file.collision).length,
      unreviewedPackages,
      packagesWithoutNoticeEvidence,
      byFormat,
    },
    files,
  }
  mkdirSync(resolve(manifestPath, '..'), { recursive: true })
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function checkMirror({
  manifest,
  mirrorRoot,
  requireVerifiedArchives = true,
  requireLicenseReview = false,
  allowCompletionMetadata = false,
}) {
  const failures = []
  const fail = (message) => failures.push(message)
  if (manifest.schemaVersion !== 1) fail('manifest schemaVersion must be 1')
  if (!/^\d{4}$/.test(manifest.texliveYear ?? '')) fail('manifest texliveYear must be a year')
  if (!/^\d{4}-[a-f0-9]{16}$/.test(manifest.mirrorRevision ?? '')) {
    fail('manifest mirrorRevision is invalid')
  } else if (manifest.mirrorRevision !== mirrorRevisionFor(manifest.texliveYear, manifest.files)) {
    fail('manifest mirrorRevision does not match its file inventory')
  }
  if (manifest.layout?.root !== 'pdftex') fail('manifest layout.root must be pdftex')
  const completionMetadata = manifest.scope === 'completion-metadata'
  if (completionMetadata && !allowCompletionMetadata) {
    fail('completion metadata manifest requires explicit allowCompletionMetadata')
  }
  if (!completionMetadata && manifest.scope !== undefined && manifest.scope !== 'full-mirror') {
    fail(`unsupported manifest scope: ${String(manifest.scope)}`)
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('manifest files must be non-empty')
  }
  for (const name of ['texmfArchive', 'metadataArchive']) {
    const archive = manifest.source?.[name]
    if (!SHA512.test(archive?.sha512 ?? '')) fail(`${name} has an invalid SHA-512`)
    if (!/^https:\/\//.test(archive?.url ?? '')) fail(`${name} has an invalid source URL`)
    if (requireVerifiedArchives && archive?.verified !== true) {
      fail(`${name} is not cryptographically verified`)
    }
  }
  if (!SHA256.test(manifest.source?.tlpdb?.sha256 ?? '')) fail('tlpdb has an invalid SHA-256')

  const declared = new Set()
  for (const file of manifest.files ?? []) {
    if (!/^pdftex\/\d+\/[^/]+$/.test(file.key ?? '') || file.key.includes('..')) {
      fail(`${String(file.key)}: invalid or unsafe mirror key`)
      continue
    }
    if (declared.has(file.key)) fail(`duplicate manifest key: ${file.key}`)
    declared.add(file.key)
    if (!SHA256.test(file.sha256 ?? '')) fail(`${file.key}: invalid SHA-256`)
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) fail(`${file.key}: invalid byte size`)
    if (!file.source?.path || !file.source?.package) fail(`${file.key}: incomplete source provenance`)
    if (!/^texmf-dist\//.test(file.source?.path ?? '') || file.source.path.includes('..')) {
      fail(`${file.key}: invalid or unsafe source path`)
    }
    if (completionMetadata && !isCompletionMetadataKey(file.key)) {
      fail(`${file.key}: unsupported completion metadata resource`)
    }
    if (
      !completionMetadata &&
      (!Array.isArray(file.source?.license?.ids) || file.source.license.ids.length === 0)
    ) {
      fail(`${file.key}: missing license identifiers`)
    }
    if (requireLicenseReview && file.source?.license?.reviewed !== true) {
      fail(`${file.key}: package license has not been reviewed`)
    }
    if (
      requireLicenseReview &&
      (!Array.isArray(file.source?.license?.references) ||
        file.source.license.references.length === 0)
    ) {
      fail(`${file.key}: reviewed package license has no evidence reference`)
    }
    if (
      requireLicenseReview &&
      (!Array.isArray(file.source?.noticePaths) || file.source.noticePaths.length === 0)
    ) {
      fail(`${file.key}: package has no reviewed notice evidence path`)
    }
    if (file.collision && !['identical-content', 'reviewed-override'].includes(file.collision.decision)) {
      fail(`${file.key}: unsupported collision decision`)
    }
    const path = join(mirrorRoot, file.key)
    if (!existsSync(path)) {
      fail(`${file.key}: mirrored file is missing`)
      continue
    }
    const stat = statSync(path)
    if (stat.size !== file.bytes) fail(`${file.key}: byte size mismatch`)
    const actual = sha('sha256', path)
    if (actual !== file.sha256) fail(`${file.key}: SHA-256 mismatch`)
  }

  const actual = walkFiles(join(mirrorRoot, 'pdftex'))
    .map((path) => normalizePath(relative(mirrorRoot, path)))
  for (const key of actual) if (!declared.has(key)) fail(`${key}: unrecorded mirrored file`)
  if (actual.length !== declared.size) {
    fail(`file count mismatch: manifest=${declared.size}, mirror=${actual.length}`)
  }
  if (manifest.summary?.files !== declared.size) fail('summary.files does not match manifest files')
  if (completionMetadata && manifest.releaseStatus !== 'metadata-only') {
    fail(`manifest releaseStatus is ${String(manifest.releaseStatus)}, not metadata-only`)
  }
  if (requireLicenseReview && manifest.releaseStatus !== 'provenance-reviewed') {
    fail(`manifest releaseStatus is ${String(manifest.releaseStatus)}, not provenance-reviewed`)
  }
  return failures
}
