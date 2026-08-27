import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')
const script = join(root, 'scripts/sync-texlive-s3.sh')

describe('TeX Live mirror sync script', () => {
  it('pins archive integrity and publishes without size-only or stale objects', () => {
    const source = readFileSync(script, 'utf8')

    expect(source).toContain('TEXMF_SHA512=')
    expect(source).toContain('verify_archive')
    expect(source).not.toContain('| tar xJ')
    expect(source).not.toContain('--size-only')
    expect(source).toMatch(/object_store s3 sync .* --delete/)
    expect(source).toContain('TEXLIVE_OBJECT_ENDPOINT')
    expect(source).toContain('TEXLIVE_OBJECT_PREFIX')
    // Staging is delegated to the provenance generator + checker, so an upload
    // can never bypass the per-file provenance manifest.
    expect(source).toContain('gen-texlive-provenance.mjs')
    expect(source).toContain('check-texlive-provenance.mjs')
  })

  it('refuses an unpinned texmf-dist (provenance binding is mandatory)', () => {
    const temp = mkdtempSync(join(tmpdir(), 'wasmtex-mirror-'))
    const texmf = join(temp, 'texmf-dist')
    const work = join(temp, 'work')

    try {
      mkdirSync(join(texmf, 'tex/latex/a-package'), { recursive: true })
      writeFileSync(join(texmf, 'tex/latex/a-package/some.sty'), 'x')

      // A local texmf-dist without the exact archive it came from must be
      // rejected: the mirror is provenance-bound, never a bare directory walk.
      let failed = false
      try {
        execFileSync('bash', [script], {
          env: { ...process.env, TEXMF_DIST: texmf, WORK_DIR: work },
          stdio: 'pipe',
        })
      } catch (error) {
        failed = true
        const stderr = (error as { stderr?: Buffer }).stderr?.toString() ?? ''
        expect(stderr).toContain('TEXMF_ARCHIVE is required')
      }
      expect(failed).toBe(true)
      expect(existsSync(join(work, 'release'))).toBe(false)
    } finally {
      rmSync(temp, { force: true, recursive: true })
    }
  })

  it('refuses an empty upload before invoking the object store CLI', () => {
    const temp = mkdtempSync(join(tmpdir(), 'wasmtex-empty-mirror-'))
    const texmf = join(temp, 'texmf-dist')
    const work = join(temp, 'work')
    const fakeBin = join(temp, 'bin')
    const awsMarker = join(temp, 'aws-called')
    const requiredDirs = [
      'fonts/tfm',
      'fonts/type1',
      'fonts/vf',
      'fonts/map',
      'fonts/enc',
      'fonts/opentype',
      'fonts/truetype',
      'fonts/afm',
      'tex/latex',
      'scripts',
    ]

    try {
      for (const dir of requiredDirs) mkdirSync(join(texmf, dir), { recursive: true })
      mkdirSync(fakeBin)
      const fakeAws = join(fakeBin, 'aws')
      writeFileSync(fakeAws, '#!/bin/sh\n: > "$AWS_CALLED"\n')
      chmodSync(fakeAws, 0o755)

      expect(() =>
        execFileSync('bash', [script, '--upload'], {
          env: {
            ...process.env,
            AWS_CALLED: awsMarker,
            PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
            TEXMF_DIST: texmf,
            WORK_DIR: work,
          },
          stdio: 'pipe',
        }),
      ).toThrow()
      expect(existsSync(awsMarker)).toBe(false)
    } finally {
      rmSync(temp, { force: true, recursive: true })
    }
  })

  it('keeps worker positive and negative preload maps mutually exclusive', () => {
    const pdftex = readFileSync(join(root, 'wasm-build/pdftex-worker.js'), 'utf8')
    const luatex = readFileSync(join(root, 'wasm-build/luatex-worker.js'), 'utf8')

    expect(pdftex).toContain('delete texlive404_cache[cacheKey]')
    expect(pdftex).toContain('if (!(cacheKey in texlive200_cache))')
    expect(luatex).toContain('delete texlive404[cacheKey]')
    expect(luatex).toContain('if (!(cacheKey in texlive200))')
  })
})
