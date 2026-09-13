import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'
import { buildLineStarts, positionToOffset } from '../source-position'

function selected(source: string, at: string, files: Record<string, string> = {}) {
  const service = createLatexLanguageService({ files: { ...files, 'main.tex': source } })
  const offset = source.indexOf(at)
  if (offset < 0) throw new Error(`Missing cursor ${at}`)
  const starts = buildLineStarts(source)
  const line = source.slice(0, offset).split('\n').length
  const ranges = service.getSelectionRanges('main.tex', line, offset - starts[line - 1]! + 1)
  return ranges.map((range) =>
    source.slice(
      positionToOffset(source, starts, { line: range.startLine, column: range.startColumn }),
      positionToOffset(source, starts, { line: range.endLine, column: range.endColumn }),
    ),
  )
}

describe('source structural selection', () => {
  it('expands nested argument content, groups, confirmed invocations and environments', () => {
    const source = String.raw`\begin{document}\begin{quote}\textbf{Hello \emph{world}}\end{quote}\end{document}`
    expect(selected(source, 'world')).toEqual([
      'world',
      '{world}',
      String.raw`\emph{world}`,
      String.raw`Hello \emph{world}`,
      String.raw`{Hello \emph{world}}`,
      String.raw`\textbf{Hello \emph{world}}`,
      String.raw`\begin{quote}\textbf{Hello \emph{world}}\end{quote}`,
      source,
    ])
  })

  it('selects multiline UTF-16 optional arguments with protected brackets', () => {
    const source = '\\section[short {]} 😀\nname]{Long title}'
    expect(selected(source, '😀')).toEqual(['short {]} 😀\nname', '[short {]} 😀\nname]', source])
  })

  it('uses confirmed project grammar and does not consume unrelated extra groups', () => {
    const source = String.raw`\newcommand{\pair}[2]{#1 #2}\pair{first}{second}{extra}`
    expect(selected(source, 'second')).toEqual([
      'second',
      '{second}',
      String.raw`\pair{first}{second}`,
    ])
    expect(selected(source, 'extra')).toEqual(['extra', '{extra}'])
  })

  it('retains complete groups without inventing an incomplete invocation', () => {
    expect(selected(String.raw`\frac{first}{unfinished`, 'first')).toEqual(['first', '{first}'])
    expect(selected(String.raw`\textbf{unfinished`, 'unfinished')).toEqual([])
    expect(selected(String.raw`\unknown{content}`, 'content')).toEqual(['content', '{content}'])
  })

  it('does not return ranges at masked or virtual template positions', () => {
    for (const source of [
      String.raw`\begin{quote}% \textbf{target}
\end{quote}`,
      String.raw`\verb|\textbf{target}|`,
      String.raw`\begin{verbatim}\textbf{target}\end{verbatim}`,
      String.raw`\iffalse\textbf{target}\fi`,
      String.raw`\newcommand{\sample}{\textbf{target}}`,
    ])
      expect(selected(source, 'target')).toEqual([])
  })

  it('does not match an environment across a mismatched inner delimiter', () => {
    expect(
      selected(String.raw`\begin{quote}\begin{center}target\end{quote}\end{center}`, 'target'),
    ).toEqual([])
  })
})

it('respects xparse balanced optionals and legacy unbalanced optionals', () => {
  const modern = String.raw`\NewDocumentCommand{\pick}{o m}{#1 #2}\pick[a[b]c]{body}`
  expect(selected(modern, 'b]c')).toEqual(['a[b]c', '[a[b]c]', String.raw`\pick[a[b]c]{body}`])
  const legacy = String.raw`\newcommand{\pick}[2][default]{#1 #2}\pick[a[b]{body}`
  expect(selected(legacy, 'a[b')).toEqual(['a[b', '[a[b]', String.raw`\pick[a[b]{body}`])
})

it('does not reinterpret escaped braces or unsupported stars as argument syntax', () => {
  expect(selected(String.raw`\textbf{a \{ target \} z}`, 'target')).toEqual([
    String.raw`a \{ target \} z`,
    String.raw`{a \{ target \} z}`,
    String.raw`\textbf{a \{ target \} z}`,
  ])
  expect(selected(String.raw`\textbf*{target}`, 'target')).toEqual(['target', '{target}'])
})

it('follows source replacement/removal and cancellation without publishing or reparsing on queries', () => {
  const source = String.raw`\textbf{target}`
  const service = createLatexLanguageService({ files: { 'main.tex': source } })
  const before = service.getSyntaxService().getStats().parseCount
  const first = service.getSelectionRanges('main.tex', 1, 10)
  expect(first).toHaveLength(3)
  first[0]!.startColumn = 999
  expect(service.getSelectionRanges('main.tex', 1, 10)[0]!.startColumn).toBe(9)
  expect(service.getSelectionRanges('main.tex', 1, 10, { isCancellationRequested: true })).toEqual(
    [],
  )
  for (const [line, column] of [
    [0, 1],
    [1, 0],
    [1, 999],
    [2, 1],
    [1.5, 1],
    [1, Number.NaN],
  ]) {
    expect(service.getSelectionRanges('main.tex', line!, column!)).toEqual([])
  }
  expect(service.getSyntaxService().getStats().parseCount).toBe(before)
  service.updateFile('main.tex', 'plain source')
  expect(service.getSelectionRanges('main.tex', 1, 10)).toEqual([])
  service.removeFile('main.tex')
  expect(service.getSelectionRanges('main.tex', 1, 1)).toEqual([])
})

it('keeps large-file warm queries bounded and excludes private caches from public symbols', () => {
  const source = Array.from(
    { length: 1000 },
    (_, i) => String.raw`\begin{quote}\textbf{word${i}}\end{quote}`,
  ).join('\n')
  const service = createLatexLanguageService({ files: { 'main.tex': source }, lint: false })
  const before = service.getSyntaxService().getStats().parseCount
  service.getSelectionRanges('main.tex', 1000, 23)
  const started = performance.now()
  expect(service.getSelectionRanges('main.tex', 1000, 23)).toHaveLength(4)
  expect(performance.now() - started).toBeLessThan(150)
  expect(service.getSyntaxService().getStats().parseCount).toBe(before)
  expect(JSON.stringify(service.getProjectIndex().getFileSymbols('main.tex'))).not.toContain(
    'masked',
  )
  expect(service.getProjectIndex().getStats().estimatedBytes).toBeLessThan(8 * 1024 * 1024)
})

it('does not truncate a call before an already started optional argument', () => {
  const source = String.raw`\NewDocumentCommand{\pick}{m o}{#1}\pick{target}[unfinished`
  expect(selected(source, 'target')).toEqual(['target', '{target}'])
})

it('rejects columns beyond CRLF line content', () => {
  const service = createLatexLanguageService({
    files: {
      'main.tex': '\\begin{quote}\r\ntext\r\n\\end{quote}',
    },
  })
  expect(service.getSelectionRanges('main.tex', 2, 5)).toHaveLength(1)
  expect(service.getSelectionRanges('main.tex', 2, 6)).toEqual([])
})
