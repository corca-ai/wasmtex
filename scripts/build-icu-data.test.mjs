import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('./build-icu-data.sh', import.meta.url))

function publish(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-icu-publish-'))
  const work = join(root, 'work'), bin = join(root, 'bin'), log = join(root, 'calls.jsonl')
  mkdirSync(work); mkdirSync(bin)
  for (const name of ['icu4c-68_2-src.tgz', 'icu4c-68_2-data.zip']) writeFileSync(join(work, name), '')
  writeFileSync(join(bin, 'docker'), `#!${process.execPath}\nrequire('node:fs').writeFileSync(require('node:path').join(process.env.WORK_DIR,'icudt68l.dat'),'ICU test data')\n`)
  writeFileSync(join(bin, 'aws'), `#!${process.execPath}
const fs=require('node:fs');const args=process.argv.slice(2)
fs.appendFileSync(process.env.TEST_AWS_LOG,JSON.stringify(args)+'\\n')
if(args.includes('list-objects-v2')) {
  if(process.env.TEST_LIST_DENIED === '1') {process.stderr.write('AccessDenied');process.exit(254)}
  process.stdout.write(process.env.TEST_EXISTING === '1' ? '1\\n' : '0\\n')
}
`)
  chmodSync(join(bin, 'docker'), 0o755); chmodSync(join(bin, 'aws'), 0o755)
  const env = { ...process.env }
  for (const key of Object.keys(env)) if (key.startsWith('TEXLIVE_') || key === 'YEAR') delete env[key]
  try {
    const result = spawnSync('bash', [script, '--upload'], {
      cwd: dirname(script), encoding: 'utf8',
      env: { ...env, PATH: `${bin}:${env.PATH}`, WORK_DIR: work, TEST_AWS_LOG: log,
        TEXLIVE_YEAR: '2026', TEXLIVE_OBJECT_PREFIX: '/snapshots/2026-0123456789abcdef/',
        ...overrides },
    })
    const calls = (() => { try { return readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) } catch { return [] } })()
    return { ...result, calls }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

test('ICU publisher uses explicit S3 region/profile and preserves gzip metadata and key', () => {
  const result = publish({ TEXLIVE_OBJECT_PROVIDER: 's3', TEXLIVE_OBJECT_BUCKET: 'public-tex',
    TEXLIVE_OBJECT_REGION: 'ap-northeast-2', TEXLIVE_OBJECT_PROFILE: 'publisher', TEXLIVE_R2_PROFILE: 'not-aws' })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.calls.length, 2)
  const upload = result.calls[1]
  assert.deepEqual(upload.slice(0, 6), ['--profile', 'publisher', '--region', 'ap-northeast-2', 's3', 'cp'])
  assert.equal(upload[7], 's3://public-tex/snapshots/2026-0123456789abcdef/2026/icudt68l.dat')
  assert.deepEqual(upload.slice(8), ['--content-encoding', 'gzip', '--content-type', 'application/octet-stream', '--cache-control', 'public, max-age=31536000, immutable'])
})

test('ICU publisher retains the legacy R2 profile and endpoint', () => {
  const result = publish({ TEXLIVE_OBJECT_ENDPOINT: 'https://account.r2.cloudflarestorage.com', TEXLIVE_R2_PROFILE: 'r2-publisher' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls[1].slice(0, 6), ['--profile', 'r2-publisher', '--endpoint-url', 'https://account.r2.cloudflarestorage.com', 's3', 'cp'])
})

test('ICU publisher refuses S3 without region and refuses an existing object', () => {
  const missing = publish({ TEXLIVE_OBJECT_PROVIDER: 's3', TEXLIVE_OBJECT_BUCKET: 'public-tex' })
  assert.notEqual(missing.status, 0)
  assert.match(missing.stderr, /REGION is required/)
  assert.deepEqual(missing.calls, [])
  const existing = publish({ TEXLIVE_OBJECT_PROVIDER: 's3', TEXLIVE_OBJECT_BUCKET: 'public-tex',
    TEXLIVE_OBJECT_REGION: 'ap-northeast-2', TEST_EXISTING: '1' })
  assert.notEqual(existing.status, 0)
  assert.match(existing.stderr, /Refusing to overwrite/)
  assert.equal(existing.calls.length, 1)
  assert.ok(existing.calls[0].includes('list-objects-v2'))
  const denied = publish({ TEXLIVE_OBJECT_PROVIDER: 's3', TEXLIVE_OBJECT_BUCKET: 'public-tex',
    TEXLIVE_OBJECT_REGION: 'ap-northeast-2', TEST_LIST_DENIED: '1' })
  assert.equal(denied.status, 254)
  assert.match(denied.stderr, /AccessDenied/)
  assert.equal(denied.calls.length, 1)
})
