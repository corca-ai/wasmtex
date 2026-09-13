import { describe, expect, it } from 'vitest'
import { createCompletionSnapshot } from '../../engine/completion-snapshot'
import {
  createLatexLanguageService,
  InMemoryTexResourceCatalogProvider,
  type TexResourceCatalogProvider,
  type TexResourceCatalogState,
  type TexResourceRecord,
} from '../../lsp-service'

const profile = {
  id: 'repair',
  texliveYear: '2025' as const,
  mirrorRevision: '2025-1111111111111111',
}
const identity = {
  schemaVersion: 1 as const,
  texliveYear: '2025',
  mirrorRevision: '2025-1111111111111111',
}
const resource: TexResourceRecord = {
  name: 'graphicx',
  fileName: 'graphicx.sty',
  extension: 'sty',
  key: '26/graphicx.sty',
  format: 26,
  bytes: 100,
  sha256: 'a'.repeat(64),
  texliveYear: '2025',
  mirrorRevision: '2025-1111111111111111',
  sourcePath: 'tex/latex/graphics/graphicx.sty',
  texlivePackage: 'graphics',
  packageRevision: '1',
  catalogue: null,
}
const main = '\\documentclass{article}\n\\begin{document}\n\\input{child}\n\\end{document}\n'
const child = '\\includegraphics{plot.pdf}'
const log =
  '(./main.tex\n(./child.tex\n! Undefined control sequence.\nl.1 \\includegraphics\n                 {plot.pdf}\n)\n)'

function catalog(records = [resource]) {
  return new InMemoryTexResourceCatalogProvider(identity, [
    { ...identity, kind: 'tex-package', resources: records },
  ])
}

async function setup(
  options: {
    files?: Record<string, string>
    loaded?: string[]
    complete?: boolean
    provider?: TexResourceCatalogProvider
  } = {},
) {
  const files = options.files ?? { 'main.tex': main, 'child.tex': child }
  const service = createLatexLanguageService({
    files,
    completionProfile: profile,
    completionEngine: 'pdflatex',
    resourceCatalog: options.provider ?? catalog(),
  })
  const snapshot = await createCompletionSnapshot({
    engine: 'pdflatex',
    root: 'main.tex',
    profile,
    projectFiles: Object.entries(files).map(([path, content]) => ({ path, content })),
    inputFiles: options.loaded ?? ['main.tex', 'child.tex', '/tex/article.cls'],
    inputFilesComplete: options.complete ?? true,
  })
  await service.updateDiagnosticCompileContext({ snapshot, log })
  return service
}

async function packages(service: Awaited<ReturnType<typeof setup>>) {
  const result = await service.getDiagnosticRepairs('child.tex', 2)
  if (!result.ok) throw new Error(result.reason)
  return result.proposals.filter((value) => value.kind === 'missing-package')
}

