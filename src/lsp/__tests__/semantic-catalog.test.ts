import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { LatexLanguageService } from '../../lsp-service'
import { InMemoryTexResourceCatalogProvider, type TexResourceRecord } from '../resource-catalog'
import {
  HttpTexSemanticCatalogProvider,
  InMemoryTexSemanticCatalogProvider,
  type TexSemanticCatalogIdentity,
  type TexSemanticCatalogStore,
  type TexSemanticKey,
  type TexSemanticShard,
} from '../semantic-catalog'

const identity: TexSemanticCatalogIdentity = {
  schemaVersion: 1,
  texliveYear: '2025',
  mirrorRevision: '2025-0123456789abcdef',
}

function key(
  name: string,
  type: TexSemanticKey['value']['type'],
  options: Partial<TexSemanticKey> & { values?: string[] } = {},
): TexSemanticKey {
  return {
    name,
    value: { type, ...(options.values ? { values: options.values } : {}) },
    repeatable: options.repeatable ?? false,
    confidence: options.confidence ?? 'exact',
    provenance: options.provenance ?? [
      {
        evidence: 'declared',
        sourcePath: `texmf-dist/tex/latex/example/${name}.sty`,
        line: 1,
        extractor: 'test',
      },
    ],
  }
}

function shard(
  scopeId: string,
  families: Array<{ name: string; keys: TexSemanticKey[] }>,
  commands: TexSemanticShard['commands'] = [],
  environments: TexSemanticShard['environments'] = [],
): TexSemanticShard {
  const [kind, name] = scopeId.split('/') as ['class' | 'package', string]
  return {
    ...identity,
    scope: {
      id: scopeId,
      kind,
      name,
      fileName: `${name}.${kind === 'class' ? 'cls' : 'sty'}`,
      key: `pdftex/26/${name}.${kind === 'class' ? 'cls' : 'sty'}`,
      sourcePath: `texmf-dist/tex/latex/${name}/${name}.sty`,
      texlivePackage: name,
      packageRevision: '42',
      catalogue: name,
    },
    keyFamilies: families,
    commands,
    environments,
    dependencies: [],
    unsupported: [],
    coverage: {
      keys: families.flatMap((family) => family.keys).length,
      commands: commands.length,
      environments: environments.length,
      exact:
        families.flatMap((family) => family.keys).length + commands.length + environments.length,
      declared: families.flatMap((family) => family.keys).length,
      observed: 0,
      inferred: 0,
      overridden: 0,
      unresolved: 0,
    },
  }
}

function marked(source: string): { text: string; line: number; column: number } {
  const offset = source.indexOf('¦')
  if (offset < 0) throw new Error('missing cursor marker')
  const text = source.slice(0, offset) + source.slice(offset + 1)
  const before = source.slice(0, offset).split('\n')
  return { text, line: before.length, column: before.at(-1)!.length + 1 }
}

function complete(service: LatexLanguageService, source: string) {
  const fixture = marked(source)
  service.updateFile('main.tex', fixture.text)
  return service.getCompletionResult('main.tex', fixture.line, fixture.column)
}

