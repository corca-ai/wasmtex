import { describe, expect, it } from 'vitest'
import { createLatexLanguageService, type LatexReferenceProblem } from '../../lsp-service'

function problem(
  service: ReturnType<typeof createLatexLanguageService>,
  path: string,
  key: string,
  occurrence = 0,
): LatexReferenceProblem {
  const text = service.getFile(path) as string
  let offset = -1
  for (let i = 0; i <= occurrence; i++) offset = text.indexOf(key, offset + 1)
  const result = service.getReferenceProblem(path, offset)
  expect(result.ok).toBe(true)
  if (!result.ok || !result.problem) throw new Error('Expected reference problem')
  return result.problem
}

function apply(
  text: string,
  edits: Array<{
    range: { startOffset: number; endOffset: number }
    expectedText: string
    newText: string
  }>,
) {
  for (const edit of [...edits].sort((a, b) => b.range.startOffset - a.range.startOffset)) {
    expect(text.slice(edit.range.startOffset, edit.range.endOffset)).toBe(edit.expectedText)
    text = text.slice(0, edit.range.startOffset) + edit.newText + text.slice(edit.range.endOffset)
  }
  return text
}

describe('source-backed reference repair', () => {
  it('reports exact root-scoped reference markers and navigable duplicate declarations', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\label{dup}\\input{child}\\ref{external}\\ref{missing}',
        'child.tex': '\\label{dup}',
        'inactive.tex': '\\label{external}',
      },
    })
    const diagnostics = service.getDiagnostics()
    const undefinedRefs = diagnostics.filter((value) => value.code === 'undefined-ref')
    expect(undefinedRefs.map((value) => value.message)).toEqual([
      "Undefined reference 'external'",
      "Undefined reference 'missing'",
    ])
    for (const diagnostic of undefinedRefs) {
      const text = service.getFile(diagnostic.file) as string
      expect(text.slice(diagnostic.column - 1, diagnostic.endColumn - 1)).toMatch(
        /^(external|missing)$/,
      )
    }
    const duplicates = diagnostics.filter((value) => value.code === 'duplicate-label')
    expect(duplicates).toHaveLength(2)
    expect(duplicates[0]?.relatedInformation?.[0]?.file).toBe('child.tex')
    expect(duplicates[1]?.relatedInformation?.[0]?.file).toBe('main.tex')
    service.setMainFile('inactive.tex')
    expect(
      service
        .getDiagnostics()
        .filter((value) => value.code === 'duplicate-label' || value.code === 'undefined-ref'),
    ).toEqual([])
  })

  it('bounds related marker locations while retaining every explicit repair conflict', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': '\\label{dup}\n'.repeat(100) },
    })
    const markers = service.getDiagnostics().filter((value) => value.code === 'duplicate-label')
    expect(markers).toHaveLength(100)
    for (const marker of markers) {
      expect(marker.message).toContain('100 declarations')
      expect(marker.relatedInformation).toHaveLength(32)
      expect(marker.relatedInformation?.some((value) => value.line === marker.line)).toBe(false)
    }
    const value = problem(service, 'main.tex', 'dup')
    if (value.kind !== 'duplicate-label') throw new Error('Wrong kind')
    expect(value.definitions).toHaveLength(100)
  })

  it('replaces only the exact chosen reference, with source context and no mutation', () => {
    const source = '\\section{Results}\\label{sec:results}\nSee \\ref{wrong} and \\ref{wrong}.'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', 'wrong', 1)
    expect(value.kind).toBe('undefined-reference')
    if (value.kind !== 'undefined-reference') return
    expect(value.candidates[0]?.context?.title).toBe('Results')
    const target = value.candidates[0]!.definition
    const result = service.planReferenceRepair({ kind: value.kind, anchor: value.anchor, target })
    expect(service.getFile('main.tex')).toBe(source)
    expect(result.ok).toBe(true)
    if (result.ok)
      expect(apply(source, result.edits)).toBe(
        source.replace('and \\ref{wrong}', 'and \\ref{sec:results}'),
      )
  })

  it('follows only the selected root, even when a second root includes it', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\input{shared}\\label{first}',
        'second.tex': '\\input{main}\\label{second}',
        'shared.tex': '\\ref{missing}',
      },
    })
    const first = problem(service, 'shared.tex', 'missing')
    if (first.kind !== 'undefined-reference') throw new Error('Wrong kind')
    expect(first.candidates.map((value) => value.definition.key)).toEqual(['first'])
    service.setMainFile('second.tex')
    const second = problem(service, 'shared.tex', 'missing')
    if (second.kind !== 'undefined-reference') throw new Error('Wrong kind')
    expect(second.candidates.map((value) => value.definition.key).sort()).toEqual([
      'first',
      'second',
    ])
  })

  it('renames one duplicate declaration and only explicitly chosen references across files', () => {
    const files = {
      'main.tex': '\\label{dup}\\input{other}\\ref{dup}',
      'other.tex': '\\label{dup}\\ref{dup}\\ref{dup}',
    }
    const service = createLatexLanguageService({ files })
    const value = problem(service, 'other.tex', 'dup')
    if (value.kind !== 'duplicate-label') throw new Error('Wrong kind')
    expect(value.definitions).toHaveLength(2)
    expect(value.references).toHaveLength(3)
    const chosen = value.references.filter((ref) => ref.file === 'main.tex')
    const result = service.planReferenceRepair({
      kind: value.kind,
      anchor: value.anchor,
      newKey: 'renamed',
      references: chosen,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      apply(
        files['main.tex'],
        result.edits.filter((edit) => edit.file === 'main.tex'),
      ),
    ).toBe('\\label{dup}\\input{other}\\ref{renamed}')
    expect(
      apply(
        files['other.tex'],
        result.edits.filter((edit) => edit.file === 'other.tex'),
      ),
    ).toBe('\\label{renamed}\\ref{dup}\\ref{dup}')
    expect(service.getFile('other.tex')).toBe(files['other.tex'])
  })

  it('never guesses which references follow a renamed duplicate', () => {
    const source = '\\label{dup}\\label{dup}\\ref{dup}'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', 'dup')
    if (value.kind !== 'duplicate-label') throw new Error('Wrong kind')
    const result = service.planReferenceRepair({
      kind: value.kind,
      anchor: value.anchor,
      newKey: 'new',
      references: [],
    })
    expect(result.ok && result.edits).toHaveLength(1)
  })

  it.each([
    '% \\ref{missing}\n',
    '\\verb|\\ref{missing}|',
    '\\begin{verbatim}\\ref{missing}\\end{verbatim}',
    '\\iffalse\\ref{missing}\\fi',
    '\\newcommand{\\example}{\\ref{missing}}',
    '\\ref{\\missing}',
    '\\ref{missing,other}',
    '\\ref{missing',
    '\\renewcommand{\\ref}[1]{#1}\\ref{missing}',
    '\\renewenvironment{ref}{}{}\\ref{missing}',
    '\\RenewDocumentEnvironment{ref}{}{}{}\\ref{missing}',
  ])('refuses unsupported or masked source %s', (source) => {
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    expect(service.getReferenceProblem('main.tex', source.indexOf('missing'))).toEqual({
      ok: true,
      problem: null,
    })
  })

  it('excludes ambiguous and dynamic candidates', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': '\\label{dup}\\label{dup}\\label{\\dynamic}\\label{valid}\\ref{missing}',
      },
    })
    const value = problem(service, 'main.tex', 'missing')
    if (value.kind !== 'undefined-reference') throw new Error('Wrong kind')
    expect(value.candidates.map((candidate) => candidate.definition.key)).toEqual(['valid'])
  })

  it('excludes environment-shadowed labels from repair targets', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': '\\renewenvironment{label}{}{}\\label{known}\\ref{missing}' },
    })
    const value = problem(service, 'main.tex', 'missing')
    if (value.kind !== 'undefined-reference') throw new Error('Wrong kind')
    expect(value.candidates).toEqual([])
  })

  it('distinguishes uncalled templates from actual shallow expansion locations', () => {
    const source = '\\newcommand{\\unused}{\\label{phantom}}\\label{real}\\ref{phantom}'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', 'phantom', 1)
    if (value.kind !== 'undefined-reference') throw new Error('Wrong kind')
    expect(value.candidates.map((candidate) => candidate.definition.key)).toEqual(['real'])
    expect(service.getDiagnostics().some((value) => value.code === 'undefined-ref')).toBe(true)
    service.updateFile('main.tex', `${source}\\unused`)
    expect(service.getReferenceProblem('main.tex', source.lastIndexOf('phantom'))).toEqual({
      ok: true,
      problem: null,
    })
    expect(service.getDiagnostics().some((value) => value.code === 'undefined-ref')).toBe(false)
  })

  it('refuses stale anchors and removed or moved destinations', () => {
    const source = '\\label{known}\\ref{missing}'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', 'missing')
    if (value.kind !== 'undefined-reference') throw new Error('Wrong kind')
    const request = {
      kind: value.kind,
      anchor: value.anchor,
      target: value.candidates[0]!.definition,
    }
    service.updateFile('main.tex', source.replace('known', 'other'))
    expect(service.planReferenceRepair(request)).toEqual({ ok: false, reason: 'stale' })
    service.updateFile('main.tex', source.replace('missing', 'changed'))
    expect(service.planReferenceRepair(request)).toEqual({ ok: false, reason: 'stale' })
  })

  it('refuses duplicate reference selections, colliding keys and forged ranges', () => {
    const source = '\\label{dup}\\label{dup}\\label{used}\\ref{dup}'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', 'dup')
    if (value.kind !== 'duplicate-label') throw new Error('Wrong kind')
    const request = {
      kind: value.kind,
      anchor: value.anchor,
      newKey: 'fresh',
      references: value.references,
    }
    expect(service.planReferenceRepair({ ...request, newKey: 'used' })).toEqual({
      ok: false,
      reason: 'invalid-key',
    })
    expect(service.planReferenceRepair({ ...request, newKey: 'x}\\input{evil}' })).toEqual({
      ok: false,
      reason: 'invalid-key',
    })
    expect(
      service.planReferenceRepair({
        ...request,
        references: [...value.references, ...value.references],
      }),
    ).toEqual({ ok: false, reason: 'stale' })
    expect(
      service.planReferenceRepair({
        ...request,
        references: [{ ...value.references[0]!, column: 1 }],
      }),
    ).toEqual({ ok: false, reason: 'stale' })
  })

  it('preserves CRLF and Unicode source outside exact key ranges', () => {
    const source = '\\label{절:결과}\r\n문장 😀 \\ref{ 잘못 }'
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const value = problem(service, 'main.tex', '잘못')
    if (value.kind !== 'undefined-reference') throw new Error('Wrong kind')
    const result = service.planReferenceRepair({
      kind: value.kind,
      anchor: value.anchor,
      target: value.candidates[0]!.definition,
    })
    expect(result.ok && apply(source, result.edits)).toBe(source.replace('잘못', '절:결과'))
  })

  it('rejects cancellation and invalid positions without mutation', () => {
    const service = createLatexLanguageService({ files: { 'main.tex': '\\ref{missing}' } })
    expect(service.getReferenceProblem('main.tex', 5, { isCancellationRequested: true })).toEqual({
      ok: false,
      reason: 'cancelled',
    })
    expect(service.getReferenceProblem('main.tex', -1)).toEqual({ ok: true, problem: null })
    expect(service.getReferenceProblem('main.tex', 100)).toEqual({ ok: true, problem: null })
  })
})
