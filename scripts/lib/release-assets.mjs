import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { validateBuildReceipt } from './engine-build-receipt.mjs'

const RECEIPT_NAME = /^BUILD-RECEIPT\.([a-zA-Z0-9_-]+)\.json$/

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

function patternRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
  return new RegExp(`^${escaped}$`)
}

export function readReleaseFiles(directory) {
  return readdirSync(directory)
    .filter((name) => name !== 'manifest.json' && statSync(join(directory, name)).isFile())
    .sort()
    .map((name) => {
      const data = readFileSync(join(directory, name))
      return { name, bytes: data.length, sha256: sha256(data) }
    })
}

export function inspectReleaseAssets({ directory, legal, sourceConfig }) {
  const files = readReleaseFiles(directory)
  const receiptFiles = files.filter((file) => RECEIPT_NAME.test(file.name))
  const buildReceipts = []
  const receipts = []
  const receiptCoverage = new Map()
  const errors = []

  for (const receiptFile of receiptFiles) {
    let receipt
    try {
      receipt = JSON.parse(readFileSync(join(directory, receiptFile.name), 'utf8'))
    } catch (error) {
      errors.push(`${receiptFile.name}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const filenameFamily = receiptFile.name.match(RECEIPT_NAME)?.[1]
    if (receipt.family !== filenameFamily) {
      errors.push(`${receiptFile.name}: filename family does not match receipt family`)
    }
    if (!legal.artifactFamilies.some((family) => family.name === receipt.family)) {
      errors.push(`${receiptFile.name}: receipt family is absent from the license manifest`)
    }
    if (receipt.texliveSourceCommit !== legal.texliveSourceCommit) {
      errors.push(`${receiptFile.name}: TeX Live source commit does not match license manifest`)
    }
    for (const error of validateBuildReceipt(receipt, {
      config: sourceConfig,
      actualDirectory: directory,
    })) {
      errors.push(`${receiptFile.name}: ${error}`)
    }
    for (const artifact of receipt.files ?? []) {
      if (artifact.name === 'LICENSE-MANIFEST.json' || RECEIPT_NAME.test(artifact.name)) {
        errors.push(`${receiptFile.name}: receipt must not claim release metadata ${artifact.name}`)
      }
      const owners = receiptCoverage.get(artifact.name) ?? []
      owners.push(receiptFile.name)
      receiptCoverage.set(artifact.name, owners)
    }
    receipts.push({ name: receiptFile.name, value: receipt })
    buildReceipts.push({
      name: receiptFile.name,
      sha256: receiptFile.sha256,
      family: receipt.family,
      buildId: receipt.buildId,
      sourceRevision: receipt.sourceRevision,
    })
  }

  const metadataNames = new Set(['LICENSE-MANIFEST.json', ...receiptFiles.map((file) => file.name)])
  for (const file of files) {
    if (metadataNames.has(file.name)) continue
    const coverage = receiptCoverage.get(file.name) ?? []
    if (coverage.length !== 1) {
      errors.push(
        `${file.name}: expected exactly one build receipt, found ${coverage.length} (${coverage.join(', ')})`,
      )
    }
    const legalFamilies = legal.artifactFamilies.filter((family) =>
      family.patterns.some((pattern) => patternRegex(pattern).test(file.name)),
    )
    if (legalFamilies.length !== 1) {
      errors.push(
        `${file.name}: expected exactly one license artifact family, found ${legalFamilies.length}`,
      )
    }
  }

  const fileNames = new Set(files.map((file) => file.name))
  for (const name of receiptCoverage.keys()) {
    if (!fileNames.has(name)) {
      errors.push(`${name}: build receipt names an artifact absent from the release directory`)
    }
  }
  return { files, receiptFiles, buildReceipts, receipts, errors }
}

export function releaseIdFor(version, files, buildReceipts) {
  const digest = sha256(JSON.stringify({ version, files, buildReceipts }))
  return `${version}-${digest.slice(0, 16)}`
}

export function validateWrittenAssetManifest(manifest, inspected) {
  const failures = []
  if (manifest.releaseId !== releaseIdFor(manifest.version, inspected.files, inspected.buildReceipts)) {
    failures.push('asset manifest releaseId does not match its exact files and build receipts')
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(inspected.files)) {
    failures.push('asset manifest files do not match the release directory')
  }
  if (JSON.stringify(manifest.buildReceipts) !== JSON.stringify(inspected.buildReceipts)) {
    failures.push('asset manifest buildReceipts do not match the release directory')
  }
  return failures
}
