import { PDFDocument } from 'pdf-lib'
import { WasmTexCompiler } from '../../src/headless'

/** The same real-worker regression runs in Node and Chromium. */
export async function nestedOutputSequence(options: {
  engine: 'pdflatex' | 'xelatex' | 'lualatex'
  texliveVersion: '2025' | '2026'
  texliveUrl: string
  assetBaseUrl?: string
}) {
  const image = await PDFDocument.create()
  image.addPage([30, 20]).drawText('PDF', { size: 8 })
  const source = (pages: number) => String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\input{parts/body.tex}
\includegraphics{assets/figure.pdf}
\label{end}\pageref{end}
${'\\newpage Another page.\n'.repeat(pages - 1)}
\end{document}`
  const cases = [
    ['nested/main.tex', 2],
    ['main.tex', 1],
    ['nested/main.tex', 2],
    ['other/deep/main.tex', 3],
    ['main.tex', 1],
  ] as const
  const compiler = new WasmTexCompiler({
    ...options,
    mainFile: cases[0][0],
    files: {
      'main.tex': source(1),
      'nested/main.tex': source(2),
      'other/deep/main.tex': source(3),
      'parts/body.tex': 'Shared input with mathematics $E=mc^2$.',
      'assets/figure.pdf': await image.save(),
    },
  })
  const reports = []
  try {
    await compiler.init()
    for (const [mainFile, pages] of cases) {
      compiler.setMainFile(mainFile)
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await compiler.compile()
        if (!result.success || !result.pdf) throw Error(`${mainFile}: ${result.log}`)
        const actualPages = (await PDFDocument.load(result.pdf)).getPageCount()
        if (actualPages !== pages) throw Error(`${mainFile}: expected ${pages} pages, got ${actualPages}`)
        const inputs = result.telemetry?.dependencyManifest?.projectInputs ?? []
        if (!inputs.includes(mainFile) || !inputs.includes('parts/body.tex')) {
          throw Error(`${mainFile}: missing source evidence: ${JSON.stringify(inputs)}`)
        }
        reports.push({ mainFile, repeat, pages, pdf: Array.from(result.pdf) })
      }
    }
    // Failure-output freshness is part of the XeTeX two-stage fix.
    if (options.engine === 'xelatex') {
      compiler.setMainFile('nested/main.tex')
      compiler.setFile('nested/main.tex', '\\documentclass{missing-nested-class}\\begin{document}Broken\\end{document}')
      const failed = await compiler.compile()
      if (failed.success || failed.pdf) throw Error(`Invalid source: success=${failed.success}, pdf=${failed.pdf?.length ?? 0}\n${failed.log}`)
      compiler.setFile('nested/main.tex', source(2))
      const recovered = await compiler.compile()
      if (!recovered.success || !recovered.pdf) throw Error(`Recovery failed: ${recovered.log}`)
      if ((await PDFDocument.load(recovered.pdf)).getPageCount() !== 2) throw Error('Recovery returned a stale PDF')
      reports.push({ mainFile: 'nested/main.tex', repeat: 0, pages: 2, pdf: Array.from(recovered.pdf) })
    }
    return reports
  } finally {
    compiler.dispose()
  }
}
