import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createCompletionSnapshot } from '../../engine/completion-snapshot'
import { LatexLanguageService } from '../../lsp-service'
import { InMemoryTexResourceCatalogProvider, type TexResourceRecord } from '../resource-catalog'
import {
  HttpTexSemanticCatalogProvider,
  InMemoryTexSemanticCatalogProvider,
  type TexSemanticCatalogIdentity,
  type TexSemanticCatalogStore,
  type TexSemanticColor,
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

function color(name: string, options: Partial<TexSemanticColor> = {}): TexSemanticColor {
  return {
    name,
    kind: options.kind ?? 'define',
    confidence: options.confidence ?? 'exact',
    provenance: options.provenance ?? [
      {
        evidence: 'declared',
        sourcePath: `texmf-dist/tex/latex/xcolor/${name}.def`,
        line: 1,
        extractor: 'test',
      },
    ],
    ...(options.model ? { model: options.model } : {}),
    ...(options.value ? { value: options.value } : {}),
    ...(options.alias ? { alias: options.alias } : {}),
    ...(options.availability ? { availability: options.availability } : {}),
    ...(options.priority !== undefined ? { priority: options.priority } : {}),
  }
}

function shard(
  scopeId: string,
  families: Array<{ name: string; keys: TexSemanticKey[] }>,
  commands: TexSemanticShard['commands'] = [],
  environments: TexSemanticShard['environments'] = [],
  colors: TexSemanticColor[] = [],
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
    colors,
    dependencies: [],
    unsupported: [],
    coverage: {
      keys: families.flatMap((family) => family.keys).length,
      commands: commands.length,
      environments: environments.length,
      colors: colors.length,
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

  it('preserves richer builtin typing when a shard also declares the command', () => {
    const provenance = key('x', 'flag').provenance
    const xkeyval = shard(
      'package/xkeyval',
      [],
      [
        {
          name: 'setkeys',
          args: [{ kind: 'required' }],
          confidence: 'exact',
          provenance,
        },
      ],
    )
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [xkeyval]),
    })
    expect(
      complete(
        service,
        '\\usepackage{xkeyval}\n\\definechoicekey{layout}{mode}{draft,final}{}\n\\setkeys{layout}{mo¦}',
      ).items.map((item) => item.label),
    ).toContain('mode')
  })
})

