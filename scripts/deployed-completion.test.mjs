import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  checkDeployedCompletionInventory,
  reconcileDeployedCompletionInventory,
} from './lib/deployed-completion.mjs'

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

test('reconciles explicitly allowlisted deployment drift before catalog generation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-deployed-completion-'))
  try {
    mkdirSync(join(root, 'pdftex/26'), { recursive: true })
    writeFileSync(join(root, 'pdftex/26/book.cls'), 'archive')
    writeFileSync(join(root, 'pdftex/26/missing.sty'), 'missing')
    const files = [record('pdftex/26/book.cls', 'archive'), record('pdftex/26/missing.sty', 'missing')]
      .map((file) => ({
        ...file,
        format: 26,
        source: {
          path: `texmf-dist/tex/latex/example/${file.key.split('/').at(-1)}`,
          package: 'example',
          packageRevision: 42,
          catalogue: 'example',
        },
      }))
    const deployedBook = record('pdftex/26/book.cls', 'deployed')
    const fetchImpl = async (url) =>
      url.endsWith('book.cls')
        ? new Response('deployed')
        : new Response(null, { status: 404 })
    const result = await reconcileDeployedCompletionInventory({
      manifest: {
        schemaVersion: 1,
        scope: 'completion-metadata',
        texliveYear: '2025',
        mirrorRevision: 'staged',
        releaseStatus: 'metadata-only',
        summary: { files: 2, packages: 1, collisions: 0, byFormat: { 26: 2 } },
        files,
      },
      mirrorRoot: root,
      baseUrl: 'https://cdn.example/2025/',
      policy: {
        schemaVersion: 1,
        absentResources: {
          'pdftex/26/missing.sty': { statuses: [404], rationale: 'not deployed' },
        },
        contentOverrides: {
          'pdftex/26/book.cls': {
            bytes: deployedBook.bytes,
            sha256: deployedBook.sha256,
            rationale: 'deployed hotfix',
          },
        },
      },
      fetchImpl,
    })

    assert.deepEqual(result.failures, [])
    assert.equal(result.checkedFiles, 1)
    assert.equal(result.manifest.files[0].sha256, deployedBook.sha256)
    assert.equal(result.manifest.files[0].source.packageRevision, null)
    assert.equal(result.manifest.summary.files, 1)
    assert.match(result.manifest.mirrorRevision, /^2025-[a-f0-9]{16}$/)
    assert.equal(readFileSync(join(root, 'pdftex/26/book.cls'), 'utf8'), 'deployed')
    assert.equal(existsSync(join(root, 'pdftex/26/missing.sty')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
