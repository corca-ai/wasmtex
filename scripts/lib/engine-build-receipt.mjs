import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

const SHA256 = /^[a-f0-9]{64}$/i
const GIT_COMMIT = /^[a-f0-9]{40}$/i
const SAFE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/
const FORBIDDEN_MARKERS = [
  'libs/pplib',
  'libpplib',
  'pplib.a',
  'ppdoc_get_page',
  'ppdoc_load',
  'utilsha',
  'sha256_digest',
  'sha384_digest',
  'sha512_digest',
]

function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

export function validateSourceConfig(config) {
  if (config.schemaVersion !== 1) throw new Error('source config schemaVersion must be 1')
  if (!/^\d{4}$/.test(config.texliveYear ?? '')) {
    throw new Error('source config texliveYear must be a year')
  }
  if (!/^https:\/\//.test(config.wasmtex?.repository ?? '')) {
    throw new Error('source config must declare the WasmTex repository')
  }
  if (!/^https:\/\//.test(config.texliveSource?.repository ?? '')) {
    throw new Error('source config must declare the TeX Live repository')
  }
  if (typeof config.texliveSource?.commitFile !== 'string') {
    throw new Error('source config must declare the TeX Live commit file')
  }
  if (!/^\d+\.\d+\.\d+$/.test(config.emscripten?.version ?? '')) {
    throw new Error('source config must declare an Emscripten version')
  }
  if (!/^https:\/\//.test(config.emscripten?.repository ?? '')) {
    throw new Error('source config must declare the Emscripten repository')
  }
  if (!GIT_COMMIT.test(config.emscripten?.commit ?? '')) {
    throw new Error('source config must pin the Emscripten Git commit')
  }
  if (!/^emscripten\/emsdk:[^@]+@sha256:[a-f0-9]{64}$/i.test(config.emscripten?.dockerImage ?? '')) {
    throw new Error('source config must pin the Emscripten Docker image digest')
  }
  if (!Array.isArray(config.ports) || config.ports.length === 0) {
    throw new Error('source config must declare Emscripten port source archives')
  }
  const portNames = new Set()
  for (const port of config.ports) {
    if (!SAFE_NAME.test(port.name ?? '') || portNames.has(port.name)) {
      throw new Error(`invalid or duplicate Emscripten port: ${String(port.name)}`)
    }
    portNames.add(port.name)
    if (!SAFE_NAME.test(port.filename ?? '') || !/^https:\/\//.test(port.url ?? '')) {
      throw new Error(`${port.name}: invalid source archive filename or URL`)
    }
    if (!/^[a-f0-9]{128}$/i.test(port.sha512 ?? '')) {
      throw new Error(`${port.name}: invalid source archive SHA-512`)
    }
  }
}

