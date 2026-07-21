import { describe, expect, it } from 'vitest'
import { type LintRuleId, lintSource } from '../linter'

function codes(content: string, config?: Parameters<typeof lintSource>[2]): string[] {
  return lintSource(content, 'main.tex', config).map((d) => d.code)
}

function only(id: LintRuleId, content: string) {
  // Disable every other rule so a fixture isolates one rule.
  const config = Object.fromEntries(
    (
      [
        'nbsp-before-ref',
        'space-before-punctuation',
        'doubled-space',
        'ellipsis',
        'straight-double-quotes',
        'display-math-dollars',
        'en-dash-range',
        'math-operator-as-text',
        'footnote-spacing',
        'abbreviation-spacing',
      ] as LintRuleId[]
    ).map((r) => [r, { enabled: r === id, severity: 'warning' as const }]),
  )
  return lintSource(content, 'main.tex', config)
}

describe('linter', () => {
  describe('nbsp-before-ref', () => {
    it('flags a regular space before \\ref', () => {
      const d = only('nbsp-before-ref', 'see \\ref{fig:1}')
      expect(d).toHaveLength(1)
      expect(d[0]!.code).toBe('nbsp-before-ref')
    })
    it('accepts a non-breaking space', () => {
      expect(only('nbsp-before-ref', 'see~\\ref{fig:1}')).toHaveLength(0)
    })
    it('flags a space before multi-letter cite variants (\\citep, \\citet, …)', () => {
      // The rule promises to flag a space before \cite; the natbib/biblatex variants
      // \citep \citet \autocite \parencite \textcite are the common real cases.
      for (const cmd of ['citep', 'citet', 'autocite', 'parencite', 'textcite']) {
        expect(only('nbsp-before-ref', `word \\${cmd}{x}`)).toHaveLength(1)
      }
    })
  })

  describe('space-before-punctuation', () => {
    it('flags a space before a comma', () => {
      expect(only('space-before-punctuation', 'word , next').map((d) => d.code)).toEqual([
        'space-before-punctuation',
      ])
    })
    it('accepts correct punctuation', () => {
      expect(only('space-before-punctuation', 'word, next')).toHaveLength(0)
    })
  })

  describe('doubled-space', () => {
    it('flags two spaces between words', () => {
      expect(only('doubled-space', 'a  b')).toHaveLength(1)
    })
    it('ignores leading indentation', () => {
      expect(only('doubled-space', '    indented')).toHaveLength(0)
    })
  })

  describe('ellipsis', () => {
    it('flags literal ...', () => {
      expect(only('ellipsis', 'wait... really')).toHaveLength(1)
    })
  })

  describe('straight-double-quotes', () => {
    it('flags a straight double quote', () => {
      expect(only('straight-double-quotes', 'say "hi"')).toHaveLength(2)
    })
    it('ignores LaTeX quotes', () => {
      expect(only('straight-double-quotes', "say ``hi''")).toHaveLength(0)
    })
    it('flags a straight quote after an escaped backslash (even run)', () => {
      // `\\` is an escaped backslash (even run), so the following " is a real straight quote.
      expect(only('straight-double-quotes', 'path C:\\\\"x')).toHaveLength(1)
    })
    it('still ignores an escaped quote (odd run)', () => {
      expect(only('straight-double-quotes', 'a \\" b')).toHaveLength(0)
    })
  })

  describe('display-math-dollars', () => {
    it('flags $$ display math once per block', () => {
      const d = only('display-math-dollars', 'text $$x+y$$ more')
      expect(d).toHaveLength(1)
      expect(d[0]!.code).toBe('display-math-dollars')
    })
  })

  describe('en-dash-range', () => {
    it('flags a hyphen between digits in text', () => {
      expect(only('en-dash-range', 'pages 10-20')).toHaveLength(1)
    })
    it('ignores subtraction inside math', () => {
      expect(only('en-dash-range', 'value $10-20$')).toHaveLength(0)
    })
    it('does not flag dates or multi-segment numbers as ranges', () => {
      // A date/ISBN/phone has 3+ hyphen-joined segments; a range has exactly two numbers.
      expect(only('en-dash-range', 'Released on 2024-01-15 in v2.')).toHaveLength(0)
      expect(only('en-dash-range', 'ISBN 978-3-16-148410-0')).toHaveLength(0)
    })
    it('still flags a genuine two-number range', () => {
      expect(only('en-dash-range', 'pages 1-5')).toHaveLength(1)
    })
  })

  describe('math-operator-as-text', () => {
    it('flags a bare operator name inside math', () => {
      const d = only('math-operator-as-text', 'compute $sin(x)$')
      expect(d).toHaveLength(1)
      expect(d[0]!.message).toContain('\\sin')
    })
    it('ignores the escaped operator', () => {
      expect(only('math-operator-as-text', 'compute $\\sin(x)$')).toHaveLength(0)
    })
    it('ignores the same word in plain text', () => {
      expect(only('math-operator-as-text', 'a sin of pride')).toHaveLength(0)
    })
  })

  describe('footnote-spacing', () => {
    it('flags a space before \\footnote', () => {
      expect(only('footnote-spacing', 'word \\footnote{x}')).toHaveLength(1)
    })
  })

  describe('masking', () => {
    it('does not lint inside comments', () => {
      expect(codes('% say "hi" pages 10-20 ...')).toHaveLength(0)
    })
    it('does not lint inside verbatim', () => {
      expect(codes('\\begin{verbatim}\nsay "hi" 10-20\n\\end{verbatim}')).toHaveLength(0)
    })
    it('does not lint inside inline \\verb', () => {
      expect(codes('\\verb|"x" 1-2|')).toHaveLength(0)
    })
    it('does not flag $$ inside a verbatim environment', () => {
      expect(codes('\\begin{verbatim}\n$$x$$\n\\end{verbatim}')).not.toContain(
        'display-math-dollars',
      )
    })
    it('does not flag $$ inside an \\iffalse block, and keeps real ones in sync', () => {
      const c = codes('\\iffalse $$hidden$$ \\fi\n$$real$$')
      // Exactly one real display-math block remains flagged (masked one ignored).
      expect(c.filter((x) => x === 'display-math-dollars')).toHaveLength(1)
    })
    it('does not treat a masked $ as opening math for text rules', () => {
      // The hidden unmatched $ must not leak math mode onto the real range.
      const c = codes('\\iffalse $ \\fi\npages 10-20')
      expect(c).toContain('en-dash-range')
    })
  })

  describe('config', () => {
    it('respects disabled rules', () => {
      const c = codes('say "hi"', {
        'straight-double-quotes': { enabled: false, severity: 'info' },
      })
      expect(c).not.toContain('straight-double-quotes')
    })
    it('applies configured severity', () => {
      const d = lintSource('a  b', 'main.tex', {
        'doubled-space': { enabled: true, severity: 'error' },
      })
      const dbl = d.find((x) => x.code === 'doubled-space')!
      expect(dbl.severity).toBe('error')
    })
    it('ships abbreviation-spacing disabled by default', () => {
      expect(codes('e.g. this')).not.toContain('abbreviation-spacing')
      expect(
        codes('e.g. this', { 'abbreviation-spacing': { enabled: true, severity: 'info' } }),
      ).toContain('abbreviation-spacing')
    })
    it('keeps default severity when only enabled is overridden', () => {
      const d = lintSource('a  b', 'main.tex', { 'doubled-space': { enabled: true } })
      const dbl = d.find((x) => x.code === 'doubled-space')!
      expect(dbl).toBeTruthy()
      expect(dbl.severity).toBe('info')
    })
    it('keeps a default-enabled rule on when only severity is overridden', () => {
      const d = lintSource('a  b', 'main.tex', { 'doubled-space': { severity: 'error' } })
      const dbl = d.find((x) => x.code === 'doubled-space')
      expect(dbl).toBeTruthy()
      expect(dbl!.severity).toBe('error')
    })
  })
})
