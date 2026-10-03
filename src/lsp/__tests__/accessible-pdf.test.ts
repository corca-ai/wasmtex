import { describe, expect, test } from 'vitest'
import { accessiblePdfSourceDiagnostics, buildAccessiblePdfPreflight } from '../accessible-pdf'

function snapshot(main: string, extra: Record<string, string> = {}) {
  return {
    files: { 'main.tex': main, ...extra },
    mainFile: 'main.tex',
  }
}

describe('accessible PDF source diagnostics', () => {
  test('reports the missing parts of an existing metadata declaration', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': '\\DocumentMetadata{lang=en-US}\n\\documentclass{article}\n',
    })

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]).toMatchObject({
      code: 'a11y-incomplete-metadata',
      line: 1,
      severity: 'warning',
    })
    expect(diagnostics[0]?.message).toContain('PDF/UA-2')
    expect(diagnostics[0]?.message).not.toContain('language,')
  })

  test('does not require source metadata when export can inject it', () => {
    expect(
      accessiblePdfSourceDiagnostics({
        'main.tex': '\\documentclass{article}\n\\begin{document}Text\\end{document}',
      }).map(({ code }) => code),
    ).not.toContain('a11y-incomplete-metadata')
  })

  test('asks for review of math and data table structure', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\documentclass{article}',
        '\\begin{document}',
        '$E=mc^2$',
        '\\begin{tabular}{lr}A & B\\\\ 1 & 2\\end{tabular}',
        '\\end{document}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code }) => code)).toEqual([
      'a11y-math-structure-review',
      'a11y-table-headers-review',
    ])
  })

  test('flags skipped heading levels, undescribed figures, and generic links', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\documentclass{article}',
        '\\begin{document}',
        '\\section{Results}',
        '\\subsubsection{Details}',
        '\\includegraphics[width=3cm]{result}',
        '\\href{https://example.com/results}{Click here.}',
        '\\href{https://example.com/method}{Read more!}',
        '\\end{document}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code, line, severity }) => ({ code, line, severity }))).toEqual([
      { code: 'a11y-heading-order-review', line: 4, severity: 'info' },
      { code: 'a11y-figure-alt-review', line: 5, severity: 'info' },
      { code: 'a11y-link-purpose-review', line: 6, severity: 'info' },
      { code: 'a11y-link-purpose-review', line: 7, severity: 'info' },
    ])
  })

  test('accepts adjacent headings, figure accessibility options, and descriptive links', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\part{Study}',
        '\\section{Results}',
        '\\subsection{Details}',
        '\\includegraphics[alt={A curve, rising from left to right}]{curve}',
        '\\includegraphics[actualtext={Decorative separator}]{rule}',
        '\\includegraphics[artifact]{texture}',
        '\\href{https://example.com/results}{full experimental results}',
      ].join('\n'),
    })

    expect(diagnostics).toEqual([])
  })

  test('does not infer a skipped level from the first heading in an included file', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': '\\documentclass{article}\\begin{document}X\\end{document}',
      'sections/details.tex': '\\subsection{Imported details}',
    })

    expect(diagnostics).toEqual([])
  })

  test('checks starred heading commands without mistaking longer macro names', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\section*{Results}',
        '\\sectionnote{Not a standard heading}',
        '\\subsubsection*{Details}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code, line }) => ({ code, line }))).toEqual([
      { code: 'a11y-heading-order-review', line: 3 },
    ])
  })

  test('uses the full standard hierarchy for paragraph headings', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\subsection{Method}',
        '\\paragraph{Sampling}',
        '\\subsubsection{Analysis}',
        '\\subparagraph{Details}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code, line }) => ({ code, line }))).toEqual([
      { code: 'a11y-heading-order-review', line: 2 },
      { code: 'a11y-heading-order-review', line: 4 },
    ])
  })

  test('suppresses only the named rule on the next source item', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\section{Results}',
        '% wasmtex-ignore a11y-heading-order-review',
        '% The next heading is intentional.',
        '\\subsubsection{Details}',
        '% wasmtex-ignore a11y-figure-alt-review',
        '\\includegraphics{result} \\href{https://example.com}{more}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code, line }) => ({ code, line }))).toEqual([
      { code: 'a11y-link-purpose-review', line: 6 },
    ])
  })

  test('does not activate an ignore example inside a literal environment', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\begin{verbatim}',
        '% wasmtex-ignore a11y-figure-alt-review',
        '\\end{verbatim}',
        '\\includegraphics{result}',
      ].join('\n'),
    })

    expect(diagnostics.map(({ code }) => code)).toEqual(['a11y-figure-alt-review'])
  })

  test('masks examples inside starred verbatim environments', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\begin{verbatim*}',
        '\\includegraphics{x}',
        '% wasmtex-ignore a11y-link-purpose-review',
        '\\href{https://example.com}{read more!}',
        '\\end{verbatim*}',
      ].join('\n'),
    })

    expect(diagnostics).toEqual([])
  })

  test('recognizes an ignore directive in a CRLF file', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': ['% wasmtex-ignore a11y-figure-alt-review', '\\includegraphics{result}'].join(
        '\r\n',
      ),
    })

    expect(diagnostics).toEqual([])
  })

  test('uses the generic directive for an existing rule too', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '% wasmtex-ignore a11y-incomplete-metadata',
        '\\DocumentMetadata{lang=en-US}',
        '\\documentclass{article}',
      ].join('\n'),
    })

    expect(diagnostics).toEqual([])
  })

  test('accepts project-level MathML and table header setup', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '\\DocumentMetadata{lang=en,pdfversion=2.0,pdfstandard=ua-2,tagging=on,tagging-setup={math/setup=mathml-SE}}',
        '\\documentclass{article}',
        '\\tagpdfsetup{table/header-rows={1}}',
        '\\begin{document}$x$\\begin{tabular}{c}A\\end{tabular}\\end{document}',
      ].join('\n'),
    })

    expect(diagnostics).toEqual([])
  })

  test('does not let another standalone document suppress source reviews', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'configured.tex': '\\documentclass{article}\\tagpdfsetup{table/header-rows={1}}',
      'main.tex':
        '\\documentclass{article}\\begin{document}\\begin{tabular}{c}A\\end{tabular}\\end{document}',
    })

    expect(diagnostics.map(({ code }) => code)).toContain('a11y-table-headers-review')
  })

  test('ignores examples in comments and verbatim', () => {
    const diagnostics = accessiblePdfSourceDiagnostics({
      'main.tex': [
        '% \\DocumentMetadata{lang=en}',
        '\\documentclass{article}',
        '\\begin{verbatim}',
        '$x$ \\begin{tabular}{c} \\includegraphics{x}',
        '\\href{https://example.com}{click here}',
        '\\end{verbatim}',
      ].join('\n'),
    })

    expect(diagnostics).toEqual([])
  })
})