export function createBuildReceipt({
  family,
  directory,
  filenames,
  sourceRevision,
  texliveSourceCommit,
  mirror,
  config,
}) {
  validateSourceConfig(config)
  if (!SAFE_NAME.test(family ?? '')) throw new Error(`invalid engine family: ${String(family)}`)
  if (!GIT_COMMIT.test(sourceRevision ?? '')) throw new Error('sourceRevision must be a Git commit')
  if (!GIT_COMMIT.test(texliveSourceCommit ?? '')) {
    throw new Error('texliveSourceCommit must be a Git commit')
  }
  if (!new RegExp(`^${config.texliveYear}-[a-f0-9]{16}$`).test(mirror?.revision ?? '')) {
    throw new Error('mirror revision must match the TeX Live year')
  }
  if (!SHA256.test(mirror?.provenanceSha256 ?? '')) {
    throw new Error('mirror provenance SHA-256 is required')
  }
  if (!/^https:\/\//.test(mirror?.url ?? '') || !mirror.url.includes(`/${mirror.revision}/`)) {
    throw new Error('mirror URL must be HTTPS and contain the immutable mirror revision')
  }
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new Error('at least one artifact filename is required')
  }

  const seen = new Set()
  const files = filenames
    .map((name) => {
      if (!SAFE_NAME.test(name ?? '') || basename(name) !== name || seen.has(name)) {
        throw new Error(`invalid or duplicate artifact filename: ${String(name)}`)
      }
      seen.add(name)
      const path = join(directory, name)
      const stat = statSync(path)
      if (!stat.isFile()) throw new Error(`${name}: artifact is not a regular file`)
      const bytes = readFileSync(path)
      for (const marker of FORBIDDEN_MARKERS) {
        if (bytes.includes(Buffer.from(marker))) {
          throw new Error(`${name}: forbidden legacy dependency marker: ${marker}`)
        }
      }
      return { name, bytes: bytes.length, sha256: sha256(bytes) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const buildIdentity = {
    family,
    sourceRevision,
    texliveSourceCommit,
    emscriptenCommit: config.emscripten.commit,
    dockerImage: config.emscripten.dockerImage,
    mirror,
    files,
  }
  return {
    schemaVersion: 1,
    buildId: sha256(JSON.stringify(buildIdentity)),
    texliveYear: config.texliveYear,
    family,
    sourceRevision,
    texliveSourceCommit,
    mirror,
    toolchain: {
      emscriptenVersion: config.emscripten.version,
      emscriptenCommit: config.emscripten.commit,
      dockerImage: config.emscripten.dockerImage,
    },
    files,
  }
}

export function validateBuildReceipt(receipt, { config, actualDirectory = null } = {}) {
  const failures = []
  const fail = (message) => failures.push(message)
  try {
    validateSourceConfig(config)
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
    return failures
  }
  if (receipt.schemaVersion !== 1) fail('receipt schemaVersion must be 1')
  if (!SHA256.test(receipt.buildId ?? '')) fail('receipt buildId must be a SHA-256')
  if (!SAFE_NAME.test(receipt.family ?? '')) fail('receipt family is invalid')
  if (!GIT_COMMIT.test(receipt.sourceRevision ?? '')) fail('receipt sourceRevision is invalid')
  if (!GIT_COMMIT.test(receipt.texliveSourceCommit ?? '')) {
    fail('receipt texliveSourceCommit is invalid')
  }
  if (receipt.texliveYear !== config.texliveYear) fail('receipt TeX Live year mismatch')
  if (!new RegExp(`^${config.texliveYear}-[a-f0-9]{16}$`).test(receipt.mirror?.revision ?? '')) {
    fail('receipt mirror revision is invalid')
  }
  if (!SHA256.test(receipt.mirror?.provenanceSha256 ?? '')) {
    fail('receipt mirror provenance SHA-256 is invalid')
  }
  if (
    !/^https:\/\//.test(receipt.mirror?.url ?? '') ||
    !receipt.mirror.url.includes(`/${receipt.mirror.revision}/`)
  ) {
    fail('receipt mirror URL does not contain its immutable revision')
  }
  if (receipt.toolchain?.emscriptenVersion !== config.emscripten.version) {
    fail('receipt Emscripten version mismatch')
  }
  if (receipt.toolchain?.emscriptenCommit !== config.emscripten.commit) {
    fail('receipt Emscripten commit mismatch')
  }
  if (receipt.toolchain?.dockerImage !== config.emscripten.dockerImage) {
    fail('receipt Docker image mismatch')
  }
  if (!Array.isArray(receipt.files) || receipt.files.length === 0) {
    fail('receipt files must be non-empty')
    return failures
  }

  const names = new Set()
  const orderedNames = receipt.files.map((file) => file.name)
  if (JSON.stringify(orderedNames) !== JSON.stringify([...orderedNames].sort())) {
    fail('receipt files must be sorted by name')
  }
  for (const file of receipt.files) {
    if (!SAFE_NAME.test(file.name ?? '') || names.has(file.name)) {
      fail(`invalid or duplicate receipt file: ${String(file.name)}`)
      continue
    }
    names.add(file.name)
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) fail(`${file.name}: invalid byte size`)
    if (!SHA256.test(file.sha256 ?? '')) fail(`${file.name}: invalid SHA-256`)
    if (actualDirectory) {
      try {
        const data = readFileSync(join(actualDirectory, file.name))
        if (data.length !== file.bytes) fail(`${file.name}: receipt byte size mismatch`)
        if (sha256(data) !== file.sha256) fail(`${file.name}: receipt SHA-256 mismatch`)
        for (const marker of FORBIDDEN_MARKERS) {
          if (data.includes(Buffer.from(marker))) {
            fail(`${file.name}: forbidden legacy dependency marker: ${marker}`)
          }
        }
      } catch (error) {
        fail(`${file.name}: cannot read artifact: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  const expectedBuildId = sha256(
    JSON.stringify({
      family: receipt.family,
      sourceRevision: receipt.sourceRevision,
      texliveSourceCommit: receipt.texliveSourceCommit,
      emscriptenCommit: receipt.toolchain?.emscriptenCommit,
      dockerImage: receipt.toolchain?.dockerImage,
      mirror: receipt.mirror,
      files: receipt.files,
    }),
  )
  if (receipt.buildId !== expectedBuildId) fail('receipt buildId does not match its contents')
  return failures
}
