import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, test } from 'node:test'

const scripts = dirname(fileURLToPath(import.meta.url))
const temporary = []

afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

test('frozen tlnet generation refuses an unmaterialized repository', () => {
  const work = mkdtempSync(join(tmpdir(), 'wasmtex-tlnet-test-'))
  temporary.push(work)
  const result = spawnSync('bash', [resolve(scripts, 'sync-texlive-mirror.sh')], {
    cwd: resolve(scripts, '..'),
    env: {
      ...process.env,
      WORK_DIR: work,
      TEXLIVE_MIRROR_CONFIG: resolve(scripts, 'texlive-mirror-2025-final.json'),
      TEXMF_DIST: '',
      TEXLIVE_TLPDB: '',
    },
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /must be materialized before mirror generation/)
  assert.match(result.stderr, /prepare-tlnet-snapshot\.sh/)
})

test('tlnet preparer rejects a release-archive config before downloading', () => {
  const work = mkdtempSync(join(tmpdir(), 'wasmtex-tlnet-test-'))
  temporary.push(work)
  const result = spawnSync('bash', [resolve(scripts, 'prepare-tlnet-snapshot.sh')], {
    cwd: resolve(scripts, '..'),
    env: {
      ...process.env,
      WORK_DIR: work,
      TEXLIVE_MIRROR_CONFIG: resolve(scripts, 'texlive-mirror-2025.json'),
    },
    encoding: 'utf8',
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /requires sourceType=tlnet-repository/)
})
