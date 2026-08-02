import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'node:test'
import {
  buildTexSemanticCatalog,
  checkTexSemanticCatalog,
  generateTexSemanticCatalog,
  loadTexSemanticInputs,
} from './lib/tex-semantic-catalog.mjs'
import { mirrorRevisionFor } from './lib/texlive-provenance.mjs'

const temporary = []
afterEach(() => {
  for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true })
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-semantic-'))
  temporary.push(root)
  const mirrorRoot = join(root, 'mirror')
  const sourceOverridesPath = join(process.cwd(), 'scripts/tex-semantic-overrides-2025.json')
  const overrides = JSON.parse(readFileSync(sourceOverridesPath, 'utf8'))
  const scopeIds = [...Object.keys(overrides.scopes), 'package/example']
  const files = scopeIds.map((scopeId) => {
    const [kind, name] = scopeId.split('/')
    const ext = kind === 'class' ? 'cls' : 'sty'
    const key = `pdftex/26/${name}.${ext}`
    const source =
      scopeId === 'package/example'
        ? String.raw`\DeclareOption{draft}{x}\define@key{setup}{enabled}{\iftrue}\keys_define:nn{example}{mode .choices:nn={one,two}{}}`
        : `\\Provides${kind === 'class' ? 'Class' : 'Package'}{${name}}\n`
    const bytes = Buffer.from(source)
    const path = join(mirrorRoot, key)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, bytes)
    return {
      key,
      format: 26,
      bytes: bytes.length,
      sha256: sha256(bytes),
      source: {
        path: `texmf-dist/tex/latex/${name}/${name}.${ext}`,
        package: name,
        packageRevision: '42',
        catalogue: name,
        license: { ids: ['lppl1.3c'], references: [], source: 'test', reviewed: true },
        noticePaths: [`texmf-dist/doc/latex/${name}/README`],
      },
    }
  })
  for (const [fileName, source] of [
    ['dvipsnam.def', String.raw`\DefineNamedColor{named}{Apricot}{cmyk}{0,0.32,0.52,0}`],
    ['svgnam.def', String.raw`\preparecolorset{rgb}{}{}{AliceBlue,.94,.972,1;Fuchsia,1,0,1}`],
    ['x11nam.def', String.raw`\preparecolorset{rgb}{}{}{AntiqueWhite1,1,.94,.86}`],
  ]) {
    const key = `pdftex/26/${fileName}`
    const bytes = Buffer.from(source)
    const path = join(mirrorRoot, key)
    writeFileSync(path, bytes)
    files.push({
      key,
      format: 26,
      bytes: bytes.length,
      sha256: sha256(bytes),
      source: {
        path: `texmf-dist/tex/latex/xcolor/${fileName}`,
        package: 'xcolor',
        packageRevision: '42',
        catalogue: 'xcolor',
        license: { ids: ['lppl1.3c'], references: [], source: 'test', reviewed: true },
        noticePaths: ['texmf-dist/doc/latex/xcolor/README'],
      },
    })
  }
  const fixtureCounts = { 'dvipsnam.def': 1, 'svgnam.def': 2, 'x11nam.def': 1 }
  for (const source of overrides.scopes['package/xcolor'].colorSources) {
    source.expectedCount = fixtureCounts[source.fileName]
  }
  const overridesPath = join(root, 'tex-semantic-overrides-2025.json')
  writeFileSync(overridesPath, `${JSON.stringify(overrides, null, 2)}\n`)
  const manifest = {
    schemaVersion: 1,
    texliveYear: '2025',
    files,
  }
  manifest.mirrorRevision = mirrorRevisionFor(manifest.texliveYear, files)
  const manifestPath = join(root, 'texlive-provenance.json')
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  const probes = {
    schemaVersion: 1,
    texliveYear: '2025',
    mirrorRevision: manifest.mirrorRevision,
    source: 'test-probe.json',
    scopes: {
      'package/example': {
        keyFamilies: [
          {
            name: 'example/runtime',
            keys: [{ name: 'observed', value: { type: 'boolean' }, repeatable: false }],
          },
        ],
      },
    },
  }
  const probeReportPath = join(root, 'probes.json')
  writeFileSync(probeReportPath, `${JSON.stringify(probes, null, 2)}\n`)
  return { root, mirrorRoot, manifest, manifestPath, overrides, overridesPath, probeReportPath }
}

test('builds all verified high-value scopes only when resources exist in the mirror', () => {
  const value = fixture()
  const result = buildTexSemanticCatalog({
    manifest: value.manifest,
    mirrorRoot: value.mirrorRoot,
    overrides: value.overrides,
  })

  assert.deepEqual(result.index.summary.overrideScopesAbsent, [])
  for (const scope of [
    'class/book',
    'class/beamer',
    'package/amsmath',
    'package/graphicx',
    'package/xcolor',
    'package/hyperref',
    'package/geometry',
    'package/babel',
    'package/polyglossia',
    'package/fontspec',
    'package/biblatex',
    'package/tikz',
    'package/pgfplots',
    'package/siunitx',
    'package/listings',
    'package/minted',
    'package/cleveref',
    'package/glossaries',
  ]) {
    assert.ok(result.index.scopes[scope], `${scope} is missing`)
    assert.ok(result.index.scopes[scope].coverage.overridden > 0, `${scope} has no override evidence`)
  }
  assert.ok(result.index.summary.declared > 0)
  assert.ok(result.index.summary.inferred > 0)
  assert.ok(result.index.summary.overridden > 0)
  assert.equal(result.index.summary.colors, 4)
})

