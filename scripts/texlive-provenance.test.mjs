import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  auditMirror,
  auditTlpdb,
  checkMirror,
  generateMirror,
  parseTlpdb,
} from './lib/texlive-provenance.mjs'

const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-provenance-'))
  temporary.push(root)
  const texmf = join(root, 'texmf-dist')
  mkdirSync(join(texmf, 'tex/latex/example'), { recursive: true })
  writeFileSync(join(texmf, 'tex/latex/example/example.sty'), 'same\n')
  mkdirSync(join(texmf, 'doc/latex/example'), { recursive: true })
  writeFileSync(join(texmf, 'doc/latex/example/README'), 'LPPL 1.3c\n')
  const tlpdb = join(root, 'texlive.tlpdb')
  writeFileSync(
    tlpdb,
    [
      'name example',
      'revision 42',
      'catalogue example',
      'catalogue-license lppl1.3c',
      'runfiles size=1',
      ' texmf-dist/tex/latex/example/example.sty',
      'docfiles size=1',
      ' texmf-dist/doc/latex/example/README details="license"',
      '',
    ].join('\n'),
  )
  const texmfArchive = join(root, 'texmf.tar.xz')
  const metadataArchive = join(root, 'extra.tar.xz')
  writeFileSync(texmfArchive, 'texmf archive')
  writeFileSync(metadataArchive, 'metadata archive')
  const digest = (algorithm, path) =>
    createHash(algorithm).update(readFileSync(path)).digest('hex')
  const config = {
    schemaVersion: 1,
    texliveYear: '2025',
    texmfArchive: {
      filename: 'texmf.tar.xz',
      url: 'https://example.test/texmf.tar.xz',
      sha512: digest('sha512', texmfArchive),
    },
    metadataArchive: {
      filename: 'extra.tar.xz',
      url: 'https://example.test/extra.tar.xz',
      sha512: digest('sha512', metadataArchive),
    },
    tlpdb: { archiveMember: 'extra/tlpkg/texlive.tlpdb', sha256: digest('sha256', tlpdb) },
  }
  const overrides = { schemaVersion: 1, fileOwners: {}, packageLicenses: {}, collisions: {} }
  return { root, texmf, tlpdb, texmfArchive, metadataArchive, config, overrides }
}

test('parses package ownership, catalogue license, and notice candidates', () => {
  const value = fixture()
  const parsed = parseTlpdb(readFileSync(value.tlpdb, 'utf8'))
  assert.deepEqual(parsed.owners.get('texmf-dist/tex/latex/example/example.sty'), ['example'])
  assert.deepEqual(parsed.packages.get('example').catalogueLicenses, ['lppl1.3c'])
  assert.deepEqual(parsed.packages.get('example').noticePaths, [
    'texmf-dist/doc/latex/example/README',
  ])
})

test('generates and verifies a provenance-bound mirror', () => {
  const value = fixture()
  const outputDir = join(value.root, 'mirror')
  const manifestPath = join(value.root, 'provenance.json')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath,
    config: value.config,
    overrides: value.overrides,
    texmfArchivePath: value.texmfArchive,
    metadataArchivePath: value.metadataArchive,
  })
  assert.equal(manifest.files[0].key, 'pdftex/26/example.sty')
  assert.match(manifest.mirrorRevision, /^2025-[a-f0-9]{16}$/)
  assert.equal(manifest.files[0].source.package, 'example')
  assert.equal(manifest.files[0].source.license.source, 'texlive-tlpdb-catalogue-license')
  assert.deepEqual(checkMirror({ manifest, mirrorRoot: outputDir }), [])
  assert.match(
    checkMirror({ manifest, mirrorRoot: outputDir, requireLicenseReview: true }).join('\n'),
    /has not been reviewed/,
  )
})

test('audits all package review work without emitting a mirror', () => {
  const value = fixture()
  const audit = auditMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    config: value.config,
    overrides: value.overrides,
  })
  assert.equal(audit.summary.mirrorKeys, 1)
  assert.equal(audit.summary.packages, 1)
  assert.equal(audit.summary.packagesRequiringReview, 1)
  assert.equal(audit.summary.unreviewedPackages, 1)
  assert.equal(audit.summary.errors, 0)
  assert.equal(audit.packages[0].package, 'example')
  assert.deepEqual(audit.reviewQueue[0].reasons, ['license-review-required'])
})

