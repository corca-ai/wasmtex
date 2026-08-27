import assert from 'node:assert/strict'
import test from 'node:test'
import { objectStoreConfig, objectUri, r2CliArgs } from './lib/object-store.mjs'

test('builds an immutable R2 object prefix without changing mirror identity', () => {
  const config = objectStoreConfig({
    TEXLIVE_OBJECT_BUCKET: 'texlive-production',
    TEXLIVE_OBJECT_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    TEXLIVE_OBJECT_PREFIX: '/snapshots/',
    TEXLIVE_R2_PROFILE: 'r2-publisher',
  })
  assert.equal(objectUri(config, '2025', '2025-0123456789abcdef', 'pdftex'),
    's3://texlive-production/snapshots/2025/2025-0123456789abcdef/pdftex')
  assert.deepEqual(r2CliArgs(config, ['s3', 'ls', 's3://texlive-production/']), [
    '--profile', 'r2-publisher', '--endpoint-url',
    'https://account.r2.cloudflarestorage.com', 's3', 'ls', 's3://texlive-production/',
  ])
})

test('refuses access without a Cloudflare R2 endpoint', () => {
  assert.throws(
    () => r2CliArgs(objectStoreConfig({}), ['s3', 'ls']),
    /TEXLIVE_OBJECT_ENDPOINT is required/,
  )
  assert.throws(
    () =>
      r2CliArgs(
        objectStoreConfig({ TEXLIVE_OBJECT_ENDPOINT: 'https://s3.example.com' }),
        ['s3', 'ls'],
      ),
    /must be a Cloudflare R2 endpoint/,
  )
})
