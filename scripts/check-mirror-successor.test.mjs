import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareMirrors } from './check-mirror-successor.mjs'

const file = (key, sha256, bytes = 1) => ({ key, format: Number(key.split('/')[1]), bytes, sha256 })

test('a successor keeps every file and reports what it adds', () => {
  const result = compareMirrors(
    { files: [file('pdftex/26/a.sty', 'a')] },
    { files: [file('pdftex/26/a.sty', 'a'), file('pdftex/13/b.mf', 'b', 5), file('pdftex/13/c.mf', 'c', 7)] },
  )
  assert.deepEqual(result, { failures: [], added: { 13: { files: 2, bytes: 12 } } })
})

test('a lost or changed file fails', () => {
  const { failures } = compareMirrors(
    { files: [file('pdftex/26/a.sty', 'a'), file('pdftex/26/b.sty', 'b')] },
    { files: [file('pdftex/26/a.sty', 'changed')] },
  )
  assert.deepEqual(failures, ['pdftex/26/a.sty: content changed', 'pdftex/26/b.sty: missing from the successor'])
})
