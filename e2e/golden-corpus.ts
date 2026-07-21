/**
 * Shared golden corpus — the single source of truth for the browser golden regression
 * (`e2e/golden-output.spec.ts`) and the cross-host parity test
 * (`src/engine/cross-host-parity.smoke.test.ts`). They compile these exact documents and
 * compare against the committed signatures in `e2e/goldens/`, so the corpus must live in
 * one place.
 */

const preamble = (engine: string): string =>
  engine === 'pdflatex'
    ? '\\documentclass{article}\\usepackage{amsmath}'
    : `% !TEX program = ${engine}\n\\documentclass{article}\\usepackage{amsmath}\\usepackage{fontspec}\\setmainfont{Latin Modern Roman}`

/** The single-file engine corpus document (text + inline/display math). */
export const docFor = (engine: string): string =>
  [
    preamble(engine),
    '\\begin{document}',
    '\\section{Golden}',
    'The quick brown fox jumps over the lazy dog. Inline math $E = mc^2$ and',
    'an integral $\\int_0^1 x^2\\,dx = \\tfrac13$ keep the line measurable.',
    '\\begin{equation} \\sum_{k=1}^{n} k = \\frac{n(n+1)}{2} \\end{equation}',
    'A second paragraph with enough text to exercise paragraph breaking and',
    'produce a stable, reproducible layout for the structural signature.',
    '\\end{document}',
    '',
  ].join('\n')

/** Bibliography project (pdfLaTeX + BibTeX): a main file that cites a `refs.bib` entry. */
export const BIBTEX_FILES: Record<string, string> = {
  'main.tex': [
    '\\documentclass{article}',
    '\\begin{document}',
    'The \\TeX book is the reference~\\cite{knuth1984}.',
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
    '\\end{document}',
    '',
  ].join('\n'),
  'refs.bib':
    '@book{knuth1984,\n  author = {Knuth, Donald E.},\n  title = {The {\\TeX}book},\n  year = {1984},\n  publisher = {Addison-Wesley},\n}\n',
}

/** Index project (pdfLaTeX + makeindex): `\index` entries + `\printindex`, so the index
 *  stage runs (`.idx` → `.ind`) and `\printindex` resolves on the rerun. */
export const MAKEINDEX_FILES: Record<string, string> = {
  'main.tex': [
    '\\documentclass{article}',
    '\\usepackage{makeidx}',
    '\\makeindex',
    '\\begin{document}',
    'Knuth created \\TeX\\index{TeX}, a typesetting system used for literate',
    'programming\\index{literate programming}. \\TeX\\index{TeX} is widely known.',
    '\\printindex',
    '\\end{document}',
    '',
  ].join('\n'),
}