test('builds a review inventory from the pinned TLPDB without TeX Live bytes', () => {
  const value = fixture()
  const audit = auditTlpdb({
    tlpdbPath: value.tlpdb,
    config: value.config,
    overrides: value.overrides,
  })
  assert.equal(audit.mode, 'metadata-only')
  assert.equal(audit.summary.mirrorKeys, 1)
  assert.equal(audit.summary.unreviewedPackages, 1)
})

test('deduplicates missing-license review work by package', () => {
  const value = fixture()
  mkdirSync(join(value.texmf, 'tex/latex/example'), { recursive: true })
  writeFileSync(join(value.texmf, 'tex/latex/example/second.sty'), 'second\n')
  writeFileSync(
    value.tlpdb,
    [
      'name example',
      'revision 42',
      'runfiles size=2',
      ' texmf-dist/tex/latex/example/example.sty',
      ' texmf-dist/tex/latex/example/second.sty',
      '',
    ].join('\n'),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  const audit = auditTlpdb({
    tlpdbPath: value.tlpdb,
    config: value.config,
    overrides: value.overrides,
  })
  assert.equal(audit.summary.packages, 1)
  assert.equal(audit.summary.missingLicensePackages, 1)
  assert.equal(audit.summary.errors, 1)
  assert.equal(audit.errors[0].package, 'example')
  assert.deepEqual(audit.reviewQueue[0].reasons, [
    'license-metadata',
    'license-review-required',
    'missing-license-metadata',
    'notice-evidence-required',
  ])
})

test('release check accepts an evidenced package review', () => {
  const value = fixture()
  value.overrides.packageLicenses.example = {
    licenseIds: ['LPPL-1.3c'],
    evidence: ['texmf-dist/doc/latex/example/README'],
    noticePaths: ['texmf-dist/doc/latex/example/README'],
    reviewed: true,
  }
  const outputDir = join(value.root, 'mirror')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath: join(value.root, 'provenance.json'),
    config: value.config,
    overrides: value.overrides,
    texmfArchivePath: value.texmfArchive,
    metadataArchivePath: value.metadataArchive,
  })
  assert.equal(manifest.releaseStatus, 'provenance-reviewed')
  assert.deepEqual(
    checkMirror({ manifest, mirrorRoot: outputDir, requireLicenseReview: true }),
    [],
  )
})

test('records identical flattened-name collisions without silently dropping provenance', () => {
  const value = fixture()
  mkdirSync(join(value.texmf, 'tex/generic/example'), { recursive: true })
  writeFileSync(join(value.texmf, 'tex/generic/example/example.sty'), 'same\n')
  writeFileSync(
    value.tlpdb,
    [
      'name example',
      'revision 42',
      'catalogue-license lppl1.3c',
      'runfiles size=2',
      ' texmf-dist/tex/latex/example/example.sty',
      ' texmf-dist/tex/generic/example/example.sty',
      'docfiles size=1',
      ' texmf-dist/doc/latex/example/README',
      '',
    ].join('\n'),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir: join(value.root, 'mirror'),
    manifestPath: join(value.root, 'provenance.json'),
    config: value.config,
    overrides: value.overrides,
  })
  assert.equal(manifest.files[0].collision.decision, 'identical-content')
  assert.deepEqual(manifest.files[0].collision.candidateSources, [
    'texmf-dist/tex/latex/example/example.sty',
    'texmf-dist/tex/generic/example/example.sty',
  ])
})

