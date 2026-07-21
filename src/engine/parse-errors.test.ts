import { describe, expect, it } from 'vitest'
import { buildDiagnostics, buildFileContext, parseGlyphGaps, parseTexErrors } from './parse-errors'

describe('parseTexErrors', () => {
  it('returns empty array for clean log', () => {
    const log = 'This is the output log.\nNo errors here.\n'
    expect(parseTexErrors(log)).toEqual([])
  })

  it('parses a TeX error with line number', () => {
    const log = ['! Undefined control sequence.', 'l.42 \\badcommand', ''].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toEqual([
      { line: 42, message: 'Undefined control sequence.', severity: 'error' },
    ])
  })

  it('parses a TeX error without line number', () => {
    const log = '! Emergency stop.\n\n'
    const errors = parseTexErrors(log)
    expect(errors).toEqual([{ line: 0, message: 'Emergency stop.', severity: 'error' }])
  })

  it('parses multiple errors', () => {
    const log = [
      '! Undefined control sequence.',
      'l.10 \\foo',
      '',
      '! Missing $ inserted.',
      'l.20 some text',
      '',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(2)
    expect(errors[0]!.line).toBe(10)
    expect(errors[1]!.line).toBe(20)
  })

  it('parses LaTeX warnings with line numbers', () => {
    const log = "LaTeX Warning: Reference `fig:missing' on input line 15 undefined.\n"
    const errors = parseTexErrors(log)
    expect(errors).toEqual([
      {
        line: 15,
        message: "Reference `fig:missing' on input line 15 undefined.",
        severity: 'warning',
      },
    ])
  })

  it('parses LaTeX warnings without line numbers', () => {
    const log = 'LaTeX Warning: There were undefined references.\n'
    const errors = parseTexErrors(log)
    expect(errors).toEqual([
      { line: 0, message: 'There were undefined references.', severity: 'warning' },
    ])
  })

  it('parses mixed errors and warnings', () => {
    const log = [
      '! Undefined control sequence.',
      'l.5 \\badcmd',
      '',
      "LaTeX Warning: Citation `foo' on input line 12 undefined.",
      '',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(2)
    expect(errors[0]!.severity).toBe('error')
    expect(errors[1]!.severity).toBe('warning')
  })

  it('handles empty log', () => {
    expect(parseTexErrors('')).toEqual([])
  })

  it('finds line number within 5-line lookahead window', () => {
    const log = [
      '! Missing $ inserted.',
      '<inserted text>',
      '                $',
      'l.99 some math here',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors[0]!.line).toBe(99)
  })

  it('parses overfull hbox warning with line range', () => {
    const log = ['Overfull \\hbox (15.0pt too wide) in paragraph at lines 10--15', ' [] '].join(
      '\n',
    )

    const errors = parseTexErrors(log)
    expect(errors).toEqual([
      {
        line: 10,
        message: 'Overfull \\hbox (15.0pt too wide) in paragraph at lines 10--15',
        severity: 'warning',
      },
    ])
  })

  it('ignores underfull warnings (rarely actionable)', () => {
    const log = [
      'Underfull \\vbox (badness 10000) has occurred while \\output is active',
      ' [] at line 42',
      'Underfull \\hbox (badness 1215) in paragraph at lines 10--15',
      ' [] ',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toEqual([])
  })

  it('parses overfull hbox without line number', () => {
    const log = 'Overfull \\hbox (3.5pt too wide) detected\n\n'

    const errors = parseTexErrors(log)
    expect(errors).toEqual([
      {
        line: 0,
        message: 'Overfull \\hbox (3.5pt too wide) detected',
        severity: 'warning',
      },
    ])
  })

  it('parses box warnings alongside errors', () => {
    const log = [
      '! Undefined control sequence.',
      'l.5 \\badcmd',
      '',
      'Overfull \\hbox (10.0pt too wide) in paragraph at lines 20--25',
      ' [] ',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(2)
    expect(errors[0]!.severity).toBe('error')
    expect(errors[0]!.line).toBe(5)
    expect(errors[1]!.severity).toBe('warning')
    expect(errors[1]!.line).toBe(20)
  })

  it('parses package error with line number', () => {
    const log = 'Package amsmath Error: Multiple \\tag on input line 42.\n'
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.severity).toBe('error')
    expect(errors[0]!.line).toBe(42)
    expect(errors[0]!.message).toContain('[amsmath]')
    expect(errors[0]!.message).toContain('Multiple \\tag')
  })

  it('parses package error with lookahead line number', () => {
    const log = ['Package hyperref Error: No driver specified.', 'l.10 \\begin{document}'].join(
      '\n',
    )
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.line).toBe(10)
  })

  it('parses package warning', () => {
    const log = 'Package natbib Warning: Citation `foo` undefined on input line 15.\n'
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.severity).toBe('warning')
    expect(errors[0]!.line).toBe(15)
    expect(errors[0]!.message).toContain('[natbib]')
  })

  it('parses package warning without line number', () => {
    const log = 'Package hyperref Warning: Rerun to get /PageLabels entry.\n'
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.severity).toBe('warning')
    expect(errors[0]!.line).toBe(0)
  })

  it('drops the benign epstopdf shell-escape warning (#169)', () => {
    // acmart/graphicx emit this at load even with no EPS; shell escape can never be on in
    // the WASM engine, so it is noise a consumer would misread as "needs shell-escape".
    const log = 'Package epstopdf Warning: Shell escape feature is not enabled.\n'
    expect(parseTexErrors(log)).toHaveLength(0)
  })

  it('keeps a real epstopdf warning that is not the shell-escape tautology', () => {
    const log = 'Package epstopdf Warning: Live example not available.\n'
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('[epstopdf]')
  })

  it('still surfaces minted’s real -shell-escape demand', () => {
    // The epstopdf filter must not swallow genuine shell-escape signals from other packages.
    const log = 'Package minted Warning: You must invoke LaTeX with the -shell-escape flag.\n'
    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain('[minted]')
    expect(errors[0]!.message).toContain('-shell-escape')
  })

  it('tracks file context from parenthesized paths', () => {
    const log = [
      'This is pdfTeX, Version 1.40.22',
      '(./main.tex',
      "LaTeX Warning: Reference `sec:foo' on input line 67 undefined.",
      '(./algebra.tex',
      '! Undefined control sequence.',
      'l.5 \\badcmd',
      ')',
      "LaTeX Warning: Reference `sec:bar' on input line 100 undefined.",
      ')',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(3)
    expect(errors[0]).toMatchObject({ file: 'main.tex', line: 67 })
    expect(errors[1]).toMatchObject({ file: 'algebra.tex', line: 5 })
    expect(errors[2]).toMatchObject({ file: 'main.tex', line: 100 })
  })

  it('normalizes /work/./ paths in file context', () => {
    const log = ['(/work/./main.tex', '! Missing $ inserted.', 'l.10 x', ')'].join('\n')

    const errors = parseTexErrors(log)
    expect(errors[0]).toMatchObject({ file: 'main.tex', line: 10 })
  })

  it('handles multiple file opens on a single line', () => {
    const log = [
      '(./main.tex(/usr/share/texlive/tex/latex/base/article.cls)',
      '(./chapter.tex',
      '! Error.',
      'l.3 x',
      '))',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors[0]).toMatchObject({ file: 'chapter.tex', line: 3 })
  })

  it('does not treat non-file parentheses as file opens', () => {
    const log = [
      '(./main.tex',
      'Overfull \\hbox (10.0pt too wide) in paragraph at lines 5--8',
      ' [] ',
      ')',
    ].join('\n')

    const errors = parseTexErrors(log)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatchObject({ file: 'main.tex', line: 5 })
  })
})

describe('buildFileContext', () => {
  it('tracks nested file opens and closes', () => {
    const lines = [
      '(./main.tex',
      'some content',
      '(./sub.tex',
      'sub content',
      ')',
      'back in main',
      ')',
    ]
    const ctx = buildFileContext(lines)
    expect(ctx[0]).toBe('main.tex')
    expect(ctx[1]).toBe('main.tex')
    expect(ctx[2]).toBe('sub.tex')
    expect(ctx[3]).toBe('sub.tex')
    expect(ctx[4]).toBe('main.tex')
    expect(ctx[5]).toBe('main.tex')
    expect(ctx[6]).toBe('')
  })

  it('returns empty string when no file context', () => {
    const lines = ['This is pdfTeX', 'No files here']
    const ctx = buildFileContext(lines)
    expect(ctx[0]).toBe('')
    expect(ctx[1]).toBe('')
  })

  it('handles system file paths', () => {
    const sysPath = '/usr/share/texlive/texmf-dist/tex/latex/base/article.cls'
    const lines = ['(./main.tex', `(${sysPath}`, 'class content', ')', 'back in main']
    const ctx = buildFileContext(lines)
    expect(ctx[0]).toBe('main.tex')
    expect(ctx[1]).toBe(sysPath)
    expect(ctx[2]).toBe(sysPath)
    expect(ctx[3]).toBe('main.tex')
    expect(ctx[4]).toBe('main.tex')
  })

  it('keeps a system absolute path with an internal /./ absolute (does not truncate to a tail)', () => {
    // A `/./` anywhere in an ABSOLUTE system path must not be treated like the project
    // `/work/./` prefix — truncating to the tail (`tex/latex/base/article.cls`) would
    // mis-attribute a system-file diagnostic to a phantom project file.
    const sysPath = '/usr/local/texlive/2025/texmf-dist/./tex/latex/base/article.cls'
    const lines = ['(./main.tex', `(${sysPath}`, 'class content', ')', 'back in main']
    const ctx = buildFileContext(lines)
    expect(ctx[1]).toBe('/usr/local/texlive/2025/texmf-dist/tex/latex/base/article.cls')
    expect(ctx[1]!.startsWith('/')).toBe(true)
  })
})

describe('parseTexErrors — real-world pdfTeX log fixtures', () => {
  it('attributes an undefined control sequence to its included file + line', () => {
    const log = [
      '(./main.tex',
      'LaTeX2e <2023-11-01>',
      '(/usr/share/texlive/article.cls',
      'Document Class: article)',
      '(./sections/intro.tex',
      '! Undefined control sequence.',
      'l.7 \\badmacro',
      '              {arg}',
      ')',
      'Overfull \\hbox (15.0pt too wide) in paragraph at lines 42--43',
      '[1] )',
      'Output written on main.pdf (1 page).',
    ].join('\n')
    expect(parseTexErrors(log)).toEqual([
      {
        line: 7,
        message: 'Undefined control sequence.',
        severity: 'error',
        file: 'sections/intro.tex',
      },
      {
        line: 42,
        message: 'Overfull \\hbox (15.0pt too wide) in paragraph at lines 42--43',
        severity: 'warning',
        file: 'main.tex',
      },
    ])
  })

  it('parses a multi-line LaTeX error and finds its l.<n> line', () => {
    const log = [
      '(./main.tex',
      '! LaTeX Error: Environment foo undefined.',
      '',
      'See the LaTeX manual or LaTeX Companion for explanation.',
      'l.15 \\begin{foo}',
      ')',
    ].join('\n')
    expect(parseTexErrors(log)).toEqual([
      {
        line: 15,
        message: 'LaTeX Error: Environment foo undefined.',
        severity: 'error',
        file: 'main.tex',
      },
    ])
  })

  it('attributes a package warning to the right file after a nested open', () => {
    const log = [
      '(./main.tex (./refs.tex',
      'Package natbib Warning: Citation `foo` on input line 9 undefined.',
      '))',
    ].join('\n')
    expect(parseTexErrors(log)).toEqual([
      {
        line: 9,
        message: '[natbib] Citation `foo` on input line 9 undefined.',
        severity: 'warning',
        file: 'refs.tex',
      },
    ])
  })
})

describe('missing-package classification (issue #62)', () => {
  it("tags a missing .sty as a 'missing-package' with an actionable message", () => {
    const log = "! LaTeX Error: File `xetexko.sty' not found.\n\n"
    const [err] = parseTexErrors(log)
    expect(err?.code).toBe('missing-package')
    expect(err?.severity).toBe('error')
    expect(err?.message).toContain('package `xetexko`')
    expect(err?.message).toContain('not on the bundled TeX Live mirror')
  })

  it('labels a missing .cls as a class', () => {
    const log = "! LaTeX Error: File `fancybook.cls' not found.\n\n"
    const [err] = parseTexErrors(log)
    expect(err?.code).toBe('missing-package')
    expect(err?.message).toContain('class `fancybook`')
  })

  it('does NOT tag a non-package missing file (e.g. an image)', () => {
    const log = "! LaTeX Error: File `logo.png' not found.\n\n"
    const [err] = parseTexErrors(log)
    expect(err?.code).toBeUndefined()
    expect(err?.message).toBe("LaTeX Error: File `logo.png' not found.")
  })

  it('leaves ordinary errors unclassified', () => {
    const log = '! Undefined control sequence.\nl.42 \\badcommand\n'
    const [err] = parseTexErrors(log)
    expect(err?.code).toBeUndefined()
  })
})

describe('font-not-found classification (issue #61)', () => {
  it("tags fontspec's 'font cannot be found' (name on a following line)", () => {
    const log = [
      '! Package fontspec Error: The font "Latin Modern Roman" cannot be found.',
      '',
      '(fontspec)                The font "Latin Modern Roman" cannot be found;',
      '(fontspec)                this can happen if the font name is misspelled.',
      'l.4 \\setmainfont{Latin Modern Roman}',
      '',
    ].join('\n')
    const [err] = parseTexErrors(log)
    expect(err?.code).toBe('font-not-found')
    expect(err?.severity).toBe('error')
    expect(err?.message).toContain('Latin Modern Roman')
    expect(err?.message).toContain('by filename')
    expect(err?.message).toContain('XeLaTeX')
  })

  it('tags the bare-header form where only the lookahead line names the font', () => {
    const log = [
      '! Package fontspec Error:',
      '(fontspec)                The font "TeX Gyre Termes" cannot be found.',
      'l.10 \\setmainfont{TeX Gyre Termes}',
      '',
    ].join('\n')
    const [err] = parseTexErrors(log)
    expect(err?.code).toBe('font-not-found')
    expect(err?.message).toContain('TeX Gyre Termes')
  })

  it('does NOT tag an unrelated fontspec error', () => {
    const log = [
      '! Package fontspec Error: The fontspec package requires either XeTeX or LuaTeX.',
      'l.1 \\usepackage',
      '',
    ].join('\n')
    const [err] = parseTexErrors(log)
    expect(err?.code).toBeUndefined()
  })
})

describe('parseGlyphGaps (#89)', () => {
  const KOREAN_IN_JP_FONT = [
    'Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!',
    'Missing character: There is no 녕 (U+B155) in font [HaranoAjiMincho-Regular.otf]!',
    'Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!',
  ].join('\n')

  it('returns nothing for a clean log', () => {
    expect(parseGlyphGaps('all good\nOutput written on main.pdf')).toEqual([])
  })

  it('groups missing characters per font with codepoints, count and script', () => {
    const gaps = parseGlyphGaps(KOREAN_IN_JP_FONT)
    expect(gaps).toHaveLength(1)
    const g = gaps[0]!
    expect(g.font).toBe('HaranoAjiMincho-Regular.otf')
    expect(g.codepoints).toEqual([0xb155, 0xc548]) // distinct, sorted
    expect(g.count).toBe(3) // includes the duplicate 안
    expect(g.script).toBe('Hangul')
    expect(g.sample).toContain('안')
  })

  it('separates gaps by font', () => {
    const log = [
      'Missing character: There is no 안 (U+C548) in font [JpFont.otf]!',
      'Missing character: There is no A (U+0041) in font [OtherFont.otf]!',
    ].join('\n')
    const fonts = parseGlyphGaps(log)
      .map((g) => g.font)
      .sort()
    expect(fonts).toEqual(['JpFont.otf', 'OtherFont.otf'])
  })

  it('ignores an out-of-range codepoint without throwing', () => {
    const log = [
      'Missing character: There is no ? (U+110000) in font [Bad.otf]!', // > 0x10FFFF
      'Missing character: There is no A (U+0041) in font [Bad.otf]!',
    ].join('\n')
    expect(() => parseGlyphGaps(log)).not.toThrow()
    const g = parseGlyphGaps(log)[0]!
    expect(g.codepoints).toEqual([0x41]) // the invalid one is dropped
  })

  it('handles the pdfTeX/LuaTeX form without (U+XXXX)', () => {
    const gaps = parseGlyphGaps('Missing character: There is no Z in font cmr10!')
    expect(gaps).toHaveLength(1)
    expect(gaps[0]!.codepoints).toEqual([0x5a]) // 'Z'
    expect(gaps[0]!.font).toBe('cmr10')
  })

  it('decodes pdfTeX ^^ hat notation (no U+) to the real codepoint', () => {
    // pdfTeX renders an 8-bit/unprintable missing byte as `^^xx` (hex) or `^^X` (control),
    // not as the literal char — so the codepoint must be decoded, not read as '^'.
    const hex = parseGlyphGaps('Missing character: There is no ^^c0 in font cmr10!')
    expect(hex).toHaveLength(1)
    expect(hex[0]!.codepoints).toEqual([0xc0])
    expect(hex[0]!.font).toBe('cmr10')

    const ctrl = parseGlyphGaps('Missing character: There is no ^^I in font cmr10!')
    expect(ctrl[0]!.codepoints).toEqual([0x09]) // tab: 'I' (0x49) XOR 0x40
  })

  it('parseTexErrors surfaces one missing-glyph warning per font (non-error)', () => {
    const errs = parseTexErrors(KOREAN_IN_JP_FONT)
    const glyphWarnings = errs.filter((e) => e.code === 'missing-glyph')
    expect(glyphWarnings).toHaveLength(1)
    expect(glyphWarnings[0]!.severity).toBe('warning')
    expect(glyphWarnings[0]!.message).toContain('HaranoAjiMincho-Regular.otf')
    expect(glyphWarnings[0]!.message).toContain('Hangul')
  })
})

describe('buildDiagnostics (#54 telemetry)', () => {
  const codes = (log: string) => buildDiagnostics(log).map((d) => d.code)

  it('classifies undefined references and citations', () => {
    const log = [
      "LaTeX Warning: Reference `fig:1' on page 1 undefined on input line 5.",
      "LaTeX Warning: Citation `knuth' on page 1 undefined on input line 6.",
    ].join('\n')
    expect(codes(log)).toEqual(['undefined-reference', 'undefined-citation'])
  })

  it('flags rerun-needed as informational', () => {
    const log = 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.'
    const [d] = buildDiagnostics(log)
    expect(d?.code).toBe('rerun-needed')
    expect(d?.severity).toBe('info')
  })

  it('classifies overfull boxes (underfull is intentionally ignored upstream)', () => {
    const log = 'Overfull \\hbox (15.0pt too wide) in paragraph at lines 10--15'
    expect(codes(log)).toEqual(['overfull-box'])
  })

  it('keeps missing-package / font-not-found codes from annotations', () => {
    const pkg = "! LaTeX Error: File `foo.sty' not found.\nl.2 \\usepackage{foo}\n"
    expect(buildDiagnostics(pkg)[0]?.code).toBe('missing-package')
  })

  it('classifies package errors in both the `! Package` and bare forms', () => {
    // `! Package X Error:` reaches classify via tryTexError (raw message)...
    const bang = '! Package amsmath Error: Multiple \\tag.\nl.42 \\tag{x}\n'
    expect(buildDiagnostics(bang)[0]?.code).toBe('package-error')
    // ...the no-`!` form arrives pre-bracketed via tryPackageError.
    const bare = 'Package natbib Error: Bibliography not compatible.\n'
    expect(buildDiagnostics(bare)[0]?.code).toBe('package-error')
  })

  it('emits one structured missing-glyph diagnostic per font (no duplicate)', () => {
    const log = [
      'Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!',
      'Missing character: There is no 녕 (U+B155) in font [HaranoAjiMincho-Regular.otf]!',
    ].join('\n')
    const glyphs = buildDiagnostics(log).filter((d) => d.code === 'missing-glyph')
    expect(glyphs).toHaveLength(1)
    expect(glyphs[0]!.glyph?.font).toBe('HaranoAjiMincho-Regular.otf')
    expect(glyphs[0]!.glyph?.script).toBe('Hangul')
  })

  it('uses the passed (enriched) gaps so suggestions/occurrences stay in sync', () => {
    const log = 'Missing character: There is no 안 (U+C548) in font [F.otf]!'
    const gaps = parseGlyphGaps(log)
    gaps[0]!.suggestions = ['UnBatang.ttf']
    const d = buildDiagnostics(log, gaps).find((x) => x.code === 'missing-glyph')
    expect(d?.glyph).toBe(gaps[0]) // same object reference
    expect(d?.glyph?.suggestions).toEqual(['UnBatang.ttf'])
  })
})
