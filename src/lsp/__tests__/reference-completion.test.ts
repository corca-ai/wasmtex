import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'

function referenceCompletion(declarations: string, invocation: string) {
  const source = `${declarations}\n${invocation}`
  const service = createLatexLanguageService({ files: { 'main.tex': source } })
  const complete = () =>
    service.getCompletions('main.tex', source.split('\n').length, invocation.length + 1)
  return { service, complete }
}

describe('content-aware reference completion', () => {
  it('describes actual section titles and float captions at their label definitions', () => {
    const { complete } = referenceCompletion(
      String.raw`\section{Methods}\label{sec:method}
\begin{figure}\caption{Architecture overview}\label{fig:overview}\end{figure}`,
      String.raw`\ref{`,
    )
    const items = complete()
    expect(items.find((item) => item.insertText === 'sec:method')?.detail).toContain('Methods')
    expect(items.find((item) => item.insertText === 'fig:overview')?.detail).toContain(
      'Architecture overview',
    )
  })

  it('finds a reference by its caption while inserting only the label key', () => {
    const { complete } = referenceCompletion(
      String.raw`\begin{figure}\caption{Architecture overview}\label{fig:overview}\end{figure}`,
      String.raw`\ref{Architecture`,
    )
    const items = complete()
    expect(items.map((item) => item.insertText)).toEqual(['fig:overview'])
    expect(items[0]?.replacementRange).toEqual({
      startLine: 2,
      startColumn: 6,
      endLine: 2,
      endColumn: 18,
    })
  })

  it('uses the page field for pageref candidates', () => {
    const { service, complete } = referenceCompletion(
      String.raw`\section{Methods}\label{sec:method}`,
      String.raw`\pageref{`,
    )
    service.updateAux(String.raw`\newlabel{sec:method}{{2}{7}}`)
    const candidate = complete().find((item) => item.insertText === 'sec:method')
    expect(candidate?.detail).toContain('[7]')
    expect(candidate?.detail).not.toContain('[2]')
  })

  it('does not offer an ambiguous duplicate as one resolved destination', () => {
    const { complete } = referenceCompletion(
      String.raw`\section{First}\label{same}
\section{Second}\label{same}`,
      String.raw`\ref{`,
    )
    expect(complete().filter((item) => item.insertText === 'same')).toEqual([])
  })

  it.each([
    'Methods',
    'methods',
    'main.tex',
    '2',
  ])('searches source and compile fields: %s', (query) => {
    const { service, complete } = referenceCompletion(
      String.raw`\section{Methods}\label{sec:method}`,
      `\\ref{${query}`,
    )
    service.updateAux(String.raw`\newlabel{sec:method}{{2}{7}}`)
    expect(complete().map((item) => item.insertText)).toEqual(['sec:method'])
    expect(complete()[0]?.filterText).toContain('Methods')
  })

  it('retracts changed titles and replaced aux values without removing the source label', () => {
    const { service, complete } = referenceCompletion(
      String.raw`\section{Old}\label{key}`,
      String.raw`\ref{`,
    )
    service.updateAux(String.raw`\newlabel{key}{{2}{7}}`)
    expect(complete()[0]?.detail).toContain('Old')
    service.updateFile('main.tex', `${String.raw`\section{New}\label{key}`}\n${String.raw`\ref{`}`)
    service.updateAuxFiles({ root: 'main.aux', files: { 'main.aux': '' } })
    expect(complete()[0]?.detail).toContain('New')
    expect(complete()[0]?.detail).not.toContain('Old')
    expect(complete()[0]?.detail).not.toContain('[2]')
  })

  it.each([
    String.raw`\section{Unrelated}\refstepcounter{figure}\label{key}`,
    String.raw`\section{Unrelated} prose \label{key}`,
    String.raw`\newcommand{\unused}{\section{Template}\label{key}}`,
    String.raw`\NewDocumentCommand{\unused}{}{\section{Template}\label{key}}`,
    String.raw`\NewDocumentCommand\unused{}{\section{Template}\label{key}}`,
    String.raw`\newenvironment{unused}{\section{Template}\label{key}}{}`,
    String.raw`\NewDocumentEnvironment{unused}{}{\section{Template}\label{key}}{}`,
    String.raw`\section{Incomplete\label{key}`,
  ])('does not invent a title association: %s', (declaration) => {
    const { complete } = referenceCompletion(declaration, String.raw`\ref{`)
    expect(complete()[0]?.documentation).toBeUndefined()
  })

  it('ignores inactive text and preserves nested titles across comments', () => {
    const { complete } = referenceCompletion(
      String.raw`% \section{Comment}\label{comment}
\begin{verbatim}\section{Raw}\label{raw}\end{verbatim}
\iffalse\section{Hidden}\label{hidden}\fi
\section[Short]{Full \emph{title}}% separator
\label{key}`,
      String.raw`\ref{`,
    )
    expect(complete().map((item) => item.insertText)).toEqual(['key'])
    expect(complete()[0]?.detail).toContain(String.raw`Full \emph{title}`)
    expect(complete()[0]?.documentation).toContain(String.raw`\section[Short]{Full \emph{title}}`)
  })

  it('keeps source documentation inside a bounded code fence', () => {
    const title = `\`\`\`\n[open](command:danger) <img src=x> ${'x'.repeat(2000)}`
    const { complete } = referenceCompletion(`\\section{${title}}\\label{key}`, String.raw`\ref{`)
    const item = complete()[0]
    expect(item?.documentation).toMatch(/^````latex\n/)
    expect(item?.documentation).toMatch(/\n````$/)
    expect(item?.documentation?.length).toBeLessThan(1050)
    expect(item?.detail?.length).toBeLessThan(300)
  })

  it('limits definitions and ambiguity to the active include component', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': `${String.raw`\input{child}`}\n${String.raw`\ref{`}`,
        'child.tex': String.raw`\section{Active}\label{key}`,
        'other.tex': String.raw`\section{Other}\label{key}`,
      },
    })
    const items = service.getCompletions('main.tex', 2, 6)
    expect(items.map((item) => item.insertText)).toEqual(['key'])
    expect(items[0]?.detail).toContain('Active')
    expect(items[0]?.detail).toContain('child.tex:1')
  })

  it.each([
    String.raw`\newlabel{key}{{2}{7}}\@input{missing.aux}`,
    String.raw`\newlabel{key}{{\custom}{\page}}`,
  ])('keeps source candidates without unsupported runtime values: %s', (aux) => {
    for (const command of ['ref', 'eqref', 'pageref']) {
      const { service, complete } = referenceCompletion(String.raw`\label{key}`, `\\${command}{`)
      service.updateAuxFiles({ root: 'main.aux', files: { 'main.aux': aux } })
      expect(complete()[0]?.detail).toBe('main.tex:1')
      expect(complete()[0]?.filterText).toBe('key main.tex:1')
    }
  })

  it.each([
    'newenvironmenthelper',
    'NewDocumentEnvironmentExtra',
  ])('does not mistake %s for a declaration', (command) => {
    const { service, complete } = referenceCompletion(
      `\\${command}\n\\section{Actual}\\label{key}`,
      String.raw`\ref{`,
    )
    expect(complete()[0]?.detail).toContain('Actual')
    expect(service.getOutline('main.tex').map((section) => section.title)).toEqual(['Actual'])
  })

  it.each([
    '\n',
    ' ',
  ])('an unfinished reference never replaces the following command after %j', (separator) => {
    const source = `${String.raw`\section{Architecture}\label{key}`}\n${String.raw`\ref{Architecture`}${separator}${String.raw`\end{document}`}`
    const service = createLatexLanguageService({ files: { 'main.tex': source } })
    const item = service.getCompletions('main.tex', 2, 11)[0]
    expect(item?.insertText).toBe('key')
    expect(item?.replacementRange).toEqual({
      startLine: 2,
      startColumn: 6,
      endLine: 2,
      endColumn: 18,
    })
  })
})
