import { describe, expect, it } from 'vitest'
import { InMemoryTexResourceCatalogProvider } from '../lsp/resource-catalog'
import { LatexLanguageService } from '../lsp-service'
import {
  boundCompletionSnapshot,
  COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  CompletionFileDigestCache,
  completionFileDigest,
  completionProjectRevision,
  createCompletionSnapshot,
  parseEngineCompletionObservation,
} from './completion-snapshot'

const profile = { id: 'test-profile', texliveYear: '2025' as const, mirrorRevision: 'rev-1' }

describe('runtime completion snapshots', () => {
  it('binds a deterministic revision to paths, content kinds, and bytes', async () => {
    const files = [
      { path: 'main.tex', content: '\\documentclass{book}' },
      { path: 'logo.bin', content: Uint8Array.of(0, 1, 2) },
    ]
    const forward = await completionProjectRevision(files)
    const reverse = await completionProjectRevision([...files].reverse())
    expect(forward).toBe(reverse)
    expect(
      await completionProjectRevision([
        files[0]!,
        { path: 'logo.bin', content: Uint8Array.of(0, 1, 3) },
      ]),
    ).not.toBe(forward)
  })

  it('reuses digests by immutable VFS entry identity', async () => {
    const cache = new CompletionFileDigestCache<object>()
    const entry = {}
    const content = Uint8Array.of(1, 2, 3)
    const first = await cache.digest(entry, content)

    content[2] = 4
    expect(await cache.digest(entry, content)).toBe(first)
    expect(await cache.digest({}, content)).not.toBe(first)
  })

  it('accepts a cached digest without changing the revision contract', async () => {
    const content = Uint8Array.of(4, 5, 6)
    const uncached = await completionProjectRevision([{ path: 'asset.bin', content }])
    const cached = await completionProjectRevision([
      { path: 'asset.bin', content, digest: await completionFileDigest(content) },
    ])
    expect(cached).toBe(uncached)
  })

  it('uses one contract across engines and marks unavailable fields explicitly', async () => {
    for (const engine of ['pdflatex', 'xelatex', 'lualatex'] as const) {
      const snapshot = await createCompletionSnapshot({
        engine,
        root: 'main.tex',
        profile,
        projectFiles: [{ path: 'main.tex', content: 'Hello' }],
        inputFiles: ['/work/main.tex'],
        inputFilesComplete: true,
        ...(engine === 'pdflatex'
          ? {
              engineCommands: ['runtimecmd\t111\t1'],
              engineObservation: {
                counters: ['runtimecounter'],
                colors: ['runtimecolor'],
                keyFamilies: [{ name: 'layout', keys: ['runtimekey'] }],
                complete: true,
              },
            }
          : {}),
      })
      expect(snapshot).toMatchObject({
        version: 1,
        identity: { engine, root: 'main.tex', profile },
        fields: { loadedResources: { status: 'observed', complete: true } },
      })
      expect(snapshot.fields.commands.status).toBe(
        engine === 'pdflatex' ? 'observed' : 'unsupported',
      )
      expect(snapshot.fields.colors.status).toBe(engine === 'pdflatex' ? 'observed' : 'unsupported')
      expect(snapshot.fields.lengths.status).toBe('unsupported')
    }
  })

  it('merges robust-command wrappers into one public command signature', async () => {
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: 'Hello' }],
      engineCommands: [
        'robustcmd\t111\t0',
        'robustcmd \t111\t2',
        'csname\t1\t-1',
        'endcsname\t1\t-1',
      ],
      engineCommandsComplete: true,
    })
    expect(snapshot.fields.commands).toMatchObject({
      complete: true,
    })
    expect(snapshot.fields.commands.values.find((command) => command.name === 'robustcmd')).toEqual(
      expect.objectContaining({ name: 'robustcmd', argCount: 2 }),
    )
    expect(snapshot.fields.environments.values).toEqual([])
  })

  it('normalizes valid boundary records and accounts for every malformed record', async () => {
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: 'Hello' }],
      engineCommands: [
        42,
        `${'x'.repeat(200)}\t111\t0`,
        'extra\t111\t0\tfield',
        'internal@name\t111\t0',
        ' \t111\t0',
        'plain',
        'unknown-numbers\tnot-a-number\tnot-a-number',
        'clamped-high\t111\t99',
        'clamped-low\t111\t-99',
        'robust-kept\t111\t2',
        'robust-kept \t111\t3',
      ] as unknown as string[],
      engineCommandsComplete: true,
      engineObservation: {
        counters: [42, '', 'kept', 'kept', 'bad\u0000name'] as unknown as string[],
        colors: [],
        keyFamilies: [],
        complete: true,
      },
      inputFiles: [
        42,
        'C:\\tex\\kept.sty',
        'C:\\tex\\kept.sty',
        'bad\u0000path',
      ] as unknown as string[],
      inputFilesComplete: true,
    })

    expect(snapshot.fields.commands).toMatchObject({ complete: false, truncated: true, dropped: 5 })
    expect(snapshot.fields.commands.values).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'plain', eqType: -1, argCount: -1 }),
        expect.objectContaining({ name: 'unknown-numbers', eqType: -1, argCount: -1 }),
        expect.objectContaining({ name: 'clamped-high', argCount: 9 }),
        expect.objectContaining({ name: 'clamped-low', argCount: -1 }),
        expect.objectContaining({ name: 'robust-kept', argCount: 2 }),
      ]),
    )
    expect(snapshot.fields.counters).toMatchObject({
      complete: false,
      truncated: true,
      dropped: 3,
      values: [{ name: 'kept', evidence: 'engine-hash-table' }],
    })
    expect(snapshot.fields.loadedResources).toMatchObject({
      complete: false,
      truncated: true,
      dropped: 2,
      values: [{ path: 'C:/tex/kept.sty', evidence: 'recorder' }],
    })
  })

  it('parses bounded pdfTeX registry observations', () => {
    expect(
      parseEngineCompletionObservation([
        'counter\ttheorem',
        'color\tbrand',
        'key\tlayout\tmode',
        'key\tlayout\tdraft',
        'meta\tcounter\t0',
        'meta\tcolor\t0',
        'meta\tkey\t0',
      ]),
    ).toEqual({
      counters: ['theorem'],
      colors: ['brand'],
      keyFamilies: [{ name: 'layout', keys: ['mode', 'draft'] }],
      complete: true,
      fieldCompleteness: { counters: true, colors: true, keyFamilies: true },
      dropped: { counters: 0, colors: 0, keyFamilies: 0 },
    })
  })

  it('reports engine-side truncation per observation field', async () => {
    const observation = parseEngineCompletionObservation([
      'counter\tkept',
      'color\tbrand',
      'meta\tcounter\t3',
      'meta\tcolor\t0',
      'meta\tkey\t0',
    ])
    expect(observation).toMatchObject({
      complete: false,
      fieldCompleteness: { counters: false, colors: true, keyFamilies: true },
      dropped: { counters: 3, colors: 0, keyFamilies: 0 },
    })

    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: 'Hello' }],
      engineObservation: observation,
    })
    expect(snapshot.fields.counters).toMatchObject({
      complete: false,
      truncated: true,
      dropped: 3,
    })
    expect(snapshot.fields.colors).toMatchObject({ complete: true })
  })

  it('marks records rejected by host validation as truncated evidence', () => {
    const observation = parseEngineCompletionObservation([
      `color\t${'x'.repeat(129)}`,
      'meta\tcounter\t0',
      'meta\tcolor\t0',
      'meta\tkey\t0',
    ])
    expect(observation).toMatchObject({
      complete: false,
      fieldCompleteness: { counters: true, colors: false, keyFamilies: true },
      dropped: { counters: 0, colors: 1, keyFamilies: 0 },
    })
    expect(observation.colors).toEqual([])
  })

  it('does not claim completeness when the worker protocol contains an unknown record', () => {
    const observation = parseEngineCompletionObservation([
      { forged: 'color' },
      'meta\tcounter\t0',
      'meta\tcolor\t0',
      'meta\tkey\t0',
    ])

    expect(observation.complete).toBe(false)
    expect(observation.fieldCompleteness).toEqual({
      counters: false,
      colors: false,
      keyFamilies: false,
    })
  })

  it('never reports per-field completeness after the host observation ceiling is exceeded', () => {
    const observation = parseEngineCompletionObservation([
      'meta\tcounter\t0',
      'meta\tcolor\t0',
      'meta\tkey\t0',
      ...Array.from({ length: 16_382 }, () => 'color\tkept'),
    ])

    expect(observation.complete).toBe(false)
    expect(observation.fieldCompleteness).toEqual({
      counters: false,
      colors: false,
      keyFamilies: false,
    })
  })

  it('enforces record and serialized-size budgets on pathological observations', async () => {
    const commands = Array.from({ length: 20_000 }, (_, index) => `command${index}\t111\t9`)
    const values = Array.from({ length: 10_000 }, (_, index) => `value${index}`)
    const projectFiles = [
      { path: 'main.tex', content: 'Hello' },
      ...Array.from({ length: 599 }, (_, index) => ({
        path: `chapters/chapter-${index}.tex`,
        content: `Chapter ${index}`,
      })),
    ]
    const started = performance.now()
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles,
      engineCommands: commands,
      engineObservation: {
        counters: values,
        colors: values,
        keyFamilies: values.map((name) => ({ name, keys: values.slice(0, 4) })),
        complete: true,
      },
      inputFiles: values.map((name) => `/tex/${name}.sty`),
      inputFilesComplete: true,
    })
    expect(snapshot.estimatedBytes).toBeLessThanOrEqual(COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES)
    expect(JSON.stringify(snapshot).length * 2).toBeLessThanOrEqual(
      COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
    )
    expect(snapshot.fields.commands.truncated).toBe(true)
    expect(snapshot.fields.counters.truncated).toBe(true)
    expect(snapshot.fields.keyFamilies.truncated).toBe(true)
    expect(snapshot.fields.loadedResources.truncated).toBe(true)
    expect(performance.now() - started).toBeLessThan(3000)
  })

  it('validates and bounds snapshots received across a host boundary before retaining them', async () => {
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: 'Hello' }],
    })
    const hostile = structuredClone(snapshot)
    hostile.fields.commands = {
      status: 'observed',
      complete: true,
      values: Array.from({ length: 20_000 }, (_, index) => ({
        name: `command${index}`,
        eqType: 111,
        argCount: 0,
        evidence: 'engine-hash-table' as const,
      })),
    }

    const bounded = boundCompletionSnapshot(hostile)

    expect(bounded.fields.commands.values).toHaveLength(8192)
    expect(bounded.fields.commands).toMatchObject({ complete: false, truncated: true })
    expect(bounded.estimatedBytes).toBeLessThanOrEqual(COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES)

    const malformed = structuredClone(snapshot)
    malformed.fields.colors = {
      status: 'unsupported',
      complete: false,
      values: [{ name: 'smuggled', evidence: 'engine-hash-table' }],
    }
    expect(() => boundCompletionSnapshot(malformed)).toThrow(/unsupported.*colors.*values/)

    const oversizedIdentity = structuredClone(snapshot)
    oversizedIdentity.identity.root = 'x'.repeat(1_000_000)
    expect(() => boundCompletionSnapshot(oversizedIdentity)).toThrow(/invalid root path/)
  })

  it('keeps mismatched and concurrently superseded project revisions stale', async () => {
    const original = '\\runt'
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: original }],
      engineCommands: ['runtimecmd\t111\t0'],
    })

    const mismatched = new LatexLanguageService({
      files: { 'main.tex': `${original}\n% already changed` },
      lint: false,
    })
    expect((await mismatched.updateCompletionSnapshot(snapshot)).status).toBe('stale')
    expect(mismatched.getCompletions('main.tex', 1, 6).map((item) => item.label)).not.toContain(
      '\\runtimecmd',
    )

    const raced = new LatexLanguageService({ files: { 'main.tex': original }, lint: false })
    const pending = raced.updateCompletionSnapshot(snapshot)
    raced.updateFile('main.tex', `${original}\n% changed during revision hashing`)
    expect((await pending).status).toBe('stale')
  })

  it('requires the compiled root to match the language service root', async () => {
    const files = { 'main.tex': 'Main', 'other.tex': 'Other' }
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'other.tex',
      profile,
      projectFiles: Object.entries(files).map(([path, content]) => ({ path, content })),
      engineCommands: ['otherrootcmd\t111\t0'],
    })
    const service = new LatexLanguageService({ files, lint: false })

    expect((await service.updateCompletionSnapshot(snapshot)).status).toBe('stale')
    service.setMainFile('other.tex')
    expect((await service.updateCompletionSnapshot(snapshot)).status).toBe('fresh')
    service.setMainFile('main.tex')
    expect(service.getCompletionSnapshotState().status).toBe('stale')
  })

  it('explicitly clears engine observations before a replacement engine compiles', async () => {
    const source = '\\runt'
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: source }],
      engineCommands: ['runtimecmd\t111\t0'],
    })
    const service = new LatexLanguageService({ files: { 'main.tex': source }, lint: false })

    await service.updateCompletionSnapshot(snapshot)
    expect(service.getCompletions('main.tex', 1, 6).map((item) => item.label)).toContain(
      '\\runtimecmd',
    )

    service.clearCompletionSnapshot()

    expect(service.getCompletionSnapshotState()).toEqual({ status: 'absent' })
    expect(service.getCompletions('main.tex', 1, 6).map((item) => item.label)).not.toContain(
      '\\runtimecmd',
    )
  })

  it('does not let an older asynchronous validation replace a newer matching snapshot', async () => {
    const firstSource = '\\first'
    const secondSource = '\\second'
    const [first, second] = await Promise.all(
      [
        { source: firstSource, command: 'firstcmd' },
        { source: secondSource, command: 'secondcmd' },
      ].map(({ source, command }) =>
        createCompletionSnapshot({
          engine: 'pdflatex',
          root: 'main.tex',
          profile,
          projectFiles: [{ path: 'main.tex', content: source }],
          engineCommands: [`${command}\t111\t0`],
          engineCommandsComplete: true,
        }),
      ),
    )
    const service = new LatexLanguageService({ files: { 'main.tex': firstSource }, lint: false })
    const older = service.updateCompletionSnapshot(first!)
    service.updateFile('main.tex', secondSource)
    const newer = service.updateCompletionSnapshot(second!)

    await Promise.all([older, newer])

    const state = service.getCompletionSnapshotState()
    expect(state.status).toBe('fresh')
    expect(state.status === 'fresh' ? state.snapshot.identity.projectRevision : null).toBe(
      second!.identity.projectRevision,
    )
  })

  it('rejects runtime evidence from a different exact catalog profile', async () => {
    const source = '\\runt'
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: source }],
      engineCommands: ['runtimecmd\t111\t0'],
    })
    const resourceCatalog = new InMemoryTexResourceCatalogProvider(
      { schemaVersion: 1, texliveYear: '2025', mirrorRevision: '2025-0123456789abcdef' },
      [],
    )
    const service = new LatexLanguageService({
      files: { 'main.tex': source },
      resourceCatalog,
      lint: false,
    })

    await expect(service.updateCompletionSnapshot(snapshot)).rejects.toThrow(/catalog profile/)
    expect(service.getCompletionSnapshotState()).toEqual({ status: 'absent' })
  })

  it('rejects a different integrator-selected profile id even on the same mirror', async () => {
    const source = '\\runt'
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: source }],
    })
    const service = new LatexLanguageService({
      files: { 'main.tex': source },
      completionProfile: { ...profile, id: 'different-profile' },
      lint: false,
    })

    await expect(service.updateCompletionSnapshot(snapshot)).rejects.toThrow(/selected.*profile/)
    expect(service.getCompletionSnapshotState()).toEqual({ status: 'absent' })
  })

  it('atomically consumes fresh evidence, keeps project declarations authoritative, and stales on edit', async () => {
    const source = [
      '\\usepackage{xcolor}',
      '\\definechoicekey{layout}{mode}{project,other}{}',
      '\\definecolor{brand}{HTML}{00ff00}',
      '\\setcounter{runtime}',
      '\\setkeys{layout}{mode=pro}',
      '\\setkeys{layout}{runtime}',
      '\\color{bra}',
      '\\runt',
      '\\begin{runtimeb}',
    ].join('\n')
    const snapshot = await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: [{ path: 'main.tex', content: source }],
      engineCommands: ['runtimecmd\t111\t1', 'runtimebox\t111\t0', 'endruntimebox\t111\t0'],
      engineObservation: {
        counters: ['runtimecounter'],
        colors: ['brand'],
        keyFamilies: [{ name: 'layout', keys: ['mode', 'runtimekey'] }],
        complete: true,
      },
    })
    const service = new LatexLanguageService({ files: { 'main.tex': source }, lint: false })
    await service.updateCompletionSnapshot(snapshot)
    const lines = source.split('\n')
    const beforeClosingBrace = (line: number) => lines[line - 1]!.length
    const atLineEnd = (line: number) => lines[line - 1]!.length + 1

    expect(service.getCompletionSnapshotState().status).toBe('fresh')
    expect(
      service.getCompletions('main.tex', 4, beforeClosingBrace(4)).map((item) => item.label),
    ).toContain('runtimecounter')
    expect(
      service.getCompletions('main.tex', 5, beforeClosingBrace(5)).map((item) => item.label),
    ).toContain('project')
    expect(
      service.getCompletions('main.tex', 6, beforeClosingBrace(6)).map((item) => item.label),
    ).toContain('runtimekey')
    const brand = service
      .getCompletions('main.tex', 7, beforeClosingBrace(7))
      .find((item) => item.label === 'brand')
    expect(brand?.data).toMatchObject({ wasmtex: { color: { css: '#00ff00' } } })
    expect(service.getCompletions('main.tex', 8, atLineEnd(8)).map((item) => item.label)).toContain(
      '\\runtimecmd',
    )
    expect(
      service.getCompletions('main.tex', 9, beforeClosingBrace(9)).map((item) => item.label),
    ).toContain('runtimebox')

    service.updateFile('main.tex', `${source}\n% changed`)
    expect(service.getCompletionSnapshotState().status).toBe('stale')
    expect(
      service.getCompletions('main.tex', 8, atLineEnd(8)).map((item) => item.label),
    ).not.toContain('\\runtimecmd')
  })
})
