import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  auditMirror,
  auditTlpdb,
  checkMirror,
  generateMirror,
  parseTlpdb,
} from './lib/texlive-provenance.mjs'
import { createMaterializationReceipt } from './lib/tlnet-materialization.mjs'

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

test('normalizes relocated tlnet package ownership to installed texmf-dist paths', () => {
  const parsed = parseTlpdb(
    [
      'name relocated-example',
      'revision 7',
      'relocated 1',
      'catalogue-license lppl1.3c',
      'runfiles size=1',
      ' RELOC/tex/latex/example/example.sty',
      'docfiles size=1',
      ' RELOC/doc/latex/example/README',
      '',
    ].join('\n'),
  )
  assert.deepEqual(parsed.owners.get('texmf-dist/tex/latex/example/example.sty'), [
    'relocated-example',
  ])
  assert.deepEqual(parsed.packages.get('relocated-example').noticePaths, [
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
  assert.deepEqual(checkMirror({ manifest, mirrorRoot: outputDir, requireLicenseReview: true }), [])
})

test('records a frozen tlnet repository as the verified snapshot source', () => {
  const value = fixture()
  value.config = {
    schemaVersion: 1,
    texliveYear: '2025',
    sourceType: 'tlnet-repository',
    repository: {
      snapshot: 'tlnet-final',
      url: 'https://example.test/2025/tlnet-final/',
      frozen: true,
    },
    installer: {
      filename: 'install-tl-unx.tar.gz',
      url: 'https://example.test/2025/tlnet-final/install-tl-unx.tar.gz',
      sha512: 'a'.repeat(128),
    },
    tlpdb: {
      url: 'https://example.test/2025/tlnet-final/tlpkg/texlive.tlpdb',
      sha256: createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex'),
    },
  }
  const outputDir = join(value.root, 'tlnet-mirror')
  const materializationReceiptPath = join(value.root, 'tlnet-materialization.json')
  writeFileSync(
    materializationReceiptPath,
    `${JSON.stringify(
      createMaterializationReceipt({
        config: value.config,
        texmfDist: value.texmf,
        tlpdbPath: value.tlpdb,
      }),
    )}\n`,
  )
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath: join(value.root, 'tlnet-provenance.json'),
    config: value.config,
    overrides: value.overrides,
    materializationReceiptPath,
  })
  assert.equal(manifest.source.type, 'tlnet-repository')
  assert.equal(manifest.source.repository.snapshot, 'tlnet-final')
  assert.equal(manifest.source.tlpdb.verified, true)
  assert.deepEqual(checkMirror({ manifest, mirrorRoot: outputDir }), [])
})

test('tlnet generation rejects a missing receipt or a mutated materialized tree', () => {
  const value = fixture()
  value.config = {
    schemaVersion: 1,
    texliveYear: '2025',
    sourceType: 'tlnet-repository',
    repository: { snapshot: 'tlnet-final', url: 'https://example.test/tlnet/', frozen: true },
    installer: {
      filename: 'install-tl-unx.tar.gz',
      url: 'https://example.test/tlnet/install-tl-unx.tar.gz',
      sha512: 'a'.repeat(128),
    },
    tlpdb: {
      url: 'https://example.test/tlnet/tlpkg/texlive.tlpdb',
      sha256: createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex'),
    },
  }
  const input = {
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir: join(value.root, 'missing-receipt'),
    manifestPath: join(value.root, 'missing-receipt.json'),
    config: value.config,
    overrides: value.overrides,
  }
  assert.throws(() => generateMirror(input), /requires a materialization receipt/)
  const receiptPath = join(value.root, 'materialization.json')
  writeFileSync(
    receiptPath,
    `${JSON.stringify(
      createMaterializationReceipt({
        config: value.config,
        texmfDist: value.texmf,
        tlpdbPath: value.tlpdb,
      }),
    )}\n`,
  )
  writeFileSync(join(value.texmf, 'tex/latex/example/example.sty'), 'mutated\n')
  assert.throws(
    () => generateMirror({ ...input, materializationReceiptPath: receiptPath }),
    /does not match its verification receipt/,
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
  assert.equal(audit.summary.packagesRequiringReview, 0)
  assert.equal(audit.summary.unreviewedPackages, 0)
  assert.equal(audit.summary.errors, 0)
  assert.equal(audit.packages[0].package, 'example')
  assert.deepEqual(audit.packages[0].selectedFiles, [
    { key: 'pdftex/26/example.sty', sourcePath: 'texmf-dist/tex/latex/example/example.sty' },
  ])
  assert.deepEqual(audit.reviewQueue, [])
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
  assert.equal(audit.summary.unreviewedPackages, 0)
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
  ])
})

test('does not invent a notice requirement for a catalogued package without a notice file', () => {
  const value = fixture()
  writeFileSync(
    value.tlpdb,
    readFileSync(value.tlpdb, 'utf8').replace(
      /docfiles size=1[\s\S]*?texmf-dist\/doc\/latex\/example\/README details="license"\n/,
      '',
    ),
  )
  value.config.tlpdb.sha256 = createHash('sha256').update(readFileSync(value.tlpdb)).digest('hex')
  const outputDir = join(value.root, 'no-notice-mirror')
  const manifest = generateMirror({
    texmfDist: value.texmf,
    tlpdbPath: value.tlpdb,
    outputDir,
    manifestPath: join(value.root, 'no-notice-provenance.json'),
    config: value.config,
    overrides: value.overrides,
    texmfArchivePath: value.texmfArchive,
    metadataArchivePath: value.metadataArchive,
  })
  assert.equal(manifest.releaseStatus, 'provenance-reviewed')
  assert.deepEqual(manifest.summary.packagesWithoutNoticeEvidence, ['example'])
  assert.deepEqual(checkMirror({ manifest, mirrorRoot: outputDir, requireLicenseReview: true }), [])
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

test('checker accepts only hash-bound supplemental runtime files', () => {
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
  const key = 'pdftex/26/xetexfontlist.txt'
  const path = join(outputDir, key)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, 'font-db')
  const supplementalArtifacts = [
    { key, size: 7, sha256: createHash('sha256').update('font-db').digest('hex') },
  ]
  assert.deepEqual(
    checkMirror({
      manifest,
      mirrorRoot: outputDir,
      supplementalArtifacts,
      requireVerifiedArchives: false,
    }),
    [],
  )
  supplementalArtifacts[0].sha256 = '0'.repeat(64)
  assert.match(
    checkMirror({
      manifest,
      mirrorRoot: outputDir,
      supplementalArtifacts,
      requireVerifiedArchives: false,
    }).join('\n'),
    /supplemental SHA-256 mismatch/,
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
