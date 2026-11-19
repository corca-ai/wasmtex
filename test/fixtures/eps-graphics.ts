import { PDFDocument, PDFName, rgb } from 'pdf-lib'
import { WasmTexCompiler } from '../../src/headless'

const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 30 20
1 0 0 setrgbcolor 0 0 30 20 rectfill
%%EOF
`
const figure = 'images/red.eps'
const mainFile = 'paper/main.tex'
const source = String.raw`\documentclass{article}
\usepackage{graphicx}
\graphicspath{{images/}}
\begin{document}
\includegraphics{red.eps}
\end{document}`

export async function verifyEpsGraphics(options: {
  engine: 'pdflatex' | 'xelatex' | 'lualatex'
  texliveVersion: '2025' | '2026'
  texliveUrl: string
  assetBaseUrl?: string
}) {
  const image = await PDFDocument.create()
  image.addPage([30, 20]).drawRectangle({ width: 30, height: 20, color: rgb(1, 0, 0) })
  const pdf = await image.save({ useObjectStreams: false })
  let calls = 0
  let denyConversion = false
  const compiler = new WasmTexCompiler({
    ...options,
    files: { [mainFile]: source, [figure]: eps, 'images/unused.eps': eps },
    mainFile,
    disablePreambleSnapshot: true,
    epsConverter: async ({ path, bytes, signal }) => {
      signal.throwIfAborted()
      if (path !== figure || new TextDecoder().decode(bytes) !== eps)
        throw new Error(`Unexpected EPS request: ${path}`)
      calls++
      if (denyConversion) throw Error('fixture conversion failed')
      return pdf
    },
  })
  try {
    await compiler.init()
    const first = await compiler.compile()
    if (!first.success || !first.pdf || first.convertedEps?.[0] !== figure)
      throw new Error(`The worker did not embed the requested EPS: ${first.log}`)
    const compiled = await PDFDocument.load(first.pdf)
    const resources = compiled.getPage(0).node.Resources()
    if (!resources?.has(PDFName.of('XObject'))) throw Error('The EPS PDF was not embedded')
    const warm = await compiler.compile()
    if (!warm.success || !warm.pdf || warm.convertedEps?.[0] !== figure || calls !== 1)
      throw Error('A warm compile failed to reuse the converted EPS')
    if (
      compiler.getFile(figure) !== eps ||
      compiler.getFile(mainFile) !== source ||
      compiler.getFile('images/red-eps-converted-to.pdf') !== null
    ) throw Error('A conversion changed the project file inventory')
    denyConversion = true
    compiler.setFile('images/red-eps-converted-to.pdf', pdf)
    const companion = await compiler.compile()
    if (!companion.success || !companion.pdf || companion.errors.length || calls !== 1)
      throw Error('A project-provided companion did not take precedence')
    await compiler.loadProject({ [mainFile]: source, [figure]: eps })
    const failed = await compiler.compile()
    if (failed.success || failed.pdf || !failed.errors.some((error) =>
      error.file === figure && error.message.includes('fixture conversion failed'),
    )) throw new Error('A conversion failure reused a stale figure or returned a partial PDF')
    return { calls }
  } finally {
    compiler.dispose()
  }
}