describe('accessible PDF preflight', () => {
  test('summarizes fixes, reviews, and engine compatibility separately', () => {
    const preflight = buildAccessiblePdfPreflight({
      engine: 'xelatex',
      snapshot: snapshot(
        '\\DocumentMetadata{lang=en}\n\\documentclass{article}\n\\begin{document}$x$\\end{document}',
      ),
    })

    expect(preflight.summary).toEqual({ compatibility: 1, fix: 1, review: 1 })
    expect(preflight.issues.at(-1)).toMatchObject({
      code: 'xelatex-compatibility',
      file: 'main.tex',
      ruleId: 'a11y-xelatex-compatibility',
    })
  })

  test('resolves the auto engine before assessing MathML support', () => {
    const xelatex = buildAccessiblePdfPreflight({
      engine: 'auto',
      snapshot: snapshot(
        '\\documentclass{article}\\usepackage{unicode-math}\\begin{document}$x$\\end{document}',
      ),
    })
    const lualatex = buildAccessiblePdfPreflight({
      engine: 'auto',
      snapshot: snapshot(
        '% !TEX program = lualatex\n\\documentclass{article}\\usepackage{unicode-math}\\begin{document}$x$\\end{document}',
      ),
    })

    expect(xelatex.issues.map(({ code }) => code)).toEqual([
      'math-structure-review',
      'xelatex-compatibility',
    ])
    expect(lualatex.issues.map(({ code }) => code)).not.toContain('math-structure-review')
  })

  test('warns before export for a known incompatible document class', () => {
    const preflight = buildAccessiblePdfPreflight({
      engine: 'pdflatex',
      snapshot: snapshot('\\documentclass{beamer}\\begin{document}X\\end{document}'),
    })

    expect(preflight.issues).toContainEqual(
      expect.objectContaining({
        code: 'document-class-compatibility',
        documentClass: 'beamer',
        support: 'unsupported',
      }),
    )
  })
})

test('rejects empty or bare alt and false artifact while preserving actualtext', () => {
  for (const option of ['alt', 'alt={}', 'actualtext={ }', 'artifact=false']) {
    expect(
      accessiblePdfSourceDiagnostics({ 'main.tex': `\\includegraphics[${option}]{plot}` }),
    ).toMatchObject([{ code: 'a11y-figure-alt-review' }])
  }
  expect(
    accessiblePdfSourceDiagnostics({ 'main.tex': '\\includegraphics[actualtext={A}]{plot}' }),
  ).toEqual([])
})

test('lets a host supply its directive without leaking host names into SDK behavior', () => {
  const files = { 'main.tex': '% cortex-ignore a11y-figure-alt-review\n\\includegraphics{plot}' }
  expect(accessiblePdfSourceDiagnostics(files)).toHaveLength(1)
  expect(accessiblePdfSourceDiagnostics(files, { ignoreDirective: 'cortex-ignore' })).toEqual([])
})
