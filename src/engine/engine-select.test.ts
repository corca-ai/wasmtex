import { describe, expect, it } from 'vitest'
import { detectEngine, resolveEngine } from './engine-select'

describe('detectEngine', () => {
  it('defaults to pdflatex for a plain article', () => {
    const r = detectEngine('\\documentclass{article}\\begin{document}hi\\end{document}')
    expect(r.engine).toBe('pdflatex')
    expect(r.forced).toBe(false)
  })

  it('honours a "% !TEX program = xelatex" magic comment', () => {
    const r = detectEngine('% !TEX program = xelatex\n\\documentclass{article}')
    expect(r.engine).toBe('xelatex')
    expect(r.forced).toBe(true)
  })

  it('honours "%!TEX TS-program=lualatex" (no spaces, TS- prefix)', () => {
    const r = detectEngine('%!TEX TS-program=lualatex\n\\documentclass{article}')
    expect(r.engine).toBe('lualatex')
    expect(r.forced).toBe(true)
  })

  it('normalizes xetex→xelatex and luatex→lualatex', () => {
    expect(detectEngine('% !TEX engine = xetex\n').engine).toBe('xelatex')
    expect(detectEngine('% !TEX program = luatex\n').engine).toBe('lualatex')
  })

  it('a magic comment overrides preamble heuristics', () => {
    const src = '% !TEX program = pdflatex\n\\usepackage{fontspec}'
    const r = detectEngine(src)
    expect(r.engine).toBe('pdflatex')
    expect(r.forced).toBe(true)
  })

  it('detects fontspec → xelatex', () => {
    const r = detectEngine('\\documentclass{article}\n\\usepackage{fontspec}\n\\begin{document}')
    expect(r.engine).toBe('xelatex')
    expect(r.reason).toMatch(/fontspec/)
  })

  it('detects unicode-math → xelatex', () => {
    const r = detectEngine('\\usepackage{unicode-math}')
    expect(r.engine).toBe('xelatex')
  })

  it('detects xeCJK (Korean/CJK) → xelatex', () => {
    const r = detectEngine('\\usepackage{xeCJK}\n\\setCJKmainfont{Noto Serif CJK KR}')
    expect(r.engine).toBe('xelatex')
    expect(r.reason).toMatch(/xeCJK|XeTeX/)
  })

  it('detects \\directlua → lualatex', () => {
    const r = detectEngine('\\documentclass{article}\n\\directlua{print("hi")}')
    expect(r.engine).toBe('lualatex')
  })

  it('detects a lua-only package → lualatex', () => {
    expect(detectEngine('\\usepackage{luacode}').engine).toBe('lualatex')
    expect(detectEngine('\\usepackage{luatexja}').engine).toBe('lualatex')
  })

  it('prefers lualatex when fontspec AND a lua signal are both present', () => {
    const r = detectEngine('\\usepackage{fontspec}\n\\usepackage{luacode}')
    expect(r.engine).toBe('lualatex')
  })

  it('detects fontspec via \\setmainfont without an explicit \\usepackage', () => {
    const r = detectEngine('\\documentclass{article}\n\\setmainfont{Latin Modern Roman}')
    expect(r.engine).toBe('xelatex')
  })

  it('handles \\usepackage with options and multiple packages', () => {
    const r = detectEngine('\\usepackage[no-math]{fontspec}')
    expect(r.engine).toBe('xelatex')
    const r2 = detectEngine('\\usepackage{amsmath,unicode-math,booktabs}')
    expect(r2.engine).toBe('xelatex')
  })

  it('does not route plain pdflatex packages to a Unicode engine', () => {
    const r = detectEngine('\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\usepackage{hyperref}')
    expect(r.engine).toBe('pdflatex')
  })

  it('ignores a commented-out \\directlua / fontspec in the preamble', () => {
    expect(detectEngine('% \\directlua{...}\n\\documentclass{article}').engine).toBe('pdflatex')
    expect(detectEngine('%\\usepackage{fontspec}\n\\documentclass{article}').engine).toBe(
      'pdflatex',
    )
  })

  it('treats a `%` after an escaped backslash (\\\\%) as a real comment', () => {
    // In TeX `\\%` is an escaped backslash followed by a comment, so everything after the
    // `%` (incl. a commented-out fontspec) must be stripped and must NOT switch the engine.
    const src = '\\newcommand\\x{a\\\\% \\usepackage{fontspec}}\n\\begin{document}\n\\end{document}'
    expect(detectEngine(src).engine).toBe('pdflatex')
  })

  it('keeps a literal `\\%` (odd backslash run) from masking a real fontspec on the same line', () => {
    // `\%` is a literal percent — the rest of the line is NOT a comment, so a real
    // \usepackage{fontspec} after it still triggers xelatex.
    const src = '50\\% off \\usepackage{fontspec}\n\\begin{document}\n\\end{document}'
    expect(detectEngine(src).engine).toBe('xelatex')
  })

  it('ignores a fontspec mention after \\begin{document}', () => {
    // Heuristics only scan the preamble; body text must not trigger a switch.
    const r = detectEngine(
      '\\documentclass{article}\\begin{document}\nfontspec \\setmainfont here\n\\end{document}',
    )
    expect(r.engine).toBe('pdflatex')
  })
})

describe('resolveEngine', () => {
  it('an explicit engine option wins over detection', () => {
    const r = resolveEngine('\\usepackage{fontspec}', 'pdflatex')
    expect(r.engine).toBe('pdflatex')
    expect(r.forced).toBe(true)
  })

  it('"auto" falls through to detection', () => {
    const r = resolveEngine('\\usepackage{fontspec}', 'auto')
    expect(r.engine).toBe('xelatex')
  })

  it('undefined option falls through to detection', () => {
    const r = resolveEngine('\\documentclass{article}', undefined)
    expect(r.engine).toBe('pdflatex')
  })
})
