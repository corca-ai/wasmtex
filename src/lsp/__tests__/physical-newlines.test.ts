import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'
import { LatexSyntaxService } from '../../syntax'
import { getFoldingRanges, getSignatureHelp } from '../language-features'
import { parseLatexFile } from '../latex-parser'
import { tokenize } from '../latex-tokenizer'
import { buildLineStarts, offsetToLineCol, positionToOffset } from '../source-position'

describe.each(['\n', '\r\n', '\r'])('physical newline %j', (newline) => {
  it('preserves UTF-16 offsets, clamps positions before the complete terminator', () => {
    const text = `\uFEFF😀${newline}abc${newline}`
    const starts = buildLineStarts(text)
    expect(starts).toEqual([0, 3 + newline.length, 6 + 2 * newline.length])
    expect(offsetToLineCol(starts, text.indexOf('b'))).toEqual({ line: 2, column: 2 })
    expect(positionToOffset(text, starts, { line: 1, column: 999 })).toBe(3)
    expect(positionToOffset(text, starts, { line: 2, column: 999 })).toBe(6 + newline.length)
  })
  it('ends comments and malformed inline verb at a physical line boundary', () => {
    const source = `% ignored \\label{bad}${newline}\\verb|unterminated${newline}\\label{good}`
    const tokens = tokenize(source)
    const label = tokens.find((token) => token.type === 'command' && token.value === 'label')!
    expect(label).toMatchObject({ start: source.lastIndexOf('\\label'), line: 3, column: 1 })
    expect(tokens.find((token) => token.type === 'comment')?.value).toBe('% ignored \\label{bad}')
    expect(parseLatexFile(source, 'main.tex').labels.map((label) => label.name)).toEqual(['good'])
  })
  it('keeps masked source positions, folding and signature context consistent', () => {
    const source = [
      '\\begin{verbatim}',
      '\\label{hidden}',
      '\\end{verbatim}',
      '\\begin{quote}',
      '\\label{real}',
      '\\end{quote}',
      '\\frac{one}{two}',
    ].join(newline)
    const result = parseLatexFile(source, 'main.tex')
    expect(result.labels).toHaveLength(1)
    expect(result.labels[0]?.location).toMatchObject({ line: 5, column: 8 })
    expect(getFoldingRanges(source)).toContainEqual({ startLine: 4, endLine: 6 })
    expect(getSignatureHelp(source, 7, 14)?.command).toBe('frac')
  })
})

it.each([
  '\n',
  '\r\n',
  '\r',
])('shares original offsets with the real LSP service for %j', (newline) => {
  const source = [
    '\uFEFF😀 % ignored \\input{bad}',
    '\\input{chapter}',
    '\\label{sec:one}',
    'See \\ref{sec:one}',
  ].join(newline)
  const service = createLatexLanguageService({ lint: false })
  service.updateFile('main.tex', source)
  expect(service.getFile('main.tex')).toBe(source)
  const links = service.getDocumentLinks('main.tex')
  expect(links).toHaveLength(1)
  expect(links[0]).toMatchObject({
    target: 'chapter',
    range: { startLine: 2, startColumn: 8, endLine: 2, endColumn: 15 },
  })
  expect(service.getDefinition('main.tex', 4, 12)).toMatchObject({
    file: 'main.tex',
    range: { startLine: 3, startColumn: 8 },
  })
  const edits = service.getRenameEdits('main.tex', 4, 12, 'sec:two')?.edits
  expect(edits).toHaveLength(2)
  expect(edits?.map((edit) => edit.range.startLineNumber)).toEqual([3, 4])
})

it('keeps cross-token CRLF coordinates equal to each raw token start', () => {
  for (const source of ['\\\r\nabc', '\\\r\n\\label{x}', '\\verb|x\r\ntext']) {
    const starts = buildLineStarts(source)
    for (const token of tokenize(source))
      expect({ line: token.line, column: token.column }).toEqual(
        offsetToLineCol(starts, token.start),
      )
  }
})
it.each([
  '\n',
  '\r\n',
  '\r',
])('preserves initial BOM while excluding fenced Markdown math for %j', (newline) => {
  const content = ['\uFEFF```tex', '$hidden$', '```', 'Visible $x$'].join(newline)
  const syntax = new LatexSyntaxService().upsert({
    fileId: 'a',
    path: 'a.md',
    documentVersion: 1,
    content,
  })
  expect(
    syntax.mathRegions.map((region) =>
      content.slice(region.contentRange.startOffset, region.contentRange.endOffset),
    ),
  ).toEqual(['x'])
})

it.each([
  '\n',
  '\r\n',
  '\r',
  'mixed',
])('keeps the full neutral query/edit path source-preserving for %j', (ending) => {
  const lines = [
    '\uFEFF😀 % heading',
    '\\section{Intro}',
    '\\label{sec:intro}',
    'See \\ref{sec:intro} and \\ref{missing}.',
    '\\newcommand{\\sampleword}{ok}',
    '\\sampleword',
    '\\sam',
  ]
  const source = lines.reduce(
    (text, line, index) =>
      text +
      (index ? (ending === 'mixed' ? ['\r', '\r\n', '\n'][(index - 1) % 3] : ending) : '') +
      line,
    '',
  )
  const service = createLatexLanguageService({ lint: false })
  service.updateFile('main.tex', source)
  expect(service.getOutline('main.tex')).toMatchObject([
    { title: 'Intro', location: { line: 2, column: 1 } },
  ])
  expect(service.getHover('main.tex', 6, 5)?.contents.join(' ')).toContain('sampleword')
  expect(service.getCompletions('main.tex', 7, 5).map((item) => item.label)).toContain(
    '\\sampleword',
  )
  expect(service.getDiagnostics()).toContainEqual(
    expect.objectContaining({
      file: 'main.tex',
      code: 'undefined-ref',
      line: 4,
      column: lines[3]!.indexOf('missing') + 1,
    }),
  )
  const plan = service.getRenameEdits('main.tex', 4, 12, 'sec:overview')
  expect(plan?.edits).toHaveLength(2)
  const starts = buildLineStarts(source)
  const replacements = plan!.edits
    .map((edit) => ({
      from: positionToOffset(source, starts, {
        line: edit.range.startLineNumber,
        column: edit.range.startColumn,
      }),
      to: positionToOffset(source, starts, {
        line: edit.range.endLineNumber,
        column: edit.range.endColumn,
      }),
      text: edit.newText,
    }))
    .sort((a, b) => b.from - a.from)
  let changed = source
  for (const edit of replacements)
    changed = changed.slice(0, edit.from) + edit.text + changed.slice(edit.to)
  expect(changed).toBe(source.replaceAll('sec:intro', 'sec:overview'))
  expect(service.getFile('main.tex')).toBe(source)
  service.updateFile('main.tex', changed)
  expect(service.getDefinition('main.tex', 4, 12)).toMatchObject({
    file: 'main.tex',
    range: { startLine: 3, startColumn: 8 },
  })
})
