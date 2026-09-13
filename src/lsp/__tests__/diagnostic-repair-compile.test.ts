import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'
import { undefinedCommandEvidence } from '../diagnostic-repair-compile'

function evidence(files: Record<string, string>, log: string, root = 'main.tex') {
  const service = createLatexLanguageService({ files, mainFile: root })
  return undefinedCommandEvidence(
    log,
    service.getVirtualFileSystem(),
    service.getProjectIndex(),
    root,
  )
}

describe('direct undefined-command compile evidence', () => {
  it('matches the math-mode recently-read token to the literal source command', () => {
    const files = { 'main.tex': '$\\dfrac{1}{2}$' }
    const log =
      '(./main.tex\n! Undefined control sequence.\n<recently read> \\dfrac \n                     \nl.1 $\\dfrac\n           {1}{2}$\n)'
    expect(evidence(files, log)[0]?.command).toBe('dfrac')
    expect(
      evidence(files, log.replace('<recently read> \\dfrac', '<recently read> \\different')),
    ).toEqual([])
  })
  it('anchors a direct error to the exact command, including an included file', () => {
    const sites = evidence(
      {
        'main.tex': String.raw`\input{child}`,
        'child.tex': 'Before\nSee \\includegraphics{plot.pdf}',
      },
      '(./main.tex\n(./child.tex\n! Undefined control sequence.\nl.2 See \\includegraphics\n                         {plot.pdf}\n)\n)',
    )
    expect(sites).toEqual([
      {
        code: 'undefined-control-sequence',
        file: 'child.tex',
        command: 'includegraphics',
        range: { startOffset: 11, endOffset: 27 },
        expectedText: '\\includegraphics',
        evidence: 'direct-engine-error-context',
      },
    ])
  })

  it('distinguishes repeated commands on one line by the engine prefix', () => {
    const source = String.raw`\includegraphics{a} \includegraphics{b}`
    const sites = evidence(
      { 'main.tex': source },
      `(./main.tex\n! Undefined control sequence.\nl.1 ${source.slice(0, source.lastIndexOf('{'))}\n)`,
    )
    expect(sites[0]?.range.startOffset).toBe(source.lastIndexOf('\\includegraphics'))
  })

  it('refuses expansion contexts, absent file context and truncated or mismatched source', () => {
    const files = { 'main.tex': String.raw`\includegraphics{x}` }
    for (const log of [
      '! Undefined control sequence.\nl.1 \\includegraphics\n',
      '(./main.tex\n! Undefined control sequence.\n\\wrapper ->\\includegraphics\nl.1 \\includegraphics\n)',
      '(./main.tex\n! Undefined control sequence.\nl.1 ...\\includegraphics\n)',
      '(./main.tex\n! Undefined control sequence.\nl.1 other \\includegraphics\n)',
      '(./main.tex\n! Undefined control sequence.\nl.1 \\include\n)',
    ])
      expect(evidence(files, log)).toEqual([])
  })

  it('refuses inactive roots, template definitions, comments and verbatim', () => {
    for (const source of [
      String.raw`% \includegraphics`,
      String.raw`\verb|\includegraphics|`,
      String.raw`\newcommand{\foo}{\includegraphics}`,
      String.raw`\iffalse\includegraphics\fi`,
    ]) {
      const prefix = source.slice(0, source.indexOf('includegraphics') + 'includegraphics'.length)
      expect(
        evidence(
          { 'main.tex': source },
          `(./main.tex\n! Undefined control sequence.\nl.1 ${prefix}\n)`,
        ),
      ).toEqual([])
    }
    expect(
      evidence(
        { 'main.tex': '', 'other.tex': '\\includegraphics' },
        '(./other.tex\n! Undefined control sequence.\nl.1 \\includegraphics\n)',
      ),
    ).toEqual([])
  })
})