test('checker rejects unsafe keys and modified mirror bytes', () => {
  const value = fixture()
  const outputDir = join(value.root, 'mirror')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath: join(value.root, 'provenance.json'),
    config: value.config,
    overrides: value.overrides,
  })
  writeFileSync(join(outputDir, 'pdftex/26/example.sty'), 'modified\n')
  assert.match(checkMirror({ manifest, mirrorRoot: outputDir }).join('\n'), /SHA-256 mismatch/)
  const unsafe = structuredClone(manifest)
  unsafe.files[0].key = '../../outside'
  assert.match(checkMirror({ manifest: unsafe, mirrorRoot: outputDir }).join('\n'), /unsafe mirror key/)
  const staleRevision = structuredClone(manifest)
  staleRevision.mirrorRevision = '2025-0000000000000000'
  assert.match(
    checkMirror({ manifest: staleRevision, mirrorRoot: outputDir }).join('\n'),
    /mirrorRevision does not match/,
  )
})

test('fails closed when a package has no declared or reviewed license', () => {
  const value = fixture()
  writeFileSync(
    value.tlpdb,
    [
      'name example',
      'revision 42',
      'runfiles size=1',
      ' texmf-dist/tex/latex/example/example.sty',
      '',
    ].join('\n'),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  assert.throws(
    () =>
      generateMirror({
        texmfDist: value.texmf,
        tlpdbPath: value.tlpdb,
        outputDir: join(value.root, 'mirror'),
        manifestPath: join(value.root, 'provenance.json'),
        config: value.config,
        overrides: value.overrides,
      }),
    /no catalogue license/,
  )
})

test('generates completion metadata without turning package review into a catalog gate', () => {
  const value = fixture()
  mkdirSync(join(value.texmf, 'tex/latex/example'), { recursive: true })
  writeFileSync(join(value.texmf, 'tex/latex/example/dvipsnam.def'), '\\definecolor{sample}\n')
  writeFileSync(join(value.texmf, 'tex/latex/example/helper.lua'), 'return {}\n')
  writeFileSync(
    value.tlpdb,
    [
      'name example',
      'revision 42',
      'catalogue example',
      'runfiles size=3',
      ' texmf-dist/tex/latex/example/example.sty',
      ' texmf-dist/tex/latex/example/dvipsnam.def',
      ' texmf-dist/tex/latex/example/helper.lua',
      '',
    ].join('\n'),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  const outputDir = join(value.root, 'completion-metadata')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath: join(value.root, 'completion-provenance.json'),
    config: value.config,
    overrides: value.overrides,
    texmfArchivePath: value.texmfArchive,
    metadataArchivePath: value.metadataArchive,
    scope: 'completion-metadata',
  })

  assert.equal(manifest.releaseStatus, 'metadata-only')
  assert.deepEqual(
    manifest.files.map((file) => file.key),
    ['pdftex/26/dvipsnam.def', 'pdftex/26/example.sty'],
  )
  assert.equal('license' in manifest.files[0].source, false)
  assert.deepEqual(
    checkMirror({ manifest, mirrorRoot: outputDir, allowCompletionMetadata: true }),
    [],
  )
  assert.match(
    checkMirror({ manifest, mirrorRoot: outputDir }).join('\n'),
    /requires explicit allowCompletionMetadata/,
  )
  assert.match(
    checkMirror({
      manifest,
      mirrorRoot: outputDir,
      allowCompletionMetadata: true,
      requireLicenseReview: true,
    }).join('\n'),
    /not provenance-reviewed/,
  )
})

test('fails closed on a differing flattened-name collision', () => {
  const value = fixture()
  mkdirSync(join(value.texmf, 'tex/generic/example'), { recursive: true })
  writeFileSync(join(value.texmf, 'tex/generic/example/example.sty'), 'different\n')
  writeFileSync(
    value.tlpdb,
    [
      'name example',
      'revision 42',
      'catalogue-license lppl1.3c',
      'runfiles size=2',
      ' texmf-dist/tex/latex/example/example.sty',
      ' texmf-dist/tex/generic/example/example.sty',
      '',
    ].join('\n'),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  assert.throws(
    () =>
      generateMirror({
        texmfDist: value.texmf,
        tlpdbPath: value.tlpdb,
        outputDir: join(value.root, 'mirror'),
        manifestPath: join(value.root, 'provenance.json'),
        config: value.config,
        overrides: value.overrides,
      }),
    /differing basename collision/,
  )
})
