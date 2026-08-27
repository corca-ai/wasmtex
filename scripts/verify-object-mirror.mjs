#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { localInventory, compareInventory } from './lib/object-inventory.mjs'
import { objectStoreConfig, objectUri, runObjectStore } from './lib/object-store.mjs'

const { values } = parseArgs({ options: {
  'local-root': { type: 'string' }, year: { type: 'string' },
} })
if (!values['local-root'] || !/^\d{4}$/.test(values.year ?? '')) {
  throw new Error('usage: verify-object-mirror.mjs --local-root <dir> --year <YYYY>')
}
const store = objectStoreConfig()
const rootPrefix = [store.prefix, values.year].filter(Boolean).join('/')
let token
const listed = []
do {
  const args = ['s3api', 'list-objects-v2', '--bucket', store.bucket, '--prefix', `${rootPrefix}/`,
    '--output', 'json']
  if (token) args.push('--continuation-token', token)
  const page = JSON.parse(runObjectStore(store, args, { encoding: 'utf8' }))
  listed.push(...(page.Contents ?? []))
  token = page.IsTruncated ? page.NextContinuationToken : undefined
} while (token)

const actual = []
for (const object of listed) {
  const key = object.Key.slice(rootPrefix.length + 1)
  const bytes = runObjectStore(store, ['s3', 'cp', objectUri(store, values.year, key), '-'], {
    maxBuffer: Math.max(Number(object.Size) + 1024, 1024 * 1024),
  })
  actual.push({ key, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
}
const expected = localInventory(values['local-root'])
const errors = compareInventory(expected, actual)
if (errors.length) {
  for (const error of errors) console.error(error)
  process.exit(1)
}
console.log(`Verified ${actual.length} objects and SHA-256 values at ${objectUri(store, values.year)}/`)
