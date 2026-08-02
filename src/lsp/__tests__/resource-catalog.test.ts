import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { LatexLanguageService } from '../../lsp-service'
import {
  HttpTexResourceCatalogProvider,
  InMemoryTexResourceCatalogProvider,
  type TexResourceCatalogIdentity,
  type TexResourceCatalogShard,
  type TexResourceCatalogStore,
  type TexResourceKind,
  type TexResourceRecord,
} from '../resource-catalog'

const identity: TexResourceCatalogIdentity = {
  schemaVersion: 1,
  texliveYear: '2025',
  mirrorRevision: '2025-0123456789abcdef',
}

function resource(name: string, extension: string, kind: TexResourceKind): TexResourceRecord {
  const format = kind === 'bib-style' ? 7 : kind === 'font-file' ? 47 : 26
  const fileName = `${name}.${extension}`
  return {
    name,
    fileName,
    extension,
    key: `pdftex/${format}/${fileName}`,
    format,
    bytes: 10,
    sha256: 'a'.repeat(64),
    texliveYear: identity.texliveYear,
    mirrorRevision: identity.mirrorRevision,
    sourcePath: `texmf-dist/tex/latex/example/${fileName}`,
    texlivePackage: 'example',
    packageRevision: '42',
    catalogue: 'example',
    documentationUrl: 'https://ctan.org/pkg/example',
  }
}

function shard(kind: TexResourceKind, resources: TexResourceRecord[]): TexResourceCatalogShard {
  return { ...identity, kind, resources }
}

describe('resource catalog completion', () => {
  it('does not guess mirror resources when no exact catalog was provided', () => {
    const service = new LatexLanguageService({
      files: {
        'main.tex': '\\usepackage{geo}',
        'geodesy.sty': '',
      },
    })

    expect(service.getCompletions('main.tex', 1, 16).map((item) => item.insertText)).toEqual([
      'geodesy',
    ])
  })

  it('completes mirror classes and gives project-local resources precedence', () => {
    const provider = new InMemoryTexResourceCatalogProvider(identity, [
      shard('tex-class', [
        resource('book', 'cls', 'tex-class'),
        resource('local', 'cls', 'tex-class'),
      ]),
    ])
    const service = new LatexLanguageService({
      files: {
        'main.tex': '\\documentclass{lo}',
        'local.cls': '\\ProvidesClass{local}',
      },
      resourceCatalog: provider,
    })

    const local = service.getCompletions('main.tex', 1, 18)
    expect(local.filter((item) => item.insertText === 'local')).toHaveLength(1)
    expect(local[0]).toMatchObject({
      insertText: 'local',
      detail: 'Project resource: local.cls',
      sortText: '0_local',
    })

    service.updateFile('main.tex', '\\documentclass{bo}')
    expect(service.getCompletions('main.tex', 1, 18)).toMatchObject([
      {
        label: 'book',
        insertText: 'book',
        detail: 'TeX Live 2025: example (book.cls)',
        sortText: '1_book',
      },
    ])
  })

  it('routes package, BibTeX style, and font contexts through exact shards', () => {
    const provider = new InMemoryTexResourceCatalogProvider(identity, [
      shard('tex-package', [resource('geometry', 'sty', 'tex-package')]),
      shard('bib-style', [resource('plainnat', 'bst', 'bib-style')]),
      shard('font-file', [resource('texgyretermes-regular', 'otf', 'font-file')]),
    ])
    const service = new LatexLanguageService({
      files: { 'main.tex': '' },
      resourceCatalog: provider,
    })
    for (const [source, expected] of [
      ['\\RequirePackage{geo}', 'geometry'],
      ['\\bibliographystyle{plain}', 'plainnat'],
      ['\\setmainfont{texgyre}', 'texgyretermes-regular.otf'],
    ] as const) {
      service.updateFile('main.tex', source)
      expect(
        service.getCompletions('main.tex', 1, source.length).map((item) => item.label),
      ).toContain(expected)
    }
  })
})

