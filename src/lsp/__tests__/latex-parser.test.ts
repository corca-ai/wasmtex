import { describe, expect, it } from 'vitest'
import { parseLatexFile } from '../latex-parser'

describe('parseLatexFile', () => {
  // --- Labels ---
  describe('labels', () => {
    it('extracts \\label{...}', () => {
      const result = parseLatexFile('\\label{fig:test}', 'main.tex')
      expect(result.labels).toHaveLength(1)
      expect(result.labels[0]!.name).toBe('fig:test')
      expect(result.labels[0]!.location).toEqual({ file: 'main.tex', line: 1, column: 8 })
    })

    it('extracts multiple labels on different lines', () => {
      const result = parseLatexFile('\\label{a}\n\\label{b}', 'test.tex')
      expect(result.labels).toHaveLength(2)
      expect(result.labels[0]!.name).toBe('a')
      expect(result.labels[1]!.name).toBe('b')
      expect(result.labels[1]!.location.line).toBe(2)
    })

    it('extracts label after other content on same line', () => {
      const result = parseLatexFile('Some text \\label{eq:main} more', 'test.tex')
      expect(result.labels).toHaveLength(1)
      expect(result.labels[0]!.name).toBe('eq:main')
    })
  })

  // --- Label refs ---
  describe('label refs', () => {
    it('extracts \\ref{...}', () => {
      const result = parseLatexFile('See \\ref{fig:test}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('fig:test')
    })

    it('extracts \\eqref{...}', () => {
      const result = parseLatexFile('Equation \\eqref{eq:1}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('eq:1')
    })

    it('extracts \\pageref{...}', () => {
      const result = parseLatexFile('Page \\pageref{ch:intro}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('ch:intro')
    })

    it('extracts \\autoref{...}', () => {
      const result = parseLatexFile('\\autoref{tab:data}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('tab:data')
    })

    it('extracts \\cref{...}', () => {
      const result = parseLatexFile('\\cref{sec:intro}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('sec:intro')
    })

    it('extracts \\nameref{...}', () => {
      const result = parseLatexFile('\\nameref{sec:intro}', 'main.tex')
      expect(result.labelRefs).toHaveLength(1)
      expect(result.labelRefs[0]!.name).toBe('sec:intro')
    })
  })

  // --- Citations ---
  describe('citations', () => {
    it('extracts \\cite{key}', () => {
      const result = parseLatexFile('\\cite{knuth84}', 'main.tex')
      expect(result.citations).toHaveLength(1)
      expect(result.citations[0]!.key).toBe('knuth84')
    })

    it('extracts comma-separated keys', () => {
      const result = parseLatexFile('\\cite{a,b,c}', 'main.tex')
      expect(result.citations).toHaveLength(3)
      expect(result.citations.map((c) => c.key)).toEqual(['a', 'b', 'c'])
    })

    it('handles spaces in comma-separated keys', () => {
      const result = parseLatexFile('\\cite{a, b , c}', 'main.tex')
      expect(result.citations.map((c) => c.key)).toEqual(['a', 'b', 'c'])
    })

    it('extracts \\citep{key}', () => {
      const result = parseLatexFile('\\citep{smith2020}', 'main.tex')
      expect(result.citations).toHaveLength(1)
      expect(result.citations[0]!.key).toBe('smith2020')
    })

    it('extracts \\citet{key}', () => {
      const result = parseLatexFile('\\citet{jones99}', 'main.tex')
      expect(result.citations).toHaveLength(1)
      expect(result.citations[0]!.key).toBe('jones99')
    })

    it('extracts \\parencite{key}', () => {
      const result = parseLatexFile('\\parencite{doe2021}', 'main.tex')
      expect(result.citations).toHaveLength(1)
    })

    it('extracts \\textcite{key}', () => {
      const result = parseLatexFile('\\textcite{doe2021}', 'main.tex')
      expect(result.citations).toHaveLength(1)
    })

    it('handles \\cite with optional argument', () => {
      const result = parseLatexFile('\\cite[p.~42]{knuth84}', 'main.tex')
      expect(result.citations).toHaveLength(1)
      expect(result.citations[0]!.key).toBe('knuth84')
    })
  })

  // --- Sections ---
  describe('sections', () => {
    it('extracts \\section{...}', () => {
      const result = parseLatexFile('\\section{Introduction}', 'main.tex')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0]!.level).toBe('section')
      expect(result.sections[0]!.title).toBe('Introduction')
    })

    it('extracts all section levels', () => {
      const input = [
        '\\part{Part 1}',
        '\\chapter{Chapter 1}',
        '\\section{Section 1}',
        '\\subsection{Sub 1}',
        '\\subsubsection{Subsub 1}',
        '\\paragraph{Para 1}',
      ].join('\n')
      const result = parseLatexFile(input, 'main.tex')
      expect(result.sections).toHaveLength(6)
      expect(result.sections.map((s) => s.level)).toEqual([
        'part',
        'chapter',
        'section',
        'subsection',
        'subsubsection',
        'paragraph',
      ])
    })

    it('handles starred sections', () => {
      const result = parseLatexFile('\\section*{Unnumbered}', 'main.tex')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0]!.title).toBe('Unnumbered')
    })

    it('extracts a section with an optional short-title argument', () => {
      // `\section[Short TOC title]{Full Title}` is valid LaTeX; the optional `[...]`
      // must not prevent the section (with its real title) from being indexed.
      const result = parseLatexFile('\\section[Short]{Full Title}', 'main.tex')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0]!.level).toBe('section')
      expect(result.sections[0]!.title).toBe('Full Title')
    })

    it('extracts a starred section with an optional argument', () => {
      const result = parseLatexFile('\\section*[Short]{Full}', 'main.tex')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0]!.title).toBe('Full')
    })
  })

  // --- Commands ---
  describe('commands', () => {
    it('extracts \\newcommand', () => {
      const result = parseLatexFile('\\newcommand{\\foo}{bar}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('foo')
    })

    it('extracts \\newcommand with arg count', () => {
      const result = parseLatexFile('\\newcommand{\\foo}[2]{#1 and #2}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('foo')
      expect(result.commands[0]!.argCount).toBe(2)
    })

    it('extracts \\renewcommand', () => {
      const result = parseLatexFile('\\renewcommand{\\bar}{baz}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('bar')
    })

    it('extracts \\def', () => {
      const result = parseLatexFile('\\def\\mymacro{stuff}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('mymacro')
    })

    it('extracts \\DeclareMathOperator', () => {
      const result = parseLatexFile('\\DeclareMathOperator{\\argmax}{arg\\,max}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('argmax')
    })

    it('extracts \\DeclareMathOperator*', () => {
      const result = parseLatexFile('\\DeclareMathOperator*{\\argmin}{arg\\,min}', 'main.tex')
      expect(result.commands).toHaveLength(1)
      expect(result.commands[0]!.name).toBe('argmin')
    })

    it('points the location at the \\name token, not a prefix keyword', () => {
      // When the defined name is a prefix of the defining keyword (\r ⊂ \renewcommand,
      // \D ⊂ \DeclareMathOperator, \d ⊂ \def), the search must skip the keyword's own
      // backslash so go-to-definition/rename land on the macro, not inside the keyword.
      expect(parseLatexFile('\\renewcommand{\\r}{x}', 'f').commands[0]!.location.column).toBe(16)
      expect(
        parseLatexFile('\\DeclareMathOperator{\\D}{D}', 'f').commands[0]!.location.column,
      ).toBe(23)
      expect(parseLatexFile('\\def\\d{x}', 'f').commands[0]!.location.column).toBe(6)
      // control: a non-prefix name is unaffected
      expect(parseLatexFile('\\newcommand{\\foo}{x}', 'f').commands[0]!.location.column).toBe(14)
    })
  })

  // --- Brace handling ---
  describe('escaped braces in arguments', () => {
    it('keeps a section whose title contains an escaped brace', () => {
      // `\{` is a literal brace, not a group delimiter — it must not unbalance the scan.
      const result = parseLatexFile('\\section{a \\{ b}\n\\label{real}', 'test.tex')
      expect(result.sections).toHaveLength(1)
      expect(result.sections[0]!.title).toBe('a \\{ b')
      expect(result.labels).toHaveLength(1)
    })
  })

  // --- Environments ---
  describe('environments', () => {
    it('extracts \\begin{env}', () => {
      const result = parseLatexFile('\\begin{equation}', 'main.tex')
      expect(result.environments).toHaveLength(1)
      expect(result.environments[0]!.name).toBe('equation')
    })

    it('extracts multiple environments', () => {
      const input = '\\begin{figure}\n\\begin{center}\n\\end{center}\n\\end{figure}'
      const result = parseLatexFile(input, 'main.tex')
      expect(result.environments).toHaveLength(2)
      expect(result.environments.map((e) => e.name)).toEqual(['figure', 'center'])
    })
  })

  // --- Includes ---
  describe('includes', () => {
    it('extracts \\input{file}', () => {
      const result = parseLatexFile('\\input{chapters/intro}', 'main.tex')
      expect(result.includes).toHaveLength(1)
      expect(result.includes[0]!.path).toBe('chapters/intro')
      expect(result.includes[0]!.type).toBe('input')
    })

    it('extracts \\include{file}', () => {
      const result = parseLatexFile('\\include{appendix}', 'main.tex')
      expect(result.includes).toHaveLength(1)
      expect(result.includes[0]!.path).toBe('appendix')
      expect(result.includes[0]!.type).toBe('include')
    })

    it('extracts \\subfile{file}', () => {
      const result = parseLatexFile('\\subfile{sections/methods}', 'main.tex')
      expect(result.includes).toHaveLength(1)
      expect(result.includes[0]!.type).toBe('subfile')
    })
  })

  // --- Packages ---
  describe('packages', () => {
    it('extracts \\usepackage{name}', () => {
      const result = parseLatexFile('\\usepackage{amsmath}', 'main.tex')
      expect(result.packages).toHaveLength(1)
      expect(result.packages[0]!.name).toBe('amsmath')
      expect(result.packages[0]!.options).toBe('')
    })

    it('extracts \\usepackage with options', () => {
      const result = parseLatexFile('\\usepackage[utf8]{inputenc}', 'main.tex')
      expect(result.packages).toHaveLength(1)
      expect(result.packages[0]!.name).toBe('inputenc')
      expect(result.packages[0]!.options).toBe('utf8')
    })

    it('extracts comma-separated packages', () => {
      const result = parseLatexFile('\\usepackage{amsmath,amssymb,amsthm}', 'main.tex')
      expect(result.packages).toHaveLength(3)
      expect(result.packages.map((p) => p.name)).toEqual(['amsmath', 'amssymb', 'amsthm'])
    })

    it('extracts \\RequirePackage', () => {
      const result = parseLatexFile('\\RequirePackage{etoolbox}', 'main.tex')
      expect(result.packages).toHaveLength(1)
      expect(result.packages[0]!.name).toBe('etoolbox')
    })
  })

  // --- Comments ---
  describe('comment handling', () => {
    it('ignores content after %', () => {
      const result = parseLatexFile('% \\label{commented}', 'main.tex')
      expect(result.labels).toHaveLength(0)
    })

    it('ignores mid-line comment', () => {
      const result = parseLatexFile('text % \\ref{commented}', 'main.tex')
      expect(result.labelRefs).toHaveLength(0)
    })

    it('does not treat escaped percent as comment', () => {
      const result = parseLatexFile('50\\% \\label{valid}', 'main.tex')
      expect(result.labels).toHaveLength(1)
      expect(result.labels[0]!.name).toBe('valid')
    })
  })

  // --- Bib items ---
  describe('bib items', () => {
    it('extracts \\bibitem{key}', () => {
      const result = parseLatexFile('\\bibitem{knuth84} Donald Knuth.', 'refs.tex')
      expect(result.bibItems).toHaveLength(1)
      expect(result.bibItems[0]!.key).toBe('knuth84')
      expect(result.bibItems[0]!.location).toEqual({ file: 'refs.tex', line: 1, column: 10 })
    })

    it('extracts \\bibitem with optional arg', () => {
      const result = parseLatexFile('\\bibitem[Knuth, 1984]{knuth84} The TeXbook.', 'refs.tex')
      expect(result.bibItems).toHaveLength(1)
      expect(result.bibItems[0]!.key).toBe('knuth84')
    })

    it('extracts multiple bibitems', () => {
      const result = parseLatexFile('\\bibitem{a} A.\n\\bibitem{b} B.', 'refs.tex')
      expect(result.bibItems).toHaveLength(2)
      expect(result.bibItems[0]!.key).toBe('a')
      expect(result.bibItems[1]!.key).toBe('b')
    })
  })

  // --- Edge cases ---
  describe('edge cases', () => {
    it('handles empty content', () => {
      const result = parseLatexFile('', 'main.tex')
      expect(result.labels).toHaveLength(0)
      expect(result.sections).toHaveLength(0)
    })

    it('handles unclosed braces gracefully', () => {
      const result = parseLatexFile('\\label{unclosed', 'main.tex')
      expect(result.labels).toHaveLength(0) // can't extract without closing brace
    })

    it('handles complex document', () => {
      const doc = `
\\documentclass{article}
\\usepackage{amsmath,graphicx}
\\newcommand{\\R}{\\mathbb{R}}
\\begin{document}
\\section{Introduction}
\\label{sec:intro}
See \\ref{sec:methods} and \\cite{knuth84,lamport94}.
\\section{Methods}
\\label{sec:methods}
\\begin{equation}
  E = mc^2 \\label{eq:einstein}
\\end{equation}
\\end{document}
`
      const result = parseLatexFile(doc, 'main.tex')
      expect(result.packages.length).toBeGreaterThanOrEqual(2)
      expect(result.commands).toHaveLength(1)
      expect(result.sections).toHaveLength(2)
      expect(result.labels).toHaveLength(3)
      expect(result.labelRefs).toHaveLength(1)
      expect(result.citations).toHaveLength(2)
      expect(result.environments.length).toBeGreaterThanOrEqual(2) // document + equation
    })
  })
})

describe('parseLatexFile — masking (comments, verbatim, conditionals)', () => {
  it('ignores a \\label inside a verbatim environment', () => {
    const doc = '\\begin{verbatim}\n\\label{not:real}\n\\end{verbatim}\n\\label{real}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['real'])
  })

  it('ignores a \\ref inside inline \\verb', () => {
    const result = parseLatexFile('\\verb|\\ref{nope}| then \\ref{yes}', 'main.tex')
    expect(result.labelRefs.map((r) => r.name)).toEqual(['yes'])
  })

  it('ignores commands inside \\mintinline{lang}{code}', () => {
    const result = parseLatexFile('\\mintinline{latex}{\\ref{fake}} \\ref{real}', 'main.tex')
    expect(result.labelRefs.map((r) => r.name)).toEqual(['real'])
  })

  it('ignores a \\ref inside \\lstinline[opts]{code}', () => {
    const result = parseLatexFile('\\lstinline[language=C]{int x;} then \\ref{r}', 'main.tex')
    expect(result.labelRefs.map((r) => r.name)).toEqual(['r'])
  })

  it('ignores a \\cite hidden after a real % comment mid-line', () => {
    const result = parseLatexFile('\\cite{a} % \\cite{b}', 'main.tex')
    expect(result.citations.map((c) => c.key)).toEqual(['a'])
  })

  it('skips definitions inside an \\iffalse ... \\fi block', () => {
    const doc = '\\iffalse\n\\label{hidden}\n\\fi\n\\label{shown}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['shown'])
  })

  it('keeps the true branch of \\iffalse ... \\else ... \\fi', () => {
    const doc = '\\iffalse \\label{f} \\else \\label{t} \\fi'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['t'])
  })

  it('does not let an \\iffalse inside a verbatim body mask real code', () => {
    // The \iffalse lives inside a verbatim listing, so it must not open a
    // conditional that swallows the real \label{real} after \end{verbatim}.
    const doc = '\\begin{verbatim}\n\\iffalse\n\\end{verbatim}\n\\label{real}\n\\fi'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['real'])
  })

  it('ignores an \\iffalse inside lstlisting while keeping later code', () => {
    const doc =
      '\\begin{lstlisting}\n\\iffalse\n\\end{lstlisting}\n\\section{Real}\\label{sec}\n\\fi'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.sections.map((s) => s.title)).toEqual(['Real'])
    expect(result.labels.map((l) => l.name)).toEqual(['sec'])
  })

  it('does not let a user \\newif conditional’s \\fi end an enclosing \\iffalse mask early', () => {
    // \iffoo is a user (\newif) conditional nested inside a false branch. Its \fi must
    // pair with \iffoo, NOT pop the outer \iffalse frame and unmask \label{also}.
    const doc = '\\iffalse\n\\label{hidden}\n\\iffoo\n\\fi\n\\label{also}\n\\fi\n\\label{real}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['real'])
  })

  it('treats \\iff as math, not a conditional (its presence must not consume a later \\fi)', () => {
    // \iff is the math biconditional, not \newif. If it were treated as an opener it
    // would swallow the \fi meant for the \iffalse, leaving \label{hidden} unmasked.
    const doc = '\\iffalse\n\\label{hidden}\n\\iff\n\\fi\n\\label{shown}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['shown'])
  })

  it('does not open a conditional frame for argument-taking \\ifthenelse (no \\fi)', () => {
    // \ifthenelse{c}{t}{f} is fully expandable and has NO matching \fi. Opening an opaque
    // frame for it would steal the enclosing \iftrue's \else/\fi, leaking the else branch.
    const doc = '\\iftrue\n\\ifthenelse{a}{b}{c}\n\\label{v}\n\\else\n\\label{h}\n\\fi'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['v'])
  })

  it('does not open a conditional frame for etoolbox \\ifdefempty (no \\fi)', () => {
    const doc = '\\iffalse\n\\ifdefempty{x}{a}{b}\n\\label{hidden}\n\\else\n\\label{shown}\n\\fi'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toEqual(['shown'])
  })
})

