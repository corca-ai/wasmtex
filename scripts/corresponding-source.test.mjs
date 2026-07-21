import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import { checkCorrespondingSourceDirectory } from './lib/corresponding-source.mjs'

const COMMIT = '1234567890abcdef1234567890abcdef12345678'
const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function sha(algorithm, value) {
  return createHash(algorithm).update(value).digest('hex')
}

function put(root, path, value = 'source\n') {
  const target = join(root, path)
  mkdirSync(join(target, '..'), { recursive: true })
  writeFileSync(target, value)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-source-check-'))
  temporary.push(root)
  const receipt = JSON.stringify({
    sourceRevision: COMMIT,
    texliveSourceCommit: COMMIT,
    toolchain: { emscriptenCommit: COMMIT },
  })
  const assetManifest = {
    releaseId: '2025-1234567890abcdef',
    buildReceipts: [
      { name: 'BUILD-RECEIPT.pdftex.json', sha256: sha('sha256', receipt), sourceRevision: COMMIT },
    ],
  }
  const engineManifest = JSON.stringify(assetManifest)
  const licenseManifest = '{}'
  put(root, 'release/manifest.json', engineManifest)
  put(root, 'release/LICENSE-MANIFEST.json', licenseManifest)
  put(root, 'release/BUILD-RECEIPT.pdftex.json', receipt)
  put(root, 'README.md')
  put(root, 'REBUILD.md')
  put(root, 'RELINK.md')
  put(root, 'release/ENGINE-COMPONENTS.json', '{}\n')
  for (const path of [
    'wasm-build/texlive-source.ref',
    'wasm-build/patches/texlive-wtpdf.patch',
    'wasm-build/pdf-backend/wtpdf.h',
    'wasm-build/pdf-backend/wtpdf-xpdf.cc',
    'wasm-build/sha2/wasmtex-sha2.c',
  ]) {
    put(root, `source/wasmtex/${COMMIT}/${path}`)
  }
  for (const path of ['Build/.keep', 'libs/xpdf/.keep', 'texk/web2c/.keep', 'texk/dvipdfm-x/.keep']) {
    put(root, `source/texlive/${path}`)
  }
  put(root, 'source/emscripten/emcc.py')
  const portBytes = 'zlib source\n'
  put(root, 'source/ports/zlib.tar.gz', portBytes)
  const config = {
    emscripten: { commit: COMMIT },
    ports: [{ name: 'zlib', filename: 'zlib.tar.gz', sha512: sha('sha512', portBytes) }],
  }
  const sourceManifest = {
    schemaVersion: 1,
    releaseId: assetManifest.releaseId,
    engineAssetManifest: { sha256: sha('sha256', engineManifest) },
    licenseManifest: { sha256: sha('sha256', licenseManifest) },
    sources: {
      wasmtex: [{ commit: COMMIT, tree: COMMIT }],
      texlive: { commit: COMMIT, tree: COMMIT },
      emscripten: { commit: COMMIT, tree: COMMIT },
      ports: [{ name: 'zlib', sha512: config.ports[0].sha512 }],
    },
  }
  put(root, 'SOURCE-MANIFEST.json', `${JSON.stringify(sourceManifest)}\n`)
  return { root, config, assetManifest }
}

test('accepts a source tree bound to the release receipts', () => {
  const value = fixture()
  assert.deepEqual(
    checkCorrespondingSourceDirectory({
      directory: value.root,
      config: value.config,
      assetManifest: value.assetManifest,
    }),
    [],
  )
})

test('rejects the unused legacy pplib source from a release bundle', () => {
  const value = fixture()
  put(value.root, 'source/texlive/libs/pplib/pplib.c')
  assert.match(
    checkCorrespondingSourceDirectory({
      directory: value.root,
      config: value.config,
      assetManifest: value.assetManifest,
    }).join('\n'),
    /libs\/pplib/,
  )
})
