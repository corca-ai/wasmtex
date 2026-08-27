import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import test from 'node:test'

test('generates a deterministic bloom filter from a local release tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-bloom-'))
  const pdftex = join(root, 'release', 'pdftex')
  mkdirSync(join(pdftex, '26'), { recursive: true })
  mkdirSync(join(pdftex, 'pk'), { recursive: true })
  writeFileSync(join(pdftex, '26', 'article.cls'), 'article')
  writeFileSync(join(pdftex, '26', 'xetexfontlist.txt'), 'fonts')
  writeFileSync(join(pdftex, 'pk', 'ignored.pk'), 'pk')
  const output = join(root, 'bloom-filter.bin')

  const stdout = execFileSync(process.execPath, ['scripts/gen-bloom-filter.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      TEXLIVE_BLOOM_OUTPUT: output,
      TEXLIVE_MIRROR_ROOT: join(root, 'release'),
    },
  })

  assert.match(stdout, /Found 2 files/)
  const bytes = readFileSync(output)
  assert.equal(bytes.subarray(0, 4).toString(), 'BF01')
  assert.ok(bytes.length > 9)
})
