import { createHash } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { mirrorRevisionFor } from './texlive-provenance.mjs'

function resourceUrl(baseUrl, key) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${baseUrl.replace(/\/+$/, '')}/${encodedKey}`
}

async function digestBody(body) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of body) {
    const value = Buffer.from(chunk)
    bytes += value.length
    hash.update(value)
  }
  return { bytes, sha256: hash.digest('hex') }
}

function validateRequest(manifest, baseUrl, concurrency) {
  if (manifest?.scope !== 'completion-metadata' || !Array.isArray(manifest.files)) {
    throw new Error('deployed completion verification requires a completion-metadata manifest')
  }
  if (!/^https:\/\//.test(baseUrl ?? '')) {
    throw new Error('deployed completion base URL must use HTTPS')
  }
  if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 64) {
    throw new Error('deployed completion concurrency must be an integer from 1 to 64')
  }
}

export async function checkDeployedCompletionInventory({
  manifest,
  baseUrl,
  fetchImpl = fetch,
  concurrency = 12,
}) {
  validateRequest(manifest, baseUrl, concurrency)

  const failures = new Array(manifest.files.length)
  let cursor = 0
  let checkedFiles = 0
  let checkedBytes = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= manifest.files.length) return
      const file = manifest.files[index]
      try {
        const response = await fetchImpl(resourceUrl(baseUrl, file.key))
        if (!response.ok) {
          failures[index] = `${file.key}: deployed resource returned HTTP ${response.status}`
          continue
        }
        if (!response.body) {
          failures[index] = `${file.key}: deployed resource has no response body`
          continue
        }
        const actual = await digestBody(response.body)
        if (actual.bytes !== file.bytes) {
          failures[index] = `${file.key}: deployed byte size mismatch`
          continue
        }
        if (actual.sha256 !== file.sha256) {
          failures[index] = `${file.key}: deployed SHA-256 mismatch`
          continue
        }
        checkedFiles++
        checkedBytes += actual.bytes
      } catch (error) {
        failures[index] = `${file.key}: deployed resource fetch failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, manifest.files.length) }, () => worker()),
  )
  return { checkedFiles, checkedBytes, failures: failures.filter(Boolean) }
}

export async function reconcileDeployedCompletionInventory({
  manifest,
  mirrorRoot,
  baseUrl,
  policy,
  fetchImpl = fetch,
  concurrency = 12,
}) {
  validateRequest(manifest, baseUrl, concurrency)
  if (policy?.schemaVersion !== 1) throw new Error('completion deployment policy schemaVersion must be 1')
  const absentResources = policy.absentResources ?? {}
  const contentOverrides = policy.contentOverrides ?? {}
  const reconciled = structuredClone(manifest)
  const actions = new Array(reconciled.files.length)
  const failures = new Array(reconciled.files.length)
  const observedPolicyKeys = new Set()
  let cursor = 0

  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= reconciled.files.length) return
      const file = reconciled.files[index]
      try {
        const response = await fetchImpl(resourceUrl(baseUrl, file.key))
        if (!response.ok) {
          const allowed = absentResources[file.key]
          if (allowed?.statuses?.includes(response.status)) {
            actions[index] = { kind: 'absent' }
            observedPolicyKeys.add(file.key)
          } else {
            failures[index] = `${file.key}: deployed resource returned HTTP ${response.status}`
          }
          continue
        }
        if (!response.body) {
          failures[index] = `${file.key}: deployed resource has no response body`
          continue
        }
        const actual = await digestBody(response.body)
        if (actual.bytes === file.bytes && actual.sha256 === file.sha256) continue
        const allowed = contentOverrides[file.key]
        if (allowed?.bytes === actual.bytes && allowed.sha256 === actual.sha256) {
          actions[index] = { kind: 'content-override', actual }
          observedPolicyKeys.add(file.key)
        } else {
          failures[index] = `${file.key}: deployed bytes differ from the pinned archive`
        }
      } catch (error) {
        failures[index] = `${file.key}: deployed resource fetch failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, reconciled.files.length) }, () => worker()),
  )

  for (const key of [...Object.keys(absentResources), ...Object.keys(contentOverrides)]) {
    if (!observedPolicyKeys.has(key)) failures.push(`${key}: deployment policy entry was not observed`)
  }
  if (failures.some(Boolean)) {
    return { manifest, checkedFiles: 0, checkedBytes: 0, failures: failures.filter(Boolean) }
  }

  const replacementBodies = new Map()
  for (let index = 0; index < actions.length; index++) {
    if (actions[index]?.kind !== 'content-override') continue
    const file = reconciled.files[index]
    const response = await fetchImpl(resourceUrl(baseUrl, file.key))
    if (!response.ok) throw new Error(`${file.key}: deployed replacement fetch returned HTTP ${response.status}`)
    const body = Buffer.from(await response.arrayBuffer())
    const actual = { bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') }
    if (actual.bytes !== actions[index].actual.bytes || actual.sha256 !== actions[index].actual.sha256) {
      throw new Error(`${file.key}: deployed replacement changed during verification`)
    }
    replacementBodies.set(index, body)
  }

  const files = []
  for (let index = 0; index < reconciled.files.length; index++) {
    const file = reconciled.files[index]
    const action = actions[index]
    if (action?.kind === 'absent') {
      rmSync(join(mirrorRoot, file.key), { force: true })
      continue
    }
    if (action?.kind === 'content-override') {
      const policyEntry = contentOverrides[file.key]
      const archiveCandidate = {
        bytes: file.bytes,
        sha256: file.sha256,
        packageRevision: file.source.packageRevision,
      }
      file.bytes = action.actual.bytes
      file.sha256 = action.actual.sha256
      file.source.packageRevision = null
      file.source.deploymentOverride = {
        archiveCandidate,
        rationale: policyEntry.rationale,
      }
      writeFileSync(join(mirrorRoot, file.key), replacementBodies.get(index))
    }
    files.push(file)
  }
  reconciled.files = files
  reconciled.mirrorRevision = mirrorRevisionFor(reconciled.texliveYear, files)
  reconciled.deployment = {
    baseUrl: baseUrl.replace(/\/+$/, '') + '/',
    absentResources: Object.keys(absentResources).sort(),
    contentOverrides: Object.keys(contentOverrides).sort(),
  }
  reconciled.summary.files = files.length
  reconciled.summary.packages = new Set(files.map((file) => file.source.package)).size
  reconciled.summary.collisions = files.filter((file) => file.collision).length
  reconciled.summary.byFormat = {}
  for (const file of files) {
    reconciled.summary.byFormat[file.format] = (reconciled.summary.byFormat[file.format] ?? 0) + 1
  }
  return {
    manifest: reconciled,
    checkedFiles: files.length,
    checkedBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    failures: [],
  }
}
