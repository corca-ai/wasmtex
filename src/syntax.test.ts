import { describe, expect, it } from 'vitest'
import { createLatexSyntaxService, LatexSyntaxService } from './syntax'

describe('LatexSyntaxService', () => {
  it('returns UTF-16 math ranges and ignores fenced Markdown', () => {
    const content = '한글 😀 $x_i$\n```tex\n$ignored$\n```\n\\[y\\]'
    const service = new LatexSyntaxService()
    const syntax = service.upsert({
      fileId: 'stable',
      path: 'main.md',
      content,
      documentVersion: 7,
      language: 'markdown',
    })

    expect(syntax.mathRegions).toHaveLength(2)
    expect(
      content.slice(
        syntax.mathRegions[0]!.contentRange.startOffset,
        syntax.mathRegions[0]!.contentRange.endOffset,
      ),
    ).toBe('x_i')
    expect(syntax.mathRegions[1]!.delimiter).toBe('\\[')
    expect(service.getProjectIndex().hasFile('main.md')).toBe(false)
    expect(service.getStats()).toEqual({ documents: 1, parseCount: 1 })
  })

  it('preserves stable identity, mutable paths, and macro provenance', () => {
    const content = '\\newcommand{\\vect}[1]{#1} $\\vect{x}$'
    const service = new LatexSyntaxService()
    const syntax = service.upsert({
      fileId: 'f1',
      path: 'old.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.definitions).toHaveLength(1)
    const invocationStart = content.indexOf('\\vect{x}')
    expect(call?.expansion).toEqual({
      status: 'expanded',
      depth: 0,
      editable: false,
      surface: 'x',
      inputRange: { startOffset: invocationStart, endOffset: invocationStart + '\\vect{x}'.length },
    })

    service.move('f1', 'new.tex')
    expect(service.getFile('f1')?.path).toBe('new.tex')
    expect(service.getProjectIndex().hasFile('old.tex')).toBe(false)
    expect(service.getProjectIndex().hasFile('new.tex')).toBe(true)
  })

  it('returns the expanded surface and full invocation range for nested math macros', () => {
    const content = [
      '\\newcommand{\\bold}[1]{\\mathbf{#1}}',
      '\\newcommand{\\vect}[1]{\\bold{#1}}',
      '$\\vect{x+y}$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const call = syntax.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.expansion.surface).toBe('\\mathbf{x+y}')
    expect(
      content.slice(call?.expansion.inputRange?.startOffset, call?.expansion.inputRange?.endOffset),
    ).toBe('\\vect{x+y}')
  })

  it('relinks macro provenance across project files without reparsing callers', () => {
    const service = new LatexSyntaxService()
    service.upsert({
      fileId: 'caller',
      path: 'chapter.tex',
      content: '$\\vect{x}$',
      documentVersion: 1,
    })
    service.upsert({
      fileId: 'defs',
      path: 'macros.tex',
      content: '\\newcommand{\\vect}[1]{#1}',
      documentVersion: 1,
    })
    const call = service
      .getFile('caller')
      ?.macros.find((event) => event.kind === 'call' && event.name === 'vect')
    expect(call?.definitions[0]?.fileId).toBe('defs')
    expect(service.getStats().parseCount).toBe(2)

    service.move('defs', 'shared/macros.tex')
    expect(
      service.getFile('caller')?.macros.find((event) => event.name === 'vect')?.definitions[0]
        ?.path,
    ).toBe('shared/macros.tex')
    service.remove('defs')
    expect(
      service.getFile('caller')?.macros.find((event) => event.name === 'vect')?.definitions,
    ).toEqual([])
  })

  it('expands project macros across files while preserving the caller range', () => {
    const service = createLatexSyntaxService({
      documents: [
        {
          fileId: 'caller',
          path: 'chapter.tex',
          content: '$\\Voltage=\\Current\\Resistance$',
          documentVersion: 1,
        },
        {
          fileId: 'defs',
          path: 'macros.tex',
          content: [
            '\\newcommand{\\Voltage}{V}',
            '\\newcommand{\\Current}{I}',
            '\\newcommand{\\Resistance}{R}',
          ].join('\n'),
          documentVersion: 1,
        },
      ],
    })
    const syntax = service.getFile('caller')!
    for (const [name, surface] of [
      ['Voltage', 'V'],
      ['Current', 'I'],
      ['Resistance', 'R'],
    ]) {
      const call = syntax.macros.find((event) => event.kind === 'call' && event.name === name)
      expect(call?.expansion.status).toBe('expanded')
      expect(call?.expansion.surface).toBe(surface)
      expect(call?.expansion.inputRange).toEqual(
        call && {
          startOffset: call.source.range.startOffset - 1,
          endOffset: call.source.range.endOffset,
        },
      )
    }
    expect(service.getStats().parseCount).toBe(2)
  })

  it('refuses an ambiguous project macro definition', () => {
    const service = createLatexSyntaxService({
      documents: [
        { fileId: 'caller', path: 'main.tex', content: '$\\value$', documentVersion: 1 },
        { fileId: 'one', path: 'one.tex', content: '\\newcommand{\\value}{x}', documentVersion: 1 },
        { fileId: 'two', path: 'two.tex', content: '\\newcommand{\\value}{y}', documentVersion: 1 },
      ],
    })
    const call = service
      .getFile('caller')
      ?.macros.find((event) => event.kind === 'call' && event.name === 'value')
    expect(call?.definitions).toHaveLength(2)
    expect(call?.expansion).toEqual({ status: 'unresolved', depth: 0, editable: true })
  })

  it('returns a partial region and diagnostic for unfinished input', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content: 'before $x + 1',
      documentVersion: 1,
    })
    expect(syntax.mathRegions[0]?.closed).toBe(false)
    expect(syntax.diagnostics[0]?.code).toBe('unclosed-math')
  })

  it('covers TeX delimiters, environments, comments, verbatim, and includes', () => {
    const content = [
      '% $comment$',
      '\\verb|$verbatim$|',
      '\\input{chapter}',
      '$$a$$ \\(b\\) \\begin{equation}c\\end{equation}',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    expect(syntax.mathRegions.map((region) => region.delimiter)).toEqual([
      '$$',
      '\\(',
      '\\begin{equation}',
    ])
    expect(syntax.includes[0]?.path).toBe('chapter')
  })

  it('resets and removes its project inventory', () => {
    const service = createLatexSyntaxService({
      documents: [
        { fileId: 'a', path: 'a.tex', content: '$a$', documentVersion: 1 },
        { fileId: 'b', path: 'b.tex', content: '$b$', documentVersion: 1 },
      ],
    })
    service.reset({
      documents: [{ fileId: 'c', path: 'c.tex', content: '$c$', documentVersion: 2 }],
    })
    expect(service.getFile('a')).toBeNull()
    expect(service.getFile('c')?.documentVersion).toBe(2)
    service.remove('missing')
    service.remove('c')
    expect(service.getFile('c')).toBeNull()
    expect(service.getStats()).toEqual({ documents: 0, parseCount: 3 })
    expect(() => service.move('missing', 'next.tex')).toThrow('unknown fileId')
  })

  it('removes stale LaTeX symbols when a document becomes Markdown', () => {
    const service = new LatexSyntaxService()
    service.upsert({
      fileId: 'stable',
      path: 'notes.tex',
      content: '\\label{old}',
      documentVersion: 1,
    })
    service.upsert({
      fileId: 'stable',
      path: 'notes.md',
      content: '$x$',
      documentVersion: 2,
      language: 'markdown',
    })

    expect(service.getProjectIndex().hasFile('notes.tex')).toBe(false)
    expect(service.getProjectIndex().hasFile('notes.md')).toBe(false)
  })

  it('reports builtin macro calls without invented definitions', () => {
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content: '$\\alpha$',
      documentVersion: 1,
    })
    const alpha = syntax.macros.find((event) => event.name === 'alpha')
    expect(alpha?.kind).toBe('call')
    expect(alpha?.definitions).toEqual([])
    expect(alpha?.expansion).toEqual({ status: 'unresolved', depth: 0, editable: true })
  })

  it('reports bounded macro expansion cycles and truncation without synthetic editability', () => {
    const content = [
      '\\newcommand{\\a}{\\b}',
      '\\newcommand{\\b}{\\a}',
      '\\newcommand{\\c}{\\d}',
      '\\newcommand{\\d}{\\e}',
      '\\newcommand{\\e}{\\f}',
      '\\newcommand{\\f}{\\g}',
      '\\newcommand{\\g}{\\h}',
      '\\newcommand{\\h}{x}',
      '$\\a \\c$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.tex',
      content,
      documentVersion: 1,
    })
    const calls = syntax.macros.filter((event) => event.kind === 'call')
    expect(calls.find((event) => event.name === 'a')?.expansion.status).toBe('cycle')
    expect(calls.find((event) => event.name === 'c')?.expansion).toEqual({
      status: 'truncated',
      depth: 4,
      editable: false,
    })
  })

  it('excludes Markdown metadata, inline code, comments, and false TeX branches', () => {
    const content = [
      '---',
      'formula: $metadata$',
      '---',
      '`$inline$` <!-- $comment$ -->',
      '\\iffalse $false$ \\else $true$ \\fi',
      '$visible$',
    ].join('\n')
    const syntax = new LatexSyntaxService().upsert({
      fileId: 'f1',
      path: 'main.md',
      content,
      documentVersion: 1,
      language: 'markdown',
    })
    expect(
      syntax.mathRegions.map((region) =>
        content.slice(region.contentRange.startOffset, region.contentRange.endOffset),
      ),
    ).toEqual(['true', 'visible'])
  })
})
