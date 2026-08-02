import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { checkDeployedCompletionInventory } from './lib/deployed-completion.mjs'

function record(key, body) {
  return {
    key,
    bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex'),
  }
}

test('verifies deployed completion bytes through HTTP responses', async () => {
  const files = [record('pdftex/26/book.cls', 'book'), record('pdftex/26/xcolor.sty', 'color')]
  const bodies = new Map([
    ['https://cdn.example/2025/pdftex/26/book.cls', 'book'],
    ['https://cdn.example/2025/pdftex/26/xcolor.sty', 'color'],
  ])
  const result = await checkDeployedCompletionInventory({
    manifest: { scope: 'completion-metadata', files },
    baseUrl: 'https://cdn.example/2025/',
    fetchImpl: async (url) => {
      const body = bodies.get(url)
      return body === undefined ? new Response(null, { status: 404 }) : new Response(body)
    },
    concurrency: 2,
  })

  assert.deepEqual(result, { checkedFiles: 2, checkedBytes: 9, failures: [] })
})

test('reports missing and byte-drifted deployed completion resources', async () => {
  const files = [record('pdftex/26/book.cls', 'book'), record('pdftex/26/missing.sty', 'style')]
  const result = await checkDeployedCompletionInventory({
    manifest: { scope: 'completion-metadata', files },
    baseUrl: 'https://cdn.example/2025/',
    fetchImpl: async (url) =>
      url.endsWith('book.cls')
        ? new Response('changed')
        : new Response(null, { status: 404 }),
  })

  assert.deepEqual(result.failures, [
    'pdftex/26/book.cls: deployed byte size mismatch',
    'pdftex/26/missing.sty: deployed resource returned HTTP 404',
  ])
})