describe('color completion', () => {
  const xcolor = shard(
    'package/xcolor',
    [],
    [],
    [],
    [
      color('AliceBlue', {
        model: 'rgb',
        value: '.94,.972,1',
        availability: { anyOptions: ['svgnames'], deferredOptions: ['svgnames*'] },
        priority: 20,
      }),
      color('Apricot', {
        model: 'cmyk',
        value: '0,.32,.52,0',
        availability: { anyOptions: ['dvipsnames'], deferredOptions: ['dvipsnames*'] },
        priority: 10,
      }),
    ],
  )

  it('activates palettes from package or class options only', () => {
    const beamer = shard('class/beamer', [])
    beamer.dependencies = ['xcolor']
    const provider = new InMemoryTexSemanticCatalogProvider(identity, [xcolor, beamer])
    const svg = new LatexLanguageService({
      files: { 'main.tex': '\\usepackage[svgnames]{xcolor}' },
      semanticCatalog: provider,
    })
    expect(
      complete(svg, '\\usepackage[svgnames]{xcolor}\n\\color{A¦}').items.map((item) => item.label),
    ).toEqual(['AliceBlue'])

    const deferred = new LatexLanguageService({
      semanticCatalog: provider,
    })
    expect(
      complete(deferred, '\\usepackage[svgnames*]{xcolor}\n\\color{A¦}').items.map(
        (item) => item.label,
      ),
    ).toEqual([])
    expect(
      complete(
        deferred,
        '\\usepackage[svgnames*]{xcolor}\n\\definecolors{AliceBlue}\n\\color{A¦}',
      ).items.map((item) => item.label),
    ).toEqual(['AliceBlue'])

    const dvips = new LatexLanguageService({
      files: { 'main.tex': '\\documentclass[dvipsnames]{book}\n\\usepackage{xcolor}' },
      semanticCatalog: provider,
    })
    expect(
      complete(
        dvips,
        '\\documentclass[dvipsnames]{book}\n\\usepackage{xcolor}\n\\color{A¦}',
      ).items.map((item) => item.label),
    ).toEqual(['Apricot'])

    const implicit = new LatexLanguageService({
      files: { 'main.tex': '\\documentclass[svgnames]{beamer}' },
      semanticCatalog: provider,
    })
    expect(
      complete(implicit, '\\documentclass[svgnames]{beamer}\n\\color{A¦}').items.map(
        (item) => item.label,
      ),
    ).toEqual(['AliceBlue'])
  })

  it('uses one resolver for direct commands and typed color keys', () => {
    const hyperref = shard('package/hyperref', [
      { name: 'hyperref/hypersetup', keys: [key('linkcolor', 'color')] },
    ])
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [xcolor, hyperref]),
    })
    for (const source of [
      '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{123456}\n\\color{br¦}',
      '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{123456}\n\\textcolor{br¦}{x}',
      '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{123456}\n\\colorbox{br¦}{x}',
      '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{123456}\n\\fcolorbox{red}{br¦}{x}',
      '\\usepackage{xcolor,hyperref}\n\\definecolor{brand}{HTML}{123456}\n\\hypersetup{linkcolor=br¦}',
    ]) {
      expect(complete(service, source).items.map((item) => item.label)).toContain('brand')
    }
    expect(
      complete(
        service,
        '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{123456}\n\\color[RGB]{1,2,¦}',
      ).items,
    ).toEqual([])
  })

  it('replaces only the active xcolor expression segment and preserves swatch metadata', () => {
    const service = new LatexLanguageService()
    const result = complete(
      service,
      '\\usepackage{xcolor}\n\\definecolor{blueish}{RGB}{1,2,3}\n\\color{red!50!bl¦X}',
    )
    const item = result.items.find((candidate) => candidate.label === 'blueish')!
    expect(item.replacementRange).toEqual({
      startLine: 3,
      startColumn: 15,
      endLine: 3,
      endColumn: 18,
    })
    expect(item.data).toMatchObject({
      wasmtex: { domain: 'color', color: { css: '#010203' } },
    })
  })

  it('computes optional preview metadata for project color aliases and mixes', () => {
    const service = new LatexLanguageService()
    const item = complete(
      service,
      [
        '\\usepackage{xcolor}',
        '\\definecolor{brand}{HTML}{112233}',
        '\\colorlet{soft}{brand!50!white}',
        '\\color{so¦}',
      ].join('\n'),
    ).items.find((candidate) => candidate.label === 'soft')
    expect(item?.data).toMatchObject({
      wasmtex: { color: { css: '#889199' } },
    })
  })

  it('applies provide, alias, redefinition, include scope, edits, and deletion deterministically', () => {
    const service = new LatexLanguageService({
      files: {
        'main.tex': '\\usepackage{xcolor}\n\\input{colors}\n\\input{chapter}',
        'colors.tex': [
          '\\definecolor{brand}{HTML}{112233}',
          '\\providecolor{brand}{HTML}{ffffff}',
          '\\colorlet{accent}{brand}',
        ].join('\n'),
        'chapter.tex': '',
        'other.tex': '\\definecolor{hidden}{HTML}{000000}',
      },
    })
    const source = '\\usepackage{xcolor}\n\\input{colors}\n\\input{chapter}\n\\color{¦}'
    expect(complete(service, source).items.map((item) => item.label)).not.toContain('hidden')
    expect(
      complete(service, source).items.find((item) => item.label === 'accent')?.data,
    ).toMatchObject({
      wasmtex: { color: { css: '#112233' }, provenance: { source: 'colors.tex:3' } },
    })

    service.updateFile('colors.tex', '\\definecolor{newbrand}{HTML}{445566}')
    expect(complete(service, source).items.map((item) => item.label)).toContain('newbrand')
    expect(complete(service, source).items.map((item) => item.label)).not.toContain('brand')
    service.removeFile('colors.tex')
    expect(complete(service, source).items.map((item) => item.label)).not.toContain('newbrand')
  })

  it('ranks observed colors above static metadata and below project declarations', () => {
    const observedXcolor = shard(
      'package/xcolor',
      [],
      [],
      [],
      [
        color('brand', { model: 'HTML', value: 'ff0000', priority: 0 }),
        color('brand', {
          model: 'HTML',
          value: '0000ff',
          priority: 50,
          confidence: 'observed',
          provenance: [
            {
              evidence: 'observed',
              sourcePath: 'completion-snapshot.json',
              extractor: 'runtime-observation',
            },
          ],
        }),
      ],
    )
    const service = new LatexLanguageService({
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [observedXcolor]),
    })
    expect(complete(service, '\\usepackage{xcolor}\n\\color{bra¦}').items[0]?.data).toMatchObject({
      wasmtex: { color: { css: '#0000ff' } },
    })
    expect(
      complete(service, '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{00ff00}\n\\color{bra¦}')
        .items[0]?.data,
    ).toMatchObject({ wasmtex: { color: { css: '#00ff00' } } })
  })

  it('lets fresh runtime observations override inferred metadata without hiding project declarations', async () => {
    const inferredXcolor = shard(
      'package/xcolor',
      [],
      [],
      [],
      [color('brand', { model: 'HTML', value: 'ff0000', confidence: 'inferred' })],
    )
    const runtimeSource = marked('\\usepackage{xcolor}\n\\color{bra¦}')
    const runtimeService = new LatexLanguageService({
      files: { 'main.tex': runtimeSource.text },
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [inferredXcolor]),
    })
    const runtimeSnapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile: {
        id: 'semantic-test',
        texliveYear: '2025',
        mirrorRevision: identity.mirrorRevision,
      },
      projectFiles: [{ path: 'main.tex', content: runtimeSource.text }],
      engineObservation: {
        counters: [],
        colors: ['brand'],
        keyFamilies: [],
        complete: true,
      },
    })
    await runtimeService.updateCompletionSnapshot(runtimeSnapshot)

    const runtimeBrand = runtimeService
      .getCompletionResult('main.tex', runtimeSource.line, runtimeSource.column)
      .items.find((item) => item.label === 'brand')
    expect(runtimeBrand?.data).toMatchObject({
      wasmtex: { provenance: { confidence: 'runtime-observed' } },
    })
    expect(runtimeBrand?.data).not.toMatchObject({ wasmtex: { color: { css: '#ff0000' } } })

    const projectSource = marked(
      '\\usepackage{xcolor}\n\\definecolor{brand}{HTML}{00ff00}\n\\color{bra¦}',
    )
    const projectService = new LatexLanguageService({
      files: { 'main.tex': projectSource.text },
      semanticCatalog: new InMemoryTexSemanticCatalogProvider(identity, [inferredXcolor]),
    })
    const projectSnapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile: runtimeSnapshot.identity.profile,
      projectFiles: [{ path: 'main.tex', content: projectSource.text }],
      engineObservation: {
        counters: [],
        colors: ['brand'],
        keyFamilies: [],
        complete: true,
      },
    })
    await projectService.updateCompletionSnapshot(projectSnapshot)

    expect(
      projectService
        .getCompletionResult('main.tex', projectSource.line, projectSource.column)
        .items.find((item) => item.label === 'brand')?.data,
    ).toMatchObject({
      wasmtex: { color: { css: '#00ff00' }, provenance: { confidence: 'project' } },
    })
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

  it('binds browser-style fetch implementations to the global object', async () => {
    const remote = remoteFixture(book)
    const browserFetch = vi.fn(async function (this: unknown, url: string | URL) {
      if (this !== globalThis) throw new TypeError('Illegal invocation')
      return new Response(String(url).endsWith('/index.json') ? remote.indexText : remote.shardText)
    })
    const provider = new HttpTexSemanticCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: browserFetch as typeof fetch,
    })

    await expect(provider.load('class/book')).resolves.toMatchObject({ status: 'ready' })
    expect(browserFetch).toHaveBeenCalledTimes(2)
  })

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