function memoryStore(): TexResourceCatalogStore & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    async get(key) {
      return values.get(key) ?? null
    },
    async set(key, value) {
      values.set(key, value)
    },
  }
}

function remoteFixture(kind: TexResourceKind, resources: TexResourceRecord[]) {
  const shardValue = shard(kind, resources)
  const shardText = `${JSON.stringify(shardValue, null, 2)}\n`
  const path = `${kind}.json`
  const index = {
    ...identity,
    shards: {
      [kind]: {
        path,
        count: resources.length,
        sha256: createHash('sha256').update(shardText).digest('hex'),
      },
    },
  }
  return {
    indexText: `${JSON.stringify(index, null, 2)}\n`,
    shardText,
    path,
  }
}

describe('HttpTexResourceCatalogProvider', () => {
  it('reports lazy completion as incomplete, shares concurrent loads, and verifies the shard', async () => {
    const remote = remoteFixture('tex-class', [resource('book', 'cls', 'tex-class')])
    const fetchImpl = vi.fn(async (url: string | URL) => {
      const value = String(url)
      if (value.endsWith('/index.json')) return new Response(remote.indexText)
      if (value.endsWith(`/${remote.path}`)) return new Response(remote.shardText)
      return new Response('', { status: 404 })
    })
    const provider = new HttpTexResourceCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: fetchImpl as typeof fetch,
    })
    const service = new LatexLanguageService({
      files: { 'main.tex': '\\documentclass{bo}' },
      resourceCatalog: provider,
    })

    expect(service.getCompletionResult('main.tex', 1, 18)).toEqual({
      items: [],
      isIncomplete: true,
    })
    await Promise.all([provider.load('tex-class'), provider.load('tex-class')])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(service.getCompletionResult('main.tex', 1, 18)).toMatchObject({
      isIncomplete: false,
      items: [{ label: 'book' }],
    })
  })

  it('serves a verified catalog from the pluggable store while offline', async () => {
    const remote = remoteFixture('tex-class', [resource('book', 'cls', 'tex-class')])
    const store = memoryStore()
    const online = vi.fn(
      async (url: string | URL) =>
        new Response(String(url).endsWith('/index.json') ? remote.indexText : remote.shardText),
    )
    await new HttpTexResourceCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: online as typeof fetch,
      store,
    }).load('tex-class')

    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    const provider = new HttpTexResourceCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: offline as typeof fetch,
      store,
    })
    await expect(provider.load('tex-class')).resolves.toMatchObject({ status: 'ready' })
    expect(offline).not.toHaveBeenCalled()
  })

  it('retries a transient index failure instead of pinning the rejected request', async () => {
    const remote = remoteFixture('tex-class', [resource('book', 'cls', 'tex-class')])
    let indexAttempts = 0
    const fetchImpl = vi.fn(async (url: string | URL) => {
      if (String(url).endsWith('/index.json') && indexAttempts++ === 0) {
        return new Response('', { status: 503 })
      }
      return new Response(String(url).endsWith('/index.json') ? remote.indexText : remote.shardText)
    })
    const provider = new HttpTexResourceCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(provider.load('tex-class')).resolves.toMatchObject({ status: 'error' })
    await expect(provider.load('tex-class')).resolves.toMatchObject({ status: 'ready' })
  })

  it('fails closed on a profile mismatch and does not keep retrying it', async () => {
    const remote = remoteFixture('tex-class', [resource('book', 'cls', 'tex-class')])
    const wrong = JSON.parse(remote.indexText)
    wrong.mirrorRevision = '2025-fedcba9876543210'
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(wrong)))
    const provider = new HttpTexResourceCatalogProvider({
      baseUrl: 'https://cdn.example/2025/',
      identity,
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(provider.load('tex-class')).resolves.toMatchObject({ status: 'mismatch' })
    await provider.load('tex-class')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
