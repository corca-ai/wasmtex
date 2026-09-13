import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'

function fixture(source: string, selected: string, files: Record<string, string> = {}) {
  const service = createLatexLanguageService({ files: { ...files, 'main.tex': source } })
  const startOffset = source.indexOf(selected)
  if (startOffset < 0) throw new Error('Selection absent')
  const range = { startOffset, endOffset: startOffset + selected.length }
  return {
    service,
    range,
    options: () => service.getWrapOptions('main.tex', range),
    plan: (
      name: string,
      args: readonly (string | null)[] = [null],
      kind: 'command' | 'environment' = 'command',
    ) => service.planWrapSelection('main.tex', { range, kind, name, arguments: args }),
  }
}

describe('reviewable wrapping', () => {
  it('preserves Unicode and CRLF bytes in a command argument', () => {
    const f = fixture('Before 한글 😀\r\nsecond after', '한글 😀\r\nsecond')
    expect(f.plan('emph')).toEqual({
      ok: true,
      edit: {
        range: f.range,
        expectedText: '한글 😀\r\nsecond',
        newText: '\\emph{한글 😀\r\nsecond}',
      },
    })
    expect(f.service.getFile('main.tex')).toBe('Before 한글 😀\r\nsecond after')
  })
  it('offers matching contexts and requires the denominator explicitly', () => {
    const f = fixture('$x+y$', 'x+y')
    expect(f.plan('frac', [null, null])).toEqual({ ok: false, reason: 'missing-argument' })
    expect(f.plan('frac', [null, '2'])).toMatchObject({
      ok: true,
      edit: { newText: '\\frac{x+y}{2}' },
    })
    expect(f.plan('sqrt', [null, null])).toMatchObject({
      ok: true,
      edit: { newText: '\\sqrt{x+y}' },
    })
    expect(f.plan('sqrt', ['3', null])).toMatchObject({
      ok: true,
      edit: { newText: '\\sqrt[3]{x+y}' },
    })
    expect(f.plan('frac', [null, 'y^2+\\sqrt{z}'])).toMatchObject({
      ok: true,
      edit: { newText: '\\frac{x+y}{y^2+\\sqrt{z}}' },
    })
    expect(f.plan('frac', [null, 'y^'])).toMatchObject({ ok: false })
    expect(f.plan('frac', [null, '}evil{'])).toMatchObject({ ok: false })
    expect(f.plan('emph')).toEqual({ ok: false, reason: 'unknown-wrapper' })
    expect(fixture('words', 'words').plan('frac', [null, '2'])).toEqual({
      ok: false,
      reason: 'unknown-wrapper',
    })
  })
  it('wraps complete nested source and environment bodies without mutating', () => {
    const f = fixture(
      '\\begin{document}\\begin{quote}Hello \\emph{world}\\end{quote}\\end{document}',
      'Hello \\emph{world}',
    )
    expect(f.plan('center', [], 'environment')).toMatchObject({
      ok: true,
      edit: { newText: '\\begin{center}\nHello \\emph{world}\n\\end{center}' },
    })
    expect(fixture('\\textbf{alpha beta}', 'alpha').plan('emph')).toMatchObject({ ok: true })
  })
  it.each([
    ['\\textbf{word}', 'textbf'],
    ['\\textbf{word}', '{wor'],
    ['\\textbf{word}', '\\textbf'],
    ['\\textbf{word', 'word'],
    ['word}', 'word'],
    ['% words\nnext', 'words'],
    ['\\verb|words|', 'words'],
    ['\\iffalse words\\fi', 'words'],
    ['\\newcommand{\\a}{words}', 'words'],
    ['\\begin{quote}words', 'words'],
    ['\\begin{quote}words\\end{center}', 'words'],
    ['\\begin{quote}words\\end{quote}', '\\begin{quote}words'],
    ['\\unknown{words}', 'words'],
    ['\\textbf words', 'words'],
    ['\\unknown words', 'words'],
    ['\\label{words}', 'words'],
    ['$x^2+y$', 'x^'],
    ['$x^2+y$', '2'],
    ['$x+y$', '$x'],
    ['$x+y', 'x+y'],
    ['\\begin{equation}x+y\\end{equation}', 'equation'],
  ])('refuses an uncertain selection in %s', (source, selection) => {
    expect(fixture(source, selection).options().ok).toBe(false)
  })
  it('rejects redefined wrapper metadata and retracts package-scoped environments', () => {
    const f = fixture('\\input{defs}\nwords', 'words', {
      'defs.tex': '\\renewcommand{\\emph}[1]{#1}',
    })
    expect(f.plan('emph').ok).toBe(false)
    const g = fixture('\\usepackage{amsmath}\n$x+y$', 'x+y')
    expect(g.plan('aligned', [], 'environment').ok).toBe(true)
    g.service.updateFile('main.tex', `${' '.repeat('\\usepackage{amsmath}'.length)}\n$x+y$`)
    expect(g.plan('aligned', [], 'environment').ok).toBe(false)
  })
  it('never treats uncertain declarations as zero-argument calls or environment arguments as text', () => {
    const source = '\\renewcommand{\\textbf}[1]{#1}\\textbf{word}'
    const f = fixture(source, 'word')
    const startOffset = source.lastIndexOf('\\textbf')
    expect(
      f.service.getWrapOptions('main.tex', { startOffset, endOffset: startOffset + 7 }).ok,
    ).toBe(false)
    expect(fixture('\\DeclareRobustCommand{\\emph}[2]{#2} words', 'words').plan('emph').ok).toBe(
      false,
    )
    expect(fixture('\\begin{tabular}{cc}a&b\\\\\\end{tabular}', 'cc').options().ok).toBe(false)
    expect(fixture('\\begin{minipage}{10cm}words\\end{minipage}', '10cm').options().ok).toBe(false)
  })
  it('every advertised command consumes the selection exactly once', () => {
    for (const source of ['words', '$words$']) {
      const f = fixture(source, 'words')
      const result = f.options()
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      for (const option of result.options) {
        const args = option.arguments.map((argument, index) =>
          index === option.selectionArgument || argument.kind === 'optional' ? null : '2',
        )
        const plan = f.plan(option.name, args, option.kind)
        expect(plan.ok).toBe(true)
        if (plan.ok) expect(plan.edit.newText.split('words')).toHaveLength(2)
      }
    }
  })
  it('bounds explicit wrap queries on deeply nested source using indexed group reads', () => {
    const source = `${'\\textbf{'.repeat(10000)}word${'}'.repeat(10000)}`
    const f = fixture(source, 'word')
    const started = performance.now()
    expect(f.options().ok).toBe(true)
    expect(performance.now() - started).toBeLessThan(250)
  })
  it('keeps text blocks out of math and scopes unsupported environment options to their own region', () => {
    const quote = '\\begin{quote}words\\end{quote}'
    expect(fixture(quote, quote).plan('equation', [], 'environment').ok).toBe(false)
    expect(fixture('$x$', 'x').plan('frac', [null, quote]).ok).toBe(false)
    expect(
      fixture('\\usepackage{amsmath} words $\\begin{aligned}[t]x&=y\\end{aligned}$', 'words').plan(
        'emph',
      ).ok,
    ).toBe(true)
    expect(
      fixture('\\begin{equation}x+y\\end{equation}', 'x+y').plan('sqrt', [null, null]).ok,
    ).toBe(true)
  })
  it('keeps explicit math islands editable inside text environments', () => {
    expect(
      fixture('\\begin{quote}Inline $x+y$ text\\end{quote}', 'x+y').plan('sqrt', [null, null]),
    ).toMatchObject({ ok: true, edit: { newText: '\\sqrt{x+y}' } })
  })
  it('rejects cancellation, invalid offsets and splitting a Unicode surrogate', () => {
    const f = fixture('😀 words', 'words')
    expect(
      f.service.getWrapOptions('main.tex', f.range, { isCancellationRequested: true }),
    ).toEqual({ ok: false, reason: 'cancelled' })
    for (const range of [
      { startOffset: 1, endOffset: 2 },
      { startOffset: 0, endOffset: 0 },
      { startOffset: -1, endOffset: 2 },
      { startOffset: 0, endOffset: 100 },
    ]) {
      expect(f.service.getWrapOptions('main.tex', range)).toEqual({
        ok: false,
        reason: 'invalid-range',
      })
    }
  })
})
