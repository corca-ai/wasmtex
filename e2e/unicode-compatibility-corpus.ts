import { BIBTEX_FILES, docFor, MAKEINDEX_FILES, pdfImportFiles } from './golden-corpus'

export const PROJECT_FONT_SHA256 = '1aa18cfefa58132c52ce5de70db1fd1154201c19cd2b2cdaffba4906a33e6852'

export type UnicodeEngine = 'xelatex' | 'lualatex'
export type UnicodeCompatibilityCase = {
  name: string
  files: Record<string, string | Uint8Array>
  error?: boolean
  auxiliary?: string
  mainFile?: string
  stalePdfFrom?: string
}

export function unicodeCompatibilityCases(engine: UnicodeEngine, font: Uint8Array): UnicodeCompatibilityCase[] {
  return [
    { name: 'article', files: { 'main.tex': docFor(engine) } },
    {
      name: 'unicode-math',
      files: {
        'main.tex': String.raw`\documentclass{article}
\usepackage{fontspec}\usepackage{unicode-math}
\setmainfont{Latin Modern Roman}\setmathfont{Latin Modern Math}
\begin{document}Café naïve Straße. $\int_0^1 x^2\,dx = \frac13,\quad α+β=γ$
\end{document}`,
      },
    },
    { name: 'pdf-import-tikz', files: pdfImportFiles(engine) },
    {
      name: 'korean-font',
      files: {
        'main.tex': String.raw`\documentclass{article}\usepackage{fontspec}
\setmainfont{UnBatang.ttf}
\begin{document}한국어 문서와 한글 글꼴의 반복 컴파일을 확인합니다.
한글과 English 123을 함께 조판합니다.\end{document}`,
      },
    },
    {
      name: 'project-local-font',
      files: {
        'main.tex': String.raw`\documentclass{article}\usepackage{fontspec}
\setmainfont[Path=./]{ProjectFont.otf}
\begin{document}Project-local Latin Modern font.\end{document}`,
        'ProjectFont.otf': font,
      },
    },
    { name: 'bibliography', files: BIBTEX_FILES, auxiliary: 'main.bbl' },
    { name: 'index', files: MAKEINDEX_FILES, auxiliary: 'main.ind' },
    {
      name: 'undefined-command',
      files: {
        'main.tex': String.raw`\documentclass{article}\begin{document}\wasmtexUndefinedCommand\end{document}`,
      },
      error: true,
    },
    {
      name: 'nested-main',
      mainFile: 'nested/main.tex',
      files: { 'nested/main.tex': docFor(engine) },
      // Existing dvipdfmx controller reads root main.pdf although its C entry
      // writes nested/main.pdf. In this reused worker it returns the index PDF.
      // Expose this known defect rather than calling it a successful fixture.
      ...(engine === 'xelatex' ? { stalePdfFrom: 'index' } : {}),
    },
    { name: 'recovery', files: { 'main.tex': docFor(engine) } },
  ]
}
