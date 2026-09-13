import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'

async function proposal(
  service: ReturnType<typeof createLatexLanguageService>,
  path = 'main.tex',
  name = 'frac',
) {
  const text = service.getFile(path) as string
  const result = await service.getDiagnosticRepairs(path, text.lastIndexOf(`\\${name}`) + 1)
  if (!result.ok || !result.proposals[0])
    throw new Error(`Expected repair: ${JSON.stringify(result)}`)
  return result.proposals[0]
}

describe('reviewed required argument repair', () => {
  it('adds only empty slots at the missing argument boundary without mutating source', async () => {
    const text = String.raw`\frac{a}% preserve comment
`
    const service = createLatexLanguageService({ files: { 'main.tex': text } })
    const value = await proposal(service)
    expect(value.diagnostic).toMatchObject({
      code: 'missing-required-argument',
      column: 1,
      endColumn: 6,
    })
    expect(value.edits).toEqual([
      {
        file: 'main.tex',
        range: { startOffset: 8, endOffset: 8 },
        expectedText: '',
        newText: '{}',
      },
    ])
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: true, edits: value.edits })
    expect(service.getFile('main.tex')).toBe(text)
  })

  it('uses only selected-root declarations and repairs included sources', async () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': String.raw`\input{child}`,
        'child.tex': String.raw`{\frac}`,
        'other.tex': String.raw`\renewcommand{\frac}[1]{#1}\input{main}`,
      },
    })
    const value = await proposal(service, 'child.tex')
    expect(value.edits[0]?.newText).toBe('{}{}')
    expect(await service.getDiagnosticRepairs('other.tex', 0)).toEqual({ ok: true, proposals: [] })
    service.setMainFile('other.tex')
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
    expect(await service.getDiagnosticRepairs('child.tex', 1)).toEqual({ ok: true, proposals: [] })
  })

  it('uses confirmed project arity while keeping replacement arguments opaque', async () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': String.raw`\newcommand{\mine}[2]{#1#2}\mine{a}`,
      },
    })
    expect((await proposal(service, 'main.tex', 'mine')).edits[0]?.newText).toBe('{}')
    service.updateFile('main.tex', String.raw`\newcommand{\mine}[1]{\label{#1}}\mine{\frac}`)
    expect(
      await service.getDiagnosticRepairs(
        'main.tex',
        (service.getFile('main.tex') as string).lastIndexOf('frac'),
      ),
    ).toEqual({ ok: true, proposals: [] })
  })

  it('does not claim a missing argument at included EOF where the parent continues', async () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': String.raw`\input{child}{b}`,
        'child.tex': String.raw`\frac{a}`,
      },
    })
    expect(await service.getDiagnosticRepairs('child.tex', 1)).toEqual({ ok: true, proposals: [] })
  })

  it('revalidates mutable grammar after the asynchronous package path', async () => {
    const service = createLatexLanguageService({ files: { 'main.tex': String.raw`\frac` } })
    const value = await proposal(service)
    const pending = service.planDiagnosticRepair(value)
    service.getCompletionRegistry().registerCommand('frac', [])
    expect(await pending).toEqual({ ok: false, reason: 'stale' })
    service.getCompletionRegistry().registerCommand('frac', [{ kind: 'required' }])
    const query = service.getDiagnosticRepairs('main.tex', 1)
    service.getCompletionRegistry().registerCommand('frac', [])
    expect(await query).toEqual({ ok: true, proposals: [] })
  })

  it('rejects source edits, edit-and-revert, root/profile changes, and modified proposals', async () => {
    const service = createLatexLanguageService({ files: { 'main.tex': String.raw`\frac` } })
    let value = await proposal(service)
    const tampered = structuredClone(value)
    tampered.edits[0]!.newText = '{invented}{content}'
    expect(await service.planDiagnosticRepair(tampered)).toEqual({ ok: false, reason: 'stale' })
    service.updateFile('main.tex', String.raw`\frac{x}`)
    service.updateFile('main.tex', String.raw`\frac`)
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
    value = await proposal(service)
    service.configureCompletion({})
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
  })

  it('revalidates registry semantics and cancellation before planning', async () => {
    const service = createLatexLanguageService({ files: { 'main.tex': String.raw`\frac` } })
    const value = await proposal(service)
    expect(await service.planDiagnosticRepair(value, { isCancellationRequested: true })).toEqual({
      ok: false,
      reason: 'cancelled',
    })
    expect(
      await service.getDiagnosticRepairs('main.tex', 1, { isCancellationRequested: true }),
    ).toEqual({ ok: false, reason: 'cancelled' })
    service.getCompletionRegistry().registerCommand('frac', [])
    expect(await service.planDiagnosticRepair(value)).toEqual({ ok: false, reason: 'stale' })
  })
})
