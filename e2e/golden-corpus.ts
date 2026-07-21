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

const PDF_IMPORT_BASE64 = [
  'JVBERi0xLjcKJeLjz9MKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgL1R5cGVzIFtudWxsIHRydWUgNyAyLjUgL0EjMjBOYW1lIChB',
  'XDAwMEIpIDw0MTAwNDI+IDcgMCBSXSAvTGl0ZXJhbCAoQVwwMDBCXG5cKFwpXFwpIC9IZXggPDQxMDA0Mj4gL09yZGVyIDw8IC9aIDEgL0EgMiAvTSAzID4+',
  'IC9Qcm9iZVN0cmVhbSA2IDAgUiA+PgplbmRvYmoKMiAwIG9iago8PCAvVHlwZSAvUGFnZXMgL0tpZHMgWzMgMCBSXSAvQ291bnQgMSA+PgplbmRvYmoKMyAw',
  'IG9iago8PCAvVHlwZSAvUGFnZSAvUGFyZW50IDIgMCBSIC9NZWRpYUJveCBbMCAwIDcyIDE0NF0gL1Jlc291cmNlcyA8PCA+PiAvQ29udGVudHMgNCAwIFIg',
  'Pj4KZW5kb2JqCjQgMCBvYmoKPDwgIC9MZW5ndGggMzEgPj4Kc3RyZWFtCjAuMiAwLjYgMC45IHJnIDAgMCA3MiAxNDQgcmUgZgoKZW5kc3RyZWFtCmVuZG9i',
  'ago1IDAgb2JqCjw8IC9Qcm9kdWNlciAoV2FzbVRleCBjb21wYXRpYmlsaXR5IGZpeHR1cmUpID4+CmVuZG9iago2IDAgb2JqCjw8IC9GaWx0ZXIgL0ZsYXRl',
  'RGVjb2RlIC9MZW5ndGggNjQgPj4Kc3RyZWFtCnjaMzRQMNIzVSgpKk1V0PdTNjPMTVXQcIwxMDBw0lSINlQwilWwsVHQ91bQCNNUsLNTCCjKT0r1L+ACAHub',
  'DaEKZW5kc3RyZWFtCmVuZG9iago3IDAgb2JqCjw8IC9JbmRpcmVjdCB0cnVlIC9WYWx1ZSA0MiA+PgplbmRvYmoKeHJlZgowIDgKMDAwMDAwMDAwMCA2NTUz',
  'NSBmIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAyMTAgMDAwMDAgbiAKMDAwMDAwMDI2NyAwMDAwMCBuIAowMDAwMDAwMzcwIDAwMDAwIG4gCjAwMDAw',
  'MDA0NTIgMDAwMDAgbiAKMDAwMDAwMDUxNSAwMDAwMCBuIAowMDAwMDAwNjUwIDAwMDAwIG4gCnRyYWlsZXIKPDwgL1NpemUgOCAvUm9vdCAxIDAgUiAvSW5m',
  'byA1IDAgUiA+PgpzdGFydHhyZWYKNjk2CiUlRU9GCg==',
].join('')

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

/** Real package-level PDF import corpus for the WTPDF-dependent Lua/Xe paths. */
export const pdfImportFiles = (
  engine: 'xelatex' | 'lualatex',
): Record<string, string | Uint8Array> => ({
  'main.tex': [
    `% !TEX program = ${engine}`,
    '\\documentclass{article}',
    '\\usepackage{graphicx}',
    '\\usepackage{pdfpages}',
    '\\usepackage{tikz}',
    '\\begin{document}',
    '\\includegraphics[width=2cm]{figure.pdf}',
    '\\begin{tikzpicture}\\draw[blue,thick] (0,0) rectangle (2,1);\\end{tikzpicture}',
    '\\includepdf[pages=1,pagecommand={}]{figure.pdf}',
    '\\end{document}',
    '',
  ].join('\n'),
  'figure.pdf': decodeBase64(PDF_IMPORT_BASE64),
})