describe('reviewed package dependency repair', () => {
  it('plans a root preamble edit for an included source with exact resource evidence', async () => {
    const service = await setup()
    const values = await packages(service)
    expect(values).toHaveLength(1)
    const value = values[0]!
    expect(value.diagnostic).toMatchObject({ file: 'child.tex', line: 1, column: 1, endColumn: 17 })
    expect(value.evidence.resource).toEqual(resource)
    expect(value.edits).toEqual([
      {
        file: 'main.tex',
        range: { startOffset: 24, endOffset: 24 },
        expectedText: '',
        newText: '\\usepackage{graphicx}\n',
      },
    ])
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: true, edits: value.edits })
    expect(service.getFile('main.tex')).toBe(main)
    expect(service.getFile('child.tex')).toBe(child)
    value.edits[0]!.newText = '\\usepackage{other}\n'
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
  })

  it('rejects packages already loaded through a class or package dependency', async () => {
    expect(
      await packages(
        await setup({ loaded: ['main.tex', 'child.tex', '/tex/custom.cls', '/tex/graphicx.sty'] }),
      ),
    ).toEqual([])
    expect(await packages(await setup({ complete: false }))).toEqual([])
  })

  it('rejects explicit package loads, project redefinitions and local package shadowing', async () => {
    for (const files of [
      { 'main.tex': `\\usepackage{graphicx}\n${main}`, 'child.tex': child },
      { 'main.tex': `\\let\\includegraphics\\relax\n${main}`, 'child.tex': child },
      { 'main.tex': `\\renewcommand{\\usepackage}[1]{}\n${main}`, 'child.tex': child },
      { 'main.tex': `\\let\\RequirePackage\\relax\n${main}`, 'child.tex': child },
      { 'main.tex': `\\renewenvironment{usepackage}[1]{}{}\n${main}`, 'child.tex': child },
      { 'main.tex': main, 'child.tex': child, 'graphicx.sty': '% local' },
    ])
      expect(await packages(await setup({ files }))).toEqual([])
  })

  it('requires an available package under the exact profile and engine', async () => {
    expect(await packages(await setup({ provider: catalog([]) }))).toEqual([])
    expect(
      await packages(await setup({ provider: catalog([{ ...resource, engines: ['xetex'] }]) })),
    ).toEqual([])
    const wrong = new InMemoryTexResourceCatalogProvider(
      { ...identity, mirrorRevision: '2025-2222222222222222' },
      [],
    )
    expect(await packages(await setup({ provider: wrong }))).toEqual([])
  })

  it('refuses ambiguous or nested document boundaries and preserves root newline style', async () => {
    for (const root of [
      `${main}\\begin{document}`,
      main.replace('\\begin{document}', '{\\begin{document}}'),
      main.replace('\\documentclass{article}', ''),
    ])
      expect(
        await packages(await setup({ files: { 'main.tex': root, 'child.tex': child } })),
      ).toEqual([])
    const values = await packages(
      await setup({ files: { 'main.tex': main.replaceAll('\n', '\r\n'), 'child.tex': child } }),
    )
    expect(values[0]?.edits[0]?.newText).toBe('\\usepackage{graphicx}\r\n')
  })

  it('rejects proposals after source changes or compile evidence is cleared', async () => {
    const service = await setup()
    const value = (await packages(service))[0]!
    service.clearDiagnosticCompileContext()
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
    expect(await packages(service)).toEqual([])
  })

  it('inserts before preamble input, preserving the complete class release argument', async () => {
    const root =
      '\\documentclass[11pt]{article}[2024/01/01]\n\\input{child}\n\\begin{document}Text\\end{document}'
    const values = await packages(await setup({ files: { 'main.tex': root, 'child.tex': child } }))
    expect(values[0]?.edits[0]?.range.startOffset).toBe(root.indexOf('\\input'))
    expect(values[0]?.edits[0]?.newText).toBe('\\usepackage{graphicx}\n')
  })

  it('preserves package option order and permits ordinary blank lines after the class', async () => {
    const root = main.replace(
      '\\begin{document}',
      '\n\\PassOptionsToPackage{demo}{graphicx}\n\\begin{document}',
    )
    const values = await packages(await setup({ files: { 'main.tex': root, 'child.tex': child } }))
    expect(values[0]?.edits[0]?.range.startOffset).toBe(root.indexOf('\\begin{document}'))
    expect(
      await packages(
        await setup({ files: { 'main.tex': main.replace('\n', '\n\n'), 'child.tex': child } }),
      ),
    ).toHaveLength(1)
  })

  it('does not place a package load inside an unresolved conditional or explicit group', async () => {
    for (const options of [
      '\\ifdefined\\unavailable\\PassOptionsToPackage{demo}{graphicx}\\fi',
      '\\begingroup\\PassOptionsToPackage{demo}{graphicx}\\endgroup',
    ]) {
      const root = main.replace('\\begin{document}', `${options}\n\\begin{document}`)
      expect(
        await packages(await setup({ files: { 'main.tex': root, 'child.tex': child } })),
      ).toEqual([])
    }
  })

  it('distinguishes declared condition names and argument-taking conditional macros', async () => {
    for (const preamble of [
      '\\newif\\ifdraft',
      '\\ifthenelse{true}{}{}',
      '\\newif\\ifdraft\\ifdefined\\ifdraft\\fi',
    ]) {
      const root = main.replace('\\begin{document}', `${preamble}\n\\begin{document}`)
      expect(
        await packages(await setup({ files: { 'main.tex': root, 'child.tex': child } })),
      ).toHaveLength(1)
    }
  })

  it('rejects a source change while a cold package catalog is loading', async () => {
    let resolve!: (value: TexResourceCatalogState) => void
    const pending = new Promise<TexResourceCatalogState>((done) => {
      resolve = done
    })
    const provider: TexResourceCatalogProvider = {
      identity,
      getState: () => ({ status: 'idle' }),
      load: () => pending,
    }
    const service = await setup({ provider })
    const result = service.getDiagnosticRepairs('child.tex', 2)
    service.updateFile('child.tex', `${child} changed`)
    resolve({ status: 'ready', shard: { ...identity, kind: 'tex-package', resources: [resource] } })
    expect(await result).toEqual({ ok: false, reason: 'stale' })
  })
})
