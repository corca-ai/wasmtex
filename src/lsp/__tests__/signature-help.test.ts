import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'
import { CompletionResolverRegistry } from '../completion-registry'
import { getSignatureHelp } from '../language-features'

function query(marked: string, registry?: CompletionResolverRegistry) {
  const offset = marked.indexOf('|')
  const before = marked.slice(0, offset).split('\n')
  return getSignatureHelp(
    marked.replace('|', ''),
    before.length,
    before.at(-1)!.length + 1,
    registry,
  )
}

describe('signature invocation context', () => {
  it('returns to the outer command after a nested invocation closes', () => {
    expect(query(String.raw`\frac{\sqrt{x}}{|}`)).toMatchObject({
      label: '\\frac{numerator}{denominator}',
      activeParameter: 1,
      command: 'frac',
      argumentIndex: 1,
      starred: false,
    })
    expect(query('\\frac{\\sqrt{x}}\n{|}')).toMatchObject({ activeParameter: 1 })
  })

  it('does not interpret comments, verbatim, or inactive branches', () => {
    for (const source of [
      String.raw`% \frac{a}{|}`,
      String.raw`\verb!\frac{a}{|}!`,
      String.raw`\begin{verbatim}\frac{a}{|}\end{verbatim}`,
      String.raw`\iffalse\frac{a}{|}\fi`,
    ])
      expect(query(source)).toBeNull()
  })

  it('identifies omitted and present optional arguments by signature index', () => {
    expect(query(String.raw`\sqrt{|}`)).toMatchObject({
      label: '\\sqrt[index]{radicand}',
      activeParameter: 1,
      argumentIndex: 0,
    })
    expect(query(String.raw`\sqrt[3]{|}`)).toMatchObject({ activeParameter: 1, argumentIndex: 1 })
    expect(query(String.raw`\sqrt[|]{x}`)).toMatchObject({ activeParameter: 0 })
    expect(query(String.raw`\sqrt[[x]{|}`)).toMatchObject({ activeParameter: 1 })
  })

  it('uses registered argument metadata for starred and incomplete calls', () => {
    const registry = new CompletionResolverRegistry()
    registry.registerCommand('pick*', [
      { kind: 'optional', placeholder: 'options', valueKind: 'free-text' },
      { kind: 'required', placeholder: 'key', valueKind: 'label' },
    ])
    expect(query(String.raw`\pick*{|`, registry)).toMatchObject({
      label: '\\pick*[options]{key}',
      activeParameter: 1,
      argumentIndex: 0,
      parameterDetails: [
        { kind: 'optional', placeholder: 'options' },
        { kind: 'required', placeholder: 'key', valueKind: 'label' },
      ],
    })
  })

  it('ignores escaped braces and literal brackets in required arguments', () => {
    expect(query(String.raw`\frac{\{[x}{|}`)).toMatchObject({ activeParameter: 1 })
    expect(query(String.raw`\frac{x}{y} {|}`)).toBeNull()
    expect(query(String.raw`\unknown{|}`)).toBeNull()
  })
})

describe('project signature metadata', () => {
  it('shares known legacy and xparse argument structure with completion', () => {
    for (const declaration of [
      String.raw`\newcommand{\vect}[2][x]{#1#2}`,
      String.raw`\newcommand{\vect}[2][{]}]{#1#2}`,
      String.raw`\NewDocumentCommand{\vect}{O{x} m}{#1#2}`,
    ]) {
      const source = `${declaration}\n\\vect{}`
      const service = createLatexLanguageService({ files: { 'main.tex': source } })
      const help = service.getSignatureHelp('main.tex', 2, 7)
      expect(help).toMatchObject({
        command: 'vect',
        label: '\\vect[arg1]{arg2}',
        activeParameter: 1,
        argumentIndex: 0,
      })
      expect(service.getCompletionContext('main.tex', 2, 7)).toMatchObject({
        command: 'vect',
        signatureIndex: help!.activeParameter,
        argumentIndex: help!.argumentIndex,
      })
    }
  })

  it('retracts ambiguous or unsupported project signatures instead of using a builtin', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': String.raw`\input{defs} \frac{}{}`,
        'defs.tex': String.raw`\newcommand{\frac}[1]{#1}`,
      },
    })
    const position = service.getFile('main.tex') as string
    const column = position.lastIndexOf('}') + 1
    expect(service.getSignatureHelp('main.tex', 1, column)).toBeNull()
    service.updateFile('defs.tex', String.raw`\NewDocumentCommand{\frac}{d<>}{#1}`)
    expect(service.getSignatureHelp('main.tex', 1, column)).toBeNull()
    service.updateFile('defs.tex', '')
    expect(service.getSignatureHelp('main.tex', 1, column)).toMatchObject({ activeParameter: 1 })
  })
})

describe('starred signatures', () => {
  it('uses only confirmed starred forms and keeps their argument mapping distinct', () => {
    expect(query(String.raw`\section*{|}`)).toMatchObject({
      label: '\\section*{title}',
      activeParameter: 0,
      starred: true,
    })
    expect(query(String.raw`\section{|}`)).toMatchObject({ activeParameter: 1 })
    expect(query(String.raw`\section*[short]{|}`)).toBeNull()
    expect(query(String.raw`\frac*{|}{x}`)).toBeNull()
    expect(query(String.raw`\frac[bad]{|}{x}`)).toBeNull()
  })

  it('supports a leading xparse star while preserving actual parameter names', () => {
    const service = createLatexLanguageService({
      files: {
        'main.tex': `${String.raw`\NewDocumentCommand{\pick}{s O{x} m}{#3}`}\n${String.raw`\pick*{}`}`,
      },
    })
    expect(service.getSignatureHelp('main.tex', 2, 8)).toMatchObject({
      label: '\\pick*[arg2]{arg3}',
      activeParameter: 1,
      argumentIndex: 0,
      starred: true,
    })
    service.updateFile(
      'main.tex',
      `${String.raw`\newcommand{\pick}[1]{#1}`}\n${String.raw`\pick*{}`}`,
    )
    expect(service.getSignatureHelp('main.tex', 2, 8)).toBeNull()
  })
})

it('balances xparse optional brackets without applying that rule to legacy commands', () => {
  const service = createLatexLanguageService({
    files: {
      'main.tex': `${String.raw`\NewDocumentCommand{\pick}{o m}{#2}`}\n${String.raw`\pick[[x]]{}`}`,
    },
  })
  expect(service.getSignatureHelp('main.tex', 2, 12)).toMatchObject({ activeParameter: 1 })
  expect(service.getCompletionContext('main.tex', 2, 12)).toMatchObject({ signatureIndex: 1 })
})
