import { createHash } from 'node:crypto'
import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import { join, resolve, sep } from 'node:path'

const GIT_COMMIT = /^[a-f0-9]{40}$/i
const SHA256 = /^[a-f0-9]{64}$/i
const SHA512 = /^[a-f0-9]{128}$/i
const RELEASE_ID = /^\d{4}-[a-f0-9]{16}$/i

export function hashFile(algorithm, path) {
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

function safeChild(root, relativePath) {
  const rootPath = resolve(root)
  const path = resolve(root, relativePath)
  if (path !== rootPath && !path.startsWith(`${rootPath}${sep}`)) {
    throw new Error(`path escapes corresponding-source root: ${relativePath}`)
  }
  return path
}

function requireFile(root, relativePath, failures) {
  const path = safeChild(root, relativePath)
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) {
    failures.push(`missing or unsafe file: ${relativePath}`)
  }
  return path
}

function requireDirectory(root, relativePath, failures) {
  const path = safeChild(root, relativePath)
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory()) {
    failures.push(`missing or unsafe directory: ${relativePath}`)
  }
  return path
}

export function checkCorrespondingSourceDirectory({ directory, config, assetManifest = null }) {
  const failures = []
  const sourceManifestPath = requireFile(directory, 'SOURCE-MANIFEST.json', failures)
  requireFile(directory, 'README.md', failures)
  requireFile(directory, 'REBUILD.md', failures)
  requireFile(directory, 'RELINK.md', failures)
  requireFile(directory, 'release/ENGINE-COMPONENTS.json', failures)
  requireFile(directory, 'release/manifest.json', failures)
  requireFile(directory, 'release/LICENSE-MANIFEST.json', failures)
  if (failures.length > 0) return failures

  let manifest
  try {
    manifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8'))
  } catch (error) {
    return [`invalid SOURCE-MANIFEST.json: ${error instanceof Error ? error.message : String(error)}`]
  }
  if (manifest.schemaVersion !== 1) failures.push('SOURCE-MANIFEST schemaVersion must be 1')
  if (!RELEASE_ID.test(manifest.releaseId ?? '')) failures.push('invalid source releaseId')
  if (assetManifest && manifest.releaseId !== assetManifest.releaseId) {
    failures.push('source releaseId does not match the engine asset manifest')
  }
  if (!SHA256.test(manifest.engineAssetManifest?.sha256 ?? '')) {
    failures.push('invalid engine asset manifest SHA-256')
  }
  const bundledAssetManifest = join(directory, 'release/manifest.json')
  if (hashFile('sha256', bundledAssetManifest) !== manifest.engineAssetManifest?.sha256) {
    failures.push('bundled engine asset manifest SHA-256 mismatch')
  }
  const bundledLicenseManifest = join(directory, 'release/LICENSE-MANIFEST.json')
  if (
    !SHA256.test(manifest.licenseManifest?.sha256 ?? '') ||
    hashFile('sha256', bundledLicenseManifest) !== manifest.licenseManifest?.sha256
  ) {
    failures.push('bundled license manifest SHA-256 mismatch')
  }

  const expectedRevisions = new Set(assetManifest?.buildReceipts?.map((item) => item.sourceRevision) ?? [])
  const recordedRevisions = new Set()
  for (const source of manifest.sources?.wasmtex ?? []) {
    if (!GIT_COMMIT.test(source.commit ?? '') || !GIT_COMMIT.test(source.tree ?? '')) {
      failures.push('invalid WasmTex source commit or tree')
      continue
    }
    recordedRevisions.add(source.commit)
    const sourceRoot = `source/wasmtex/${source.commit}`
    requireDirectory(directory, sourceRoot, failures)
    for (const required of [
      'wasm-build/texlive-source.ref',
      'wasm-build/patches/texlive-wtpdf.patch',
      'wasm-build/pdf-backend/wtpdf.h',
      'wasm-build/pdf-backend/wtpdf-xpdf.cc',
      'wasm-build/sha2/wasmtex-sha2.c',
    ]) {
      requireFile(directory, `${sourceRoot}/${required}`, failures)
    }
    if (existsSync(join(directory, sourceRoot, 'wasm-build/dist'))) {
      failures.push(`${sourceRoot}: generated engine dist directory must not be bundled`)
    }
    for (const forbidden of ['libs/pplib', 'wasm-build/libs/pplib']) {
      if (existsSync(join(directory, sourceRoot, forbidden))) {
        failures.push(`${sourceRoot}: uncleared ${forbidden} source must not be bundled`)
      }
    }
  }
  if (assetManifest) {
    if (JSON.stringify([...recordedRevisions].sort()) !== JSON.stringify([...expectedRevisions].sort())) {
      failures.push('WasmTex source snapshots do not match build receipt revisions')
    }
  }

  const texlive = manifest.sources?.texlive
  if (!GIT_COMMIT.test(texlive?.commit ?? '') || !GIT_COMMIT.test(texlive?.tree ?? '')) {
    failures.push('invalid TeX Live source commit or tree')
  }
  const texliveRoot = requireDirectory(directory, 'source/texlive', failures)
  /* Upstream texlive-source ships `Build` as the top-level build SCRIPT, not a
     directory. */
  requireFile(directory, 'source/texlive/Build', failures)
  for (const required of ['libs/xpdf', 'texk/web2c', 'texk/dvipdfm-x']) {
    requireDirectory(directory, `source/texlive/${required}`, failures)
  }
  if (existsSync(join(texliveRoot, 'libs/pplib'))) {
    failures.push('TeX Live source contains excluded, unused libs/pplib')
  }

  const emscripten = manifest.sources?.emscripten
  if (emscripten?.commit !== config.emscripten.commit || !GIT_COMMIT.test(emscripten?.tree ?? '')) {
    failures.push('Emscripten source does not match the pinned commit')
  }
  requireFile(directory, 'source/emscripten/emcc.py', failures)
  for (const port of config.ports) {
    const path = requireFile(directory, `source/ports/${port.filename}`, failures)
    if (existsSync(path) && hashFile('sha512', path) !== port.sha512) {
      failures.push(`${port.name}: bundled port source SHA-512 mismatch`)
    }
    const recorded = (manifest.sources?.ports ?? []).find((item) => item.name === port.name)
    if (!recorded || recorded.sha512 !== port.sha512 || !SHA512.test(recorded.sha512 ?? '')) {
      failures.push(`${port.name}: source manifest port record mismatch`)
    }
  }

  for (const receipt of assetManifest?.buildReceipts ?? []) {
    const path = requireFile(directory, `release/${receipt.name}`, failures)
    if (existsSync(path) && hashFile('sha256', path) !== receipt.sha256) {
      failures.push(`${receipt.name}: bundled build receipt SHA-256 mismatch`)
    }
    if (existsSync(path)) {
      try {
        const value = JSON.parse(readFileSync(path, 'utf8'))
        if (value.sourceRevision !== receipt.sourceRevision) {
          failures.push(`${receipt.name}: bundled source revision mismatch`)
        }
        if (value.texliveSourceCommit !== texlive?.commit) {
          failures.push(`${receipt.name}: bundled TeX Live source revision mismatch`)
        }
        if (value.toolchain?.emscriptenCommit !== config.emscripten.commit) {
          failures.push(`${receipt.name}: bundled Emscripten source revision mismatch`)
        }
      } catch (error) {
        failures.push(
          `${receipt.name}: invalid bundled receipt: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  return failures
}
