import assert from 'node:assert/strict'
import test from 'node:test'
import { objectStoreConfig, objectUri, objectStoreCliArgs } from './lib/object-store.mjs'

test('builds an immutable R2 object prefix without changing mirror identity', () => {
  const config = objectStoreConfig({
    TEXLIVE_OBJECT_BUCKET: 'texlive-production',
    TEXLIVE_OBJECT_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    TEXLIVE_OBJECT_PREFIX: '/snapshots/',
    TEXLIVE_R2_PROFILE: 'r2-publisher',
  })
  assert.equal(objectUri(config, '2025', '2025-0123456789abcdef', 'pdftex'),
    's3://texlive-production/snapshots/2025/2025-0123456789abcdef/pdftex')
  assert.deepEqual(objectStoreCliArgs(config, ['s3', 'ls', 's3://texlive-production/']), [
    '--profile', 'r2-publisher', '--endpoint-url',
    'https://account.r2.cloudflarestorage.com', 's3', 'ls', 's3://texlive-production/',
  ])
})

test('refuses access without a Cloudflare R2 endpoint', () => {
  assert.throws(
    () => objectStoreCliArgs(objectStoreConfig({}), ['s3', 'ls']),
    /TEXLIVE_OBJECT_ENDPOINT is required/,
  )
  assert.throws(
    () =>
      objectStoreCliArgs(
        objectStoreConfig({ TEXLIVE_OBJECT_ENDPOINT: 'https://s3.example.com' }),
        ['s3', 'ls'],
      ),
    /must be a Cloudflare R2 endpoint/,
  )
})


test('S3 requires an explicit bucket and region and never reuses an R2 endpoint', () => {
  const env = {
    TEXLIVE_OBJECT_PROVIDER: 's3',
    TEXLIVE_OBJECT_BUCKET: 'tex-assets',
    TEXLIVE_OBJECT_REGION: 'ap-northeast-2',
    TEXLIVE_OBJECT_PROFILE: 'publisher',
    TEXLIVE_R2_PROFILE: 'wrong-provider',
    TEXLIVE_OBJECT_PREFIX: 'snapshots/2026-0123456789abcdef',
  }
  const config = objectStoreConfig(env)
  assert.deepEqual(objectStoreCliArgs(config, ['s3', 'ls']), [
    '--profile', 'publisher', '--region', 'ap-northeast-2', 's3', 'ls',
  ])
  assert.equal(objectUri(config, '2026', 'pdftex/26/article.cls'),
    's3://tex-assets/snapshots/2026-0123456789abcdef/2026/pdftex/26/article.cls')
  assert.throws(() => objectStoreConfig({ TEXLIVE_OBJECT_PROVIDER: 's3' }), /BUCKET is required/)
  assert.throws(() => objectStoreCliArgs(objectStoreConfig({ ...env, TEXLIVE_OBJECT_REGION: '' }), []), /REGION is required/)
  assert.throws(() => objectStoreCliArgs(objectStoreConfig({ ...env, TEXLIVE_OBJECT_ENDPOINT: 'https://account.r2.cloudflarestorage.com' }), []), /must be unset/)
  assert.throws(() => objectStoreConfig({ TEXLIVE_OBJECT_PROVIDER: 'other' }), /must be r2 or s3/)
  assert.equal(objectStoreConfig({ ...env, TEXLIVE_OBJECT_PROFILE: '' }).profile, undefined)
})
