import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'

function linked(source: string, at: string, occurrence = 0) {
  const service = createLatexLanguageService({ files: { 'main.tex': source } })
  let offset = -1
  for (let index = 0; index <= occurrence; index++) offset = source.indexOf(at, offset + 1)
  if (offset < 0) throw new Error(`Missing test cursor: ${at}`)
  const prefix = source.slice(0, offset)
  const line = prefix.split('\n').length
  const column = offset - prefix.lastIndexOf('\n')
  return service.getLinkedEditingRanges('main.tex', line, column)
}

function names(source: string, at: string, occurrence = 0) {
  const lines = source.split('\n')
  return (
    linked(source, at, occurrence)?.ranges.map((range) =>
      lines[range.startLine - 1]!.slice(range.startColumn - 1, range.endColumn - 1),
    ) ?? null
  )
}

describe('literal environment linked editing', () => {
  it('selects the matching nested counterpart from either delimiter', () => {
    const source = String.raw`\begin{align}
\begin{align}x\end{align}
\begin{equation}y\end{equation}
\end{align}`
    expect(linked(source, 'align', 0)?.ranges).toEqual([
      { startLine: 1, startColumn: 8, endLine: 1, endColumn: 13 },
      { startLine: 4, startColumn: 6, endLine: 4, endColumn: 11 },
    ])
    expect(linked(source, 'align', 3)).toEqual(linked(source, 'align', 0))
    expect(linked(source, 'align', 1)?.ranges.map((range) => range.startLine)).toEqual([2, 2])
    expect(names(source, 'equation')).toEqual(['equation', 'equation'])
  })

  it('allows stars, CRLF and the caret at the end of a name', () => {
    const source = '\\begin\r\n{align*}x\\end{align*}'
    expect(names(source, 'align*')).toEqual(['align*', 'align*'])
    expect(linked(source, '}')?.wordPattern).toBeDefined()
    expect(linked(source, 'begin')).toBeNull()
    expect(linked(source, '{')).toBeNull()
  })

  it('ignores comments, escaped control symbols, verbatim and definition templates', () => {
    for (const source of [
      String.raw`% \begin{align}x\end{align}`,
      String.raw`\\begin{align}x\\end{align}`,
      String.raw`\verb|\begin{align}x\end{align}|`,
      String.raw`\begin{verbatim}\begin{align}x\end{align}\end{verbatim}`,
      String.raw`\DeclareRobustCommand{\sample}{\begin{align}x\end{align}}`,
      String.raw`\newcommand{\sample}{\begin{align}x\end{align}}`,
      String.raw`\newcommand{\?}{\begin{align}x\end{align}}`,
      String.raw`\def\?{\begin{align}x\end{align}}`,
      String.raw`\newcommand{\foo}[1][{]}]{\begin{align}x\end{align}}`,
      String.raw`\NewDocumentCommand{\?}{m}{\begin{align}x\end{align}}`,

      String.raw`\NewDocumentEnvironment{sample}{}{\begin{align}}{\end{align}}`,
      String.raw`\iffalse\begin{align}x\end{align}\fi`,
    ])
      expect(names(source, 'align')).toBeNull()
    expect(names(String.raw`\begin{verbatim}x\end{verbatim}`, 'verbatim')).toBeNull()
    expect(
      names(
        String.raw`\begin{align}% \end{align}
x\end{align}`,
        'align',
      ),
    ).toEqual(['align', 'align'])
  })

  it('keeps declaration tokens inside environment templates bounded', () => {
    const source = String.raw`\newenvironment{sample}{\newcommand}{}
\begin{align}x\end{align}`
    expect(names(source, 'align')).toEqual(['align', 'align'])
  })

  it('does not reinterpret declaration tokens inside an uncalled replacement', () => {
    for (const body of ['\\newcommand', '\\NewDocumentEnvironment', '\\DeclareRobustCommand']) {
      const source = `\\newcommand{\\define}{${body}}\n\\begin{align}x\\end{align}`
      expect(names(source, 'align')).toEqual(['align', 'align'])
    }
  })

  it('does not mistake escaped declaration text for a template', () => {
    for (const command of ['newcommand', 'DeclareRobustCommand', 'def', 'NewDocumentEnvironment']) {
      const source = `Text \\\\${command} is literal text.\n\\begin{align}x\\end{align}`
      expect(names(source, 'align')).toEqual(['align', 'align'])
    }
  })

  it('does not recover a linked pair across a malformed or mismatched delimiter', () => {
    for (const source of [
      String.raw`\begin{align}x`,
      String.raw`\begin{align}x\end{equation}`,
      String.raw`\begin{align}\begin{oops\end{align}`,
      String.raw`\begin{align}\begin{x}\end{align}\end{x}`,
      String.raw`\begin{align}\end{other}\end{align}`,
      String.raw`\begin{\name}x\end{\name}`,
    ])
      expect(names(source, source.includes('align') ? 'align' : 'name')).toBeNull()
  })

  it('updates pairs on source replacement and removal without reparsing on queries', () => {
    const service = createLatexLanguageService({
      files: { 'main.tex': String.raw`\begin{align}x\end{align}` },
    })
    const before = service.getSyntaxService().getStats().parseCount
    expect(service.getLinkedEditingRanges('main.tex', 1, 9)?.ranges).toHaveLength(2)
    expect(service.getSyntaxService().getStats().parseCount).toBe(before)
    service.updateFile('main.tex', String.raw`\begin{align}x\end{equation}`)
    expect(service.getLinkedEditingRanges('main.tex', 1, 9)).toBeNull()
    service.removeFile('main.tex')
    expect(service.getLinkedEditingRanges('main.tex', 1, 9)).toBeNull()
  })
})
