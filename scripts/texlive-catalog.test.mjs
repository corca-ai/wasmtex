import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  buildTexliveCatalogs,
  checkTexliveCatalog,
  generateTexliveCatalog,
} from './lib/texlive-catalog.mjs'
import { mirrorRevisionFor } from './lib/texlive-provenance.mjs'

const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function file(key, sourcePath, pkg = 'example') {
  return {
    key,
    format: key.includes('/7/') ? 7 : key.includes('/47/') ? 47 : 26,
    bytes: 10,
    sha256: key.padEnd(64, '0').slice(0, 64).replaceAll(/[^a-f0-9]/g, 'a'),
    source: {
      path: sourcePath,
      package: pkg,
      packageRevision: '42',
      catalogue: pkg,
      license: { ids: ['lppl1.3c'], references: [], source: 'test', reviewed: true },
      noticePaths: ['texmf-dist/doc/example/README'],
    },
  }
}

function manifest() {
  const files = [
    file('pdftex/26/book.cls', 'texmf-dist/tex/latex/base/book.cls', 'latex'),
    file('pdftex/26/example.sty', 'texmf-dist/tex/latex/example/example.sty'),
    file('pdftex/7/plain.bst', 'texmf-dist/bibtex/bst/base/plain.bst', 'bibtex'),
    file('pdftex/26/authoryear.bbx', 'texmf-dist/tex/latex/biblatex/bbx/authoryear.bbx', 'biblatex'),
    file('pdftex/26/authoryear.cbx', 'texmf-dist/tex/latex/biblatex/cbx/authoryear.cbx', 'biblatex'),
    file('pdftex/26/english.lbx', 'texmf-dist/tex/latex/biblatex/lbx/english.lbx', 'biblatex'),
    file('pdftex/47/texgyre.otf', 'texmf-dist/fonts/opentype/public/tex-gyre/texgyre.otf', 'tex-gyre'),
    file('pdftex/26/xespecific.cls', 'texmf-dist/tex/xelatex/example/xespecific.cls'),
    file('pdftex/26/example.def', 'texmf-dist/tex/latex/example/example.def'),
  ]
  return {
    schemaVersion: 1,
    texliveYear: '2025',
    mirrorRevision: mirrorRevisionFor('2025', files),
    source: { tlpdb: { sha256: 'f'.repeat(64) } },
    summary: { files: files.length, collisions: 0 },
    files,
  }
}

test('builds deterministic, exact resource shards from the selected mirror files', () => {
  const value = manifest()
  const first = buildTexliveCatalogs(value)
  const reordered = structuredClone(value)
  reordered.files.reverse()
  const second = buildTexliveCatalogs(reordered)

  assert.deepEqual(first, second)
  assert.deepEqual(first.index.summary.byKind, {
    'tex-class': 2,
    'tex-package': 1,
    'bib-style': 1,
    'biblatex-style': 3,
    'font-file': 1,
  })
  const classes = JSON.parse(first.shardBytes.get('classes.json'))
  assert.equal(classes.resources[0].name, 'book')
  assert.deepEqual(classes.resources[1].engines, ['xetex'])
  assert.equal(classes.resources[0].mirrorRevision, value.mirrorRevision)
  assert.equal(first.index.summary.catalogResources, 8)
})

test('writes and verifies catalog hashes, provenance, coverage, and output inventory', () => {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-catalog-'))
  temporary.push(root)
  const manifestPath = join(root, 'texlive-provenance.json')
  const catalogDir = join(root, 'catalog')
  const value = manifest()
  const manifestBytes = `${JSON.stringify(value, null, 2)}\n`
  writeFileSync(manifestPath, manifestBytes)

  const index = generateTexliveCatalog({ manifestPath, outputDir: catalogDir })
  assert.equal(index.source.sha256.length, 64)
  assert.deepEqual(
    checkTexliveCatalog({
      manifest: value,
      catalogDir,
      manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
    }),
    [],
  )

  const classesPath = join(catalogDir, 'classes.json')
  writeFileSync(classesPath, `${readFileSync(classesPath, 'utf8')} `)
  assert.match(
    checkTexliveCatalog({ manifest: value, catalogDir }).join('\n'),
    /shard SHA-256 mismatch/,
  )
})

test('fails closed when provenance revision and inventory diverge', () => {
  const value = manifest()
  value.files[0].sha256 = '0'.repeat(64)
  assert.throws(() => buildTexliveCatalogs(value), /mirrorRevision does not match/)
})