test('writes deterministic shards, coverage, source hashes, and observed provenance', () => {
  const value = fixture()
  const outputDir = join(value.root, 'semantic')
  const result = generateTexSemanticCatalog({
    manifestPath: value.manifestPath,
    mirrorRoot: value.mirrorRoot,
    overridesPath: value.overridesPath,
    probeReportPath: value.probeReportPath,
    outputDir,
  })
  assert.equal(result.index.source.manifestSha256.length, 64)
  assert.equal(result.index.source.overridesSha256.length, 64)
  assert.equal(result.index.source.probesSha256.length, 64)
  assert.equal(result.index.summary.observed, 1)
  assert.deepEqual(
    checkTexSemanticCatalog({
      ...loadTexSemanticInputs({
        manifestPath: value.manifestPath,
        overridesPath: value.overridesPath,
        probeReportPath: value.probeReportPath,
      }),
      mirrorRoot: value.mirrorRoot,
      catalogDir: outputDir,
    }),
    [],
  )

  const example = JSON.parse(readFileSync(join(outputDir, 'packages/example.json'), 'utf8'))
  assert.equal(example.keyFamilies.find((family) => family.name === 'example/runtime').keys[0].confidence, 'observed')
  assert.equal(example.coverage.observed, 1)

  const book = JSON.parse(readFileSync(join(outputDir, 'classes/book.json'), 'utf8'))
  assert.ok(book.keyFamilies.find((family) => family.name === 'class-options').keys.length > 5)
  const hyperref = JSON.parse(readFileSync(join(outputDir, 'packages/hyperref.json'), 'utf8'))
  assert.equal(hyperref.commands[0].name, 'hypersetup')
  const xcolor = JSON.parse(readFileSync(join(outputDir, 'packages/xcolor.json'), 'utf8'))
  assert.deepEqual(
    xcolor.colors.map((color) => [
      color.name,
      color.availability.anyOptions,
      color.availability.deferredOptions,
      color.priority,
    ]),
    [
      ['AliceBlue', ['svgnames'], ['svgnames*'], 20],
      ['AntiqueWhite1', ['x11names'], ['x11names*'], 30],
      ['Apricot', ['dvipsnames'], ['dvipsnames*'], 10],
      ['Fuchsia', ['svgnames'], ['svgnames*'], 20],
    ],
  )
  const fontspec = JSON.parse(readFileSync(join(outputDir, 'packages/fontspec.json'), 'utf8'))
  assert.deepEqual(fontspec.scope.engines, ['luatex', 'xetex'])
  const polyglossia = JSON.parse(readFileSync(join(outputDir, 'packages/polyglossia.json'), 'utf8'))
  assert.deepEqual(polyglossia.scope.engines, ['luatex', 'xetex'])
  const pgfplots = JSON.parse(readFileSync(join(outputDir, 'packages/pgfplots.json'), 'utf8'))
  assert.deepEqual(pgfplots.dependencies, ['tikz'])
})

test('detects semantic shard and provenance drift', () => {
  const value = fixture()
  const outputDir = join(value.root, 'semantic')
  generateTexSemanticCatalog({
    manifestPath: value.manifestPath,
    mirrorRoot: value.mirrorRoot,
    overridesPath: value.overridesPath,
    outputDir,
  })
  const path = join(outputDir, 'packages/geometry.json')
  writeFileSync(path, `${readFileSync(path, 'utf8')} `)
  assert.match(
    checkTexSemanticCatalog({
      ...loadTexSemanticInputs({
        manifestPath: value.manifestPath,
        overridesPath: value.overridesPath,
      }),
      mirrorRoot: value.mirrorRoot,
      catalogDir: outputDir,
    }).join('\n'),
    /deterministic generation drift/,
  )

  const sourcePath = join(value.mirrorRoot, value.manifest.files[0].key)
  writeFileSync(sourcePath, 'changed')
  assert.throws(
    () =>
      buildTexSemanticCatalog({
        manifest: value.manifest,
        mirrorRoot: value.mirrorRoot,
        overrides: value.overrides,
      }),
    /mirror bytes do not match provenance/,
  )
})

test('fails closed when an exact conditional color source is absent', () => {
  const value = fixture()
  const source = value.manifest.files.find((file) => file.key.endsWith('/svgnam.def'))
  rmSync(join(value.mirrorRoot, source.key))
  assert.throws(
    () =>
      buildTexSemanticCatalog({
        manifest: value.manifest,
        mirrorRoot: value.mirrorRoot,
        overrides: value.overrides,
      }),
    /required color source is absent|mirror file is missing/,
  )
})

test('locks the semantic catalog bytes as a TeX Live upgrade golden', () => {
  const value = fixture()
  const result = buildTexSemanticCatalog({
    manifest: value.manifest,
    mirrorRoot: value.mirrorRoot,
    overrides: value.overrides,
  })
  const digest = sha256(
    [...result.shardBytes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, bytes]) => `${path}\0${bytes}`)
      .join('\0'),
  )
  assert.equal(digest, '19a4262401035da365019cebe6ddbb3eedafdb97fd2f901c512912f2ef1a53fb')
})
