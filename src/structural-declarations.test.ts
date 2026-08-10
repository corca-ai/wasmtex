import { describe, expect, it } from 'vitest'
import { tokenize } from './lsp/latex-tokenizer'
import { collectRichStructuralDeclarations } from './structural-declarations'

describe('rich structural declarations', () => {
  it('preserves operator, delimiter, glossary, and acronym fields with exact source ranges', () => {
    const content = [
      '\\newcommand{\\estimate}[2][mean]{\\hat{#2}_{#1}}',
      '\\DeclareMathOperator*{\\ECE}{ECE}',
      '\\DeclarePairedDelimiter{\\norm}{\\lVert}{\\rVert}',
      '\\newglossaryentry{ece}{name={ECE},description={Expected, calibration error},plural={ECEs}}',
      '\\newacronym[shortplural={ECEs},description={A metric}]{ece}{ECE}{expected calibration error}',
    ].join('\n')
    const declarations = collectRichStructuralDeclarations(
      { fileId: 'main', path: 'main.tex', content },
      tokenize(content),
    )

    expect(declarations).toMatchObject([
      {
        kind: 'macro',
        name: 'estimate',
        parameters: 2,
        optionalDefault: 'mean',
        body: '\\hat{#2}_{#1}',
        state: 'complete',
      },
      {
        kind: 'operator',
        name: 'ECE',
        surface: 'ECE',
        limits: true,
        state: 'complete',
      },
      {
        kind: 'paired-delimiter',
        name: 'norm',
        left: '\\lVert',
        right: '\\rVert',
        state: 'complete',
      },
      {
        kind: 'glossary',
        key: 'ece',
        fields: [
          { name: 'name', value: 'ECE' },
          { name: 'description', value: 'Expected, calibration error' },
          { name: 'plural', value: 'ECEs' },
        ],
      },
      {
        kind: 'acronym',
        key: 'ece',
        short: 'ECE',
        long: 'expected calibration error',
        options: [
          { name: 'shortplural', value: 'ECEs' },
          { name: 'description', value: 'A metric' },
        ],
      },
    ])
    for (const declaration of declarations) {
      expect(
        content.slice(declaration.source.range.startOffset, declaration.source.range.endOffset),
      ).toMatch(/^\\/)
    }
  })

  it('keeps an incomplete declaration local and source-addressable', () => {
    const content = '\\newacronym{ece}{ECE}'
    const declarations = collectRichStructuralDeclarations(
      { fileId: 'main', path: 'main.tex', content },
      tokenize(content),
    )

    expect(declarations).toMatchObject([
      {
        kind: 'acronym',
        key: 'ece',
        short: 'ECE',
        long: '',
        state: 'incomplete',
        longSource: { range: { startOffset: content.length, endOffset: content.length } },
      },
    ])
  })

  it('ignores commented declarations instead of inventing static resources', () => {
    const content = '% \\newacronym{ece}{ECE}{expected calibration error}\nVisible'
    expect(
      collectRichStructuralDeclarations(
        { fileId: 'main', path: 'main.tex', content },
        tokenize(content),
      ),
    ).toEqual([])
  })
})
