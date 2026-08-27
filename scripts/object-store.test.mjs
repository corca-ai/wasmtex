import assert from 'node:assert/strict'
import test from 'node:test'
import { awsArgs, objectStoreConfig, objectUri } from './lib/object-store.mjs'

test('builds an immutable R2 object prefix without changing mirror identity', () => {
  const config = objectStoreConfig({
    TEXLIVE_OBJECT_BUCKET: 'texlive-production',
    TEXLIVE_OBJECT_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    TEXLIVE_OBJECT_PREFIX: '/snapshots/',
    TEXLIVE_OBJECT_PROFILE: 'r2-publisher',
  })
  assert.equal(objectUri(config, '2025', '2025-0123456789abcdef', 'pdftex'),
    's3://texlive-production/snapshots/2025/2025-0123456789abcdef/pdftex')
  assert.deepEqual(awsArgs(config, ['s3', 'ls', 's3://texlive-production/']), [
    '--profile', 'r2-publisher', '--endpoint-url',
    'https://account.r2.cloudflarestorage.com', 's3', 'ls', 's3://texlive-production/',
  ])
})

test('keeps the legacy bucket alias for existing S3 operators', () => {
  const config = objectStoreConfig({ S3_BUCKET: 'legacy' })
  assert.equal(objectUri(config, '2025'), 's3://legacy/2025')
  assert.deepEqual(awsArgs(config, ['s3', 'ls']), ['s3', 'ls'])
})