describe('typed semantic completion', () => {
  const book = shard('class/book', [
    {
      name: 'class-options',
      keys: [
        key('draft', 'flag'),
        key('repeatable', 'flag', { repeatable: true }),
        key('paper', 'enum', { values: ['a4paper', 'letterpaper'] }),
        key('twoside', 'boolean'),
      ],
    },
  ])

  it('uses the class selector after the optional argument and inserts the correct key form', () => {
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [book]),
    })
    expect(complete(service, '\\documentclass[dr¦]{book}')).toMatchObject({
      isIncomplete: false,
      items: [{ label: 'draft', insertText: 'draft' }],
    })
    expect(complete(service, '\\documentclass[pa¦]{book}')).toMatchObject({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Monaco snippet placeholder syntax.
      items: [{ label: 'paper', insertText: 'paper=${1}', snippet: true }],
    })
  })

  it('omits an already used non-repeatable key but preserves repeatable keys', () => {
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [book]),
    })
    expect(
      complete(service, '\\documentclass[draft, dr¦]{book}').items.map((item) => item.label),
    ).not.toContain('draft')
    expect(
      complete(service, '\\documentclass[repeatable, rep¦]{book}').items.map((item) => item.label),
    ).toContain('repeatable')
  })

  it('completes enum and boolean value positions without validating unknown text', () => {
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [book]),
    })
    expect(
      complete(service, '\\documentclass[paper=a¦]{book}').items.map((item) => item.label),
    ).toEqual(['a4paper'])
    expect(
      complete(service, '\\documentclass[twoside=f¦]{book}').items.map((item) => item.label),
    ).toEqual(['false'])
    expect(complete(service, '\\documentclass[unknown=anything¦]{book}').items).toEqual([])
  })

  it('aggregates options from every selected package with scope provenance', () => {
    const xcolor = shard('package/xcolor', [
      { name: 'package-options', keys: [key('dvipsnames', 'flag')] },
    ])
    const hyperref = shard('package/hyperref', [
      { name: 'package-options', keys: [key('colorlinks', 'boolean')] },
    ])
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [xcolor, hyperref]),
    })
    const items = complete(service, '\\usepackage[¦]{xcolor,hyperref}').items
    expect(items.map((item) => item.label).sort()).toEqual(['colorlinks', 'dvipsnames'])
    expect(items.find((item) => item.label === 'colorlinks')?.documentation).toContain(
      '`package/hyperref`',
    )
  })

  it('dispatches typed semantic values to the matching resource catalog', () => {
    const biblatex = shard('package/biblatex', [
      { name: 'package-options', keys: [key('style', 'biblatex-style')] },
    ])
    const style: TexResourceRecord = {
      name: 'authoryear',
      fileName: 'authoryear.bbx',
      extension: 'bbx',
      key: 'pdftex/26/authoryear.bbx',
      format: 26,
      bytes: 10,
      sha256: 'a'.repeat(64),
      texliveYear: identity.texliveYear,
      mirrorRevision: identity.mirrorRevision,
      sourcePath: 'texmf-dist/tex/latex/biblatex/bbx/authoryear.bbx',
      texlivePackage: 'biblatex',
      packageRevision: '42',
      catalogue: 'biblatex',
    }
    const resourceCatalog = new InMemoryTexResourceCatalogProvider(identity, [
      { ...identity, kind: 'biblatex-style', resources: [style] },
    ])
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [biblatex]),
      resourceCatalog,
    })
    expect(
      complete(service, '\\usepackage[style=auth¦]{biblatex}').items.map((item) => item.label),
    ).toEqual(['authoryear'])
  })

  it('registers shard command signatures and environments for loaded packages', () => {
    const provenance = key('x', 'flag').provenance
    const hyperref = shard(
      'package/hyperref',
      [{ name: 'hyperref/hypersetup', keys: [key('colorlinks', 'boolean')] }],
      [
        {
          name: 'hypersetup',
          args: [
            {
              kind: 'required',
              valueKind: 'key-value',
              keyFamily: 'hyperref/hypersetup',
              list: true,
            },
          ],
          confidence: 'exact',
          provenance,
        },
      ],
      [{ name: 'hyperbox', args: [], confidence: 'exact', provenance }],
    )
    const service = new LatexLanguageService({
      files: { 'main.tex': '\\usepackage{hyperref}' },
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [hyperref]),
    })
    expect(
      complete(service, '\\usepackage{hyperref}\n\\hypersetup{col¦}').items.map(
        (item) => item.label,
      ),
    ).toEqual(['colorlinks'])
    expect(
      complete(service, '\\usepackage{hyperref}\n\\begin{hyper¦}').items.map((item) => item.label),
    ).toContain('hyperbox')
  })
})

function memoryStore(): TexSemanticCatalogStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get(storageKey) {
      return values.get(storageKey) ?? null
    },
    async set(storageKey, value) {
      values.set(storageKey, value)
    },
  }
}

function remoteFixture(value: TexSemanticShard) {
  const shardText = `${JSON.stringify(value, null, 2)}\n`
  const path = `classes/${value.scope.name}.json`
  const index = {
    ...identity,
    scopes: {
      [value.scope.id]: {
        path,
        sha256: createHash('sha256').update(shardText).digest('hex'),
        coverage: value.coverage,
      },
    },
  }
  return { indexText: `${JSON.stringify(index, null, 2)}\n`, shardText, path }
}

describe('HttpTexSemanticCatalogProvider', () => {
  const book = shard('class/book', [{ name: 'class-options', keys: [key('draft', 'flag')] }])

  it('represents lazy partial loading and deduplicates verified fetches', async () => {
    const remote = remoteFixture(book)
    const fetchImpl = vi.fn(
      async (url: string | URL) =>
        new Response(String(url).endsWith('/index.json') ? remote.indexText : remote.shardText),
    )
    const provider = new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: fetchImpl as typeof fetch,
    })
    const service = new LatexLanguageService({ semanticCatalog: provider })

    expect(complete(service, '\\documentclass[dr¦]{book}')).toEqual({
      items: [],
      isIncomplete: true,
    })
    await Promise.all([provider.load('class/book'), provider.load('class/book')])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(complete(service, '\\documentclass[dr¦]{book}')).toMatchObject({
      items: [{ label: 'draft' }],
      isIncomplete: false,
    })
  })

  it('uses the pluggable verified cache offline', async () => {
    const remote = remoteFixture(book)
    const store = memoryStore()
    await new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      store,
      fetchImpl: (async (url: string | URL) =>
        new Response(
          String(url).endsWith('/index.json') ? remote.indexText : remote.shardText,
        )) as typeof fetch,
    }).load('class/book')
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    const provider = new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      store,
      fetchImpl: offline as typeof fetch,
    })
    await expect(provider.load('class/book')).resolves.toMatchObject({ status: 'ready' })
    expect(offline).not.toHaveBeenCalled()
  })

  it('fails closed on profile mismatch and treats absent scopes as complete', async () => {
    const remote = remoteFixture(book)
    const wrong = JSON.parse(remote.indexText)
    wrong.mirrorRevision = '2025-fedcba9876543210'
    const mismatch = new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: (async () => new Response(JSON.stringify(wrong))) as typeof fetch,
    })
    await expect(mismatch.load('class/book')).resolves.toMatchObject({ status: 'mismatch' })

    const absent = new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: (async () =>
        new Response(JSON.stringify({ ...identity, scopes: {} }))) as typeof fetch,
    })
    await expect(absent.load('package/not-installed')).resolves.toMatchObject({ status: 'absent' })
  })
})
