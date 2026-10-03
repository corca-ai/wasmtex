import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'

const document = (preamble = '') => String.raw`\documentclass{article}
\title{A study of α \& β}
\author{Ada Lovelace}
${preamble}
\begin{document}
\maketitle
\end{document}`

async function repair(text: string, extra: Record<string, string> = {}) {
  const service = createLatexLanguageService({ files: { 'main.tex': text, ...extra } })
  const result = await service.getDiagnosticRepairs('main.tex', text.indexOf('documentclass'))
  if (!result.ok) throw new Error(result.reason)
  return { service, proposal: result.proposals.find((value) => value.kind === 'pdf-metadata') }
}

describe('reviewed PDF metadata repair', () => {
  it('copies literal Unicode and escaped punctuation without changing the source', async () => {
    const text = document()
    const { service, proposal } = await repair(text)
    expect(proposal).toMatchObject({
      kind: 'pdf-metadata',
      metadata: { pdftitle: String.raw`A study of α \& β`, pdfauthor: 'Ada Lovelace' },
    })
    expect(proposal?.edits[0]?.newText).toBe(String.raw`\usepackage{hyperref}
\hypersetup{pdftitle={A study of α \& β}, pdfauthor={Ada Lovelace}}
`)
    expect(service.getFile('main.tex')).toBe(text)
    expect(await service.planDiagnosticRepair(proposal!)).toEqual({
      ok: true,
      edits: proposal!.edits,
    })
  })

  it('preserves existing title and adds only the missing author', async () => {
    const { proposal } = await repair(
      document(String.raw`\usepackage{hyperref}
\hypersetup{pdftitle={Submission title}}`),
    )
    expect(proposal?.metadata).toEqual({ pdfauthor: 'Ada Lovelace' })
    expect(proposal?.edits[0]?.newText).toBe('\\hypersetup{pdfauthor={Ada Lovelace}}\n')
    expect(
      (await repair(document(String.raw`\hypersetup{pdftitle={},pdfauthor={Other}}`))).proposal,
    ).toBeUndefined()
  })

  it('refuses stale, tampered, cancelled and replaced-root proposals', async () => {
    const { service, proposal } = await repair(document(), { 'other.tex': document() })
    expect(proposal).toBeDefined()
    const changed = structuredClone(proposal!)
    changed.edits[0]!.newText = '\\input{unreviewed}'
    expect(await service.planDiagnosticRepair(changed)).toEqual({ ok: false, reason: 'stale' })
    expect(
      await service.planDiagnosticRepair(proposal!, { isCancellationRequested: true }),
    ).toEqual({ ok: false, reason: 'cancelled' })
    service.updateFile('main.tex', `${document()}\n% edited`)
    expect(await service.planDiagnosticRepair(proposal!)).toEqual({ ok: false, reason: 'stale' })
    service.setMainFile('other.tex')
    expect(await service.planDiagnosticRepair(proposal!)).toEqual({ ok: false, reason: 'stale' })
  })

  it('does not expand macros or treat comments, literal examples and redefinitions as metadata', async () => {
    for (const title of [
      String.raw`\title{\mytitle}`,
      String.raw`\newcommand{\title}[1]{}\title{X}`,
      String.raw`\title{A $x$}`,
      String.raw`\title{}`,
      String.raw`\title{A}\hypersetup{\ownedmetadata}`,
    ]) {
      const text = `\\documentclass{article}\n${title}\n\\begin{document}X\\end{document}`
      expect((await repair(text)).proposal).toBeUndefined()
    }
    const text = document('% \\hypersetup{pdftitle={Comment}}\n\\verb|pdfauthor=ignored|')
    expect((await repair(text)).proposal?.metadata).toHaveProperty('pdftitle')
    expect(
      (
        await repair(document(String.raw`\input{settings}`), {
          'settings.tex': String.raw`\hypersetup{pdftitle={Owned},pdfauthor={Owned}}`,
        })
      ).proposal,
    ).toBeUndefined()
  })

  it('preserves CRLF and is idempotent after application and reanalysis', async () => {
    const text = document().replaceAll('\n', '\r\n')
    const { service, proposal } = await repair(text)
    expect(proposal?.edits[0]?.newText).not.toMatch(/(?<!\r)\n/)
    const edit = proposal!.edits[0]!
    service.updateFile(
      'main.tex',
      text.slice(0, edit.range.startOffset) + edit.newText + text.slice(edit.range.endOffset),
    )
    const result = await service.getDiagnosticRepairs('main.tex', 1)
    expect(result).toEqual({ ok: true, proposals: [] })
  })
})
