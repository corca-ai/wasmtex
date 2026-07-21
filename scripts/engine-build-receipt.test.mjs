import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  createBuildReceipt,
  validateBuildReceipt,
  validateSourceConfig,
} from './lib/engine-build-receipt.mjs'
import {
  inspectReleaseAssets,
  releaseIdFor,
  validateWrittenAssetManifest,
} from './lib/release-assets.mjs'

const COMMIT = '1234567890abcdef1234567890abcdef12345678'
const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-receipt-'))
  temporary.push(root)
  const artifacts = join(root, 'artifacts')
  mkdirSync(artifacts)
  writeFileSync(join(artifacts, 'engine.js'), 'engine glue\n')
  writeFileSync(join(artifacts, 'engine.wasm'), Buffer.from([0, 97, 115, 109]))
  const config = {
    schemaVersion: 1,
    texliveYear: '2025',
    wasmtex: { repository: 'https://example.test/wasmtex.git' },
    texliveSource: { repository: 'https://example.test/texlive.git', commitFile: 'ref' },
    emscripten: {
      version: '3.1.46',
      repository: 'https://example.test/emscripten.git',
      commit: COMMIT,
      dockerImage: `emscripten/emsdk:3.1.46@sha256:${'a'.repeat(64)}`,
    },
    ports: [
      {
        name: 'zlib',
        version: '1.2.13',
        filename: 'zlib.tar.gz',
        url: 'https://example.test/zlib.tar.gz',
        sha512: 'b'.repeat(128),
      },
    ],
  }
  return { root, artifacts, config }
}

test('validates the pinned corresponding-source inputs', () => {
  const { config } = fixture()
  assert.doesNotThrow(() => validateSourceConfig(config))
  config.emscripten.dockerImage = 'emscripten/emsdk:3.1.46'
  assert.throws(() => validateSourceConfig(config), /Docker image digest/)
})

test('creates a deterministic receipt and verifies the exact artifact bytes', () => {
  const { artifacts, config } = fixture()
  const receipt = createBuildReceipt({
    family: 'pdftex',
    directory: artifacts,
    filenames: ['engine.wasm', 'engine.js'],
    sourceRevision: COMMIT,
    texliveSourceCommit: COMMIT,
    config,
  })
  const second = createBuildReceipt({
    family: 'pdftex',
    directory: artifacts,
    filenames: ['engine.wasm', 'engine.js'],
    sourceRevision: COMMIT,
    texliveSourceCommit: COMMIT,
    config,
  })
  assert.deepEqual(receipt, second)
  assert.deepEqual(validateBuildReceipt(receipt, { config, actualDirectory: artifacts }), [])
  writeFileSync(join(artifacts, 'engine.js'), 'modified\n')
  assert.match(
    validateBuildReceipt(receipt, { config, actualDirectory: artifacts }).join('\n'),
    /receipt SHA-256 mismatch/,
  )
})

test('refuses artifacts containing a legacy pplib marker', () => {
  const { artifacts, config } = fixture()
  writeFileSync(join(artifacts, 'engine.js'), 'linked libs/pplib archive\n')
  assert.throws(
    () =>
      createBuildReceipt({
        family: 'xetex',
        directory: artifacts,
        filenames: ['engine.js'],
        sourceRevision: COMMIT,
        texliveSourceCommit: COMMIT,
        config,
      }),
    /forbidden legacy dependency marker/,
  )
})

test('binds every release file to one receipt and one license family', () => {
  const { artifacts, config } = fixture()
  const receipt = createBuildReceipt({
    family: 'pdftex',
    directory: artifacts,
    filenames: ['engine.wasm', 'engine.js'],
    sourceRevision: COMMIT,
    texliveSourceCommit: COMMIT,
    config,
  })
  writeFileSync(join(artifacts, 'BUILD-RECEIPT.pdftex.json'), `${JSON.stringify(receipt)}\n`)
  writeFileSync(join(artifacts, 'LICENSE-MANIFEST.json'), '{}\n')
  const legal = {
    texliveSourceCommit: COMMIT,
    artifactFamilies: [{ name: 'pdftex', patterns: ['engine.*'] }],
  }
  const inspected = inspectReleaseAssets({ directory: artifacts, legal, sourceConfig: config })
  assert.deepEqual(inspected.errors, [])
  const manifest = {
    version: '2025',
    releaseId: releaseIdFor('2025', inspected.files, inspected.buildReceipts),
    files: inspected.files,
    buildReceipts: inspected.buildReceipts,
  }
  assert.deepEqual(validateWrittenAssetManifest(manifest, inspected), [])
  writeFileSync(join(artifacts, 'unclassified.map'), 'map\n')
  assert.match(
    inspectReleaseAssets({ directory: artifacts, legal, sourceConfig: config }).errors.join('\n'),
    /expected exactly one build receipt/,
  )
})