describe('parseLatexFile — multi-line arguments', () => {
  it('extracts citation keys that span multiple lines', () => {
    const result = parseLatexFile('\\cite{\n  knuth84,\n  lamport94\n}', 'main.tex')
    expect(result.citations.map((c) => c.key)).toEqual(['knuth84', 'lamport94'])
  })

  it('reports the correct line for a label after a multi-line command', () => {
    const result = parseLatexFile('\\newcommand{\\x}{\n  body\n}\n\\label{after}', 'main.tex')
    const after = result.labels.find((l) => l.name === 'after')!
    expect(after.location.line).toBe(4)
  })
})

describe('parseLatexFile — macro shallow expansion', () => {
  it('indexes a label generated by a user macro', () => {
    const doc = '\\newcommand{\\fig}[1]{\\label{#1}}\n\\fig{myfig}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toContain('myfig')
  })

  it('indexes a citation wrapped by a user macro', () => {
    const doc = '\\newcommand{\\seepaper}[1]{see \\cite{#1}}\n\\seepaper{knuth84}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.citations.map((c) => c.key)).toContain('knuth84')
  })

  it('expands user macros wrapping biblatex cite commands', () => {
    for (const cmd of ['parencite', 'textcite', 'autocite', 'nocite']) {
      const r = parseLatexFile(`\\newcommand{\\m}[1]{\\${cmd}{#1}}\n\\m{bibkey}`, 'main.tex')
      expect(r.citations.map((c) => c.key)).toContain('bibkey')
    }
  })

  it('expands nested user macros (bounded, cycle-guarded)', () => {
    const doc = [
      '\\newcommand{\\inner}[1]{\\label{#1}}',
      '\\newcommand{\\outer}[1]{\\inner{#1}}',
      '\\outer{deep}',
    ].join('\n')
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labels.map((l) => l.name)).toContain('deep')
  })

  it('does not loop on mutually recursive macros', () => {
    const doc = [
      '\\newcommand{\\a}[1]{\\b{#1}}',
      '\\newcommand{\\b}[1]{\\a{#1}\\label{#1}}',
      '\\a{x}',
    ].join('\n')
    expect(() => parseLatexFile(doc, 'main.tex')).not.toThrow()
  })

  it('does not self-expand a macro at its own definition site', () => {
    // The macro's body holds one literal \ref; the definition must NOT also
    // generate a second, phantom \ref via self-expansion.
    const result = parseLatexFile('\\newcommand{\\myref}{\\ref{eq:1}}', 'main.tex')
    expect(result.labelRefs.filter((r) => r.name === 'eq:1')).toHaveLength(1)
    const labels = parseLatexFile('\\newcommand{\\deflbl}{\\label{sec:x}}', 'main.tex')
    expect(labels.labels.filter((l) => l.name === 'sec:x')).toHaveLength(1)
  })

  it('does not double-count a literal label in a called macro body (call site only)', () => {
    // A label literal in a macro body is a template; when the macro is called the
    // label exists at the call site, not also at the definition.
    const r = parseLatexFile('\\newcommand{\\mklbl}{\\label{fixed}}\n\\mklbl', 'main.tex')
    const fixed = r.labels.filter((l) => l.name === 'fixed')
    expect(fixed).toHaveLength(1)
    expect(fixed[0]!.location.line).toBe(2)
  })

  it('does not double-count a literal ref in a called macro body', () => {
    const r = parseLatexFile('\\newcommand{\\myref}{\\ref{eq:1}}\n\\myref', 'main.tex')
    const refs = r.labelRefs.filter((x) => x.name === 'eq:1')
    expect(refs).toHaveLength(1)
    expect(refs[0]!.location.line).toBe(2)
  })

  it('counts a literal cite in a macro body once per call site', () => {
    const r = parseLatexFile('\\newcommand{\\k}{\\cite{knuth}}\n\\k\n\\k', 'main.tex')
    const cites = r.citations.filter((c) => c.key === 'knuth')
    expect(cites).toHaveLength(2)
    expect(cites.map((c) => c.location.line).sort()).toEqual([2, 3])
  })

  it('expands a macro with an optional argument, mapping the mandatory arg correctly', () => {
    // \two has 2 args, #1 optional (default x). \two{a} => #1=x, #2=a, so \ref{#2} => \ref{a}.
    const doc = '\\newcommand{\\two}[2][x]{\\label{lit}\\ref{#2}}\n\\two{a}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labelRefs.map((r) => r.name)).toContain('a')
  })

  it('binds a macro’s optional argument when the call supplies it in brackets', () => {
    // \two[y]{a} => #1=y, #2=a, so \ref{#1}\ref{#2} => \ref{y}, \ref{a}.
    const doc = '\\newcommand{\\two}[2][x]{\\ref{#1}\\ref{#2}}\n\\two[y]{a}'
    const result = parseLatexFile(doc, 'main.tex')
    expect(result.labelRefs.map((r) => r.name).sort()).toEqual(['a', 'y'])
  })

  it('does not index a parameter placeholder (#1) as a ref/cite', () => {
    const refs = parseLatexFile('\\newcommand{\\figref}[1]{see \\ref{#1}}', 'main.tex')
    expect(refs.labelRefs.some((r) => r.name === '#1')).toBe(false)
    const cites = parseLatexFile('\\newcommand{\\c}[1]{\\cite{#1}}', 'main.tex')
    expect(cites.citations.some((c) => c.key === '#1')).toBe(false)
  })
})
