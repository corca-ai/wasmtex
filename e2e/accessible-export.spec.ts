import { expect, test } from '@playwright/test'

/**
 * Accessible export acceptance (#84): `exportAccessiblePdf()` compiles the project with the
 * LaTeX tagging kernel on a sibling engine and reads the result back — a structure tree,
 * the document language, PDF/UA-2 identification, and figure alt coverage — while the
 * interactive compile keeps producing the plain PDF. Needs the TeX Live 2026 assets over
 * the network, so it lives in the Playwright suite.
 */
test.setTimeout(300_000)

const APP_URL = 'http://localhost:6001'

// A 1×1 red PNG.
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQBRqm2QAAAAAElFTkSuQmCC',
  ),
  (c) => c.charCodeAt(0),
)

const DOC = [
  '\\documentclass{article}',
  '\\usepackage[british]{babel}',
  '\\usepackage{graphicx}',
  '\\usepackage{hyperref}',
  '\\title{Tagged test}\\author{A. Author}',
  '\\begin{document}',
  '\\maketitle',
  '\\section{Intro}',
  'Text with math $E=mc^2$.',
  '\\begin{figure}[h]\\centering\\includegraphics[alt={A red pixel},width=1cm]{img.png}\\caption{With alt}\\end{figure}',
  '\\begin{figure}[h]\\centering\\includegraphics[width=1cm]{img.png}\\caption{Without alt}\\end{figure}',
  '\\begin{table}[h]\\centering\\begin{tabular}{lr}a & 1\\\\ b & 2\\end{tabular}\\caption{A table}\\end{table}',
  '\\end{document}',
  '',
].join('\n')

test('exportAccessiblePdf produces a tagged PDF/UA-2 file beside the plain preview (TeX Live 2026)', async ({
  page,
}) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ doc, png }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const c = new WasmTexCompiler({
        texliveVersion: '2026',
        engine: 'pdflatex',
        files: { 'main.tex': doc, 'img.png': new Uint8Array(png) },
      })
      try {
        await c.init()
        const plain = await c.compile()
        const t0 = performance.now()
        const exported = await c.exportAccessiblePdf()
        const exportMs = Math.round(performance.now() - t0)
        const plainAgain = await c.compile()
        const inspect = (await import('/src/engine/accessible-export.ts')).inspectPdfTagging
        return {
          plain: { success: plain.success, tagged: (await inspect(plain.pdf!)).tagged },
          plainAgain: { success: plainAgain.success, bytes: plainAgain.pdf?.byteLength },
          exportMs,
          exported: {
            success: exported.result.success,
            bytes: exported.result.pdf?.byteLength ?? 0,
            declaration: exported.declaration,
            documentClass: exported.documentClass,
            classSupport: exported.classSupport,
            kernelSupported: exported.kernelSupported,
            tagging: exported.tagging,
            notes: exported.notes,
            errors: exported.result.errors.map((e) => e.message.slice(0, 60)),
          },
        }
      } finally {
        c.dispose()
      }
    },
    { doc: DOC, png: Array.from(PNG) },
  )

  expect(out.plain.success).toBe(true)
  expect(out.plain.tagged, 'the preview compile must stay untagged').toBe(false)
  expect(out.plainAgain.success).toBe(true)

  expect(out.exported.success, JSON.stringify(out.exported.errors)).toBe(true)
  expect(out.exported.kernelSupported).toBe(true)
  expect(out.exported.declaration).toEqual({ lang: 'en-GB', standard: 'ua-2', injected: true })
  expect(out.exported.documentClass).toBe('article')
  expect(out.exported.classSupport).toBe('supported')
  expect(out.exported.tagging).toMatchObject({
    tagged: true,
    lang: 'en-GB',
    uaPart: 2,
    figures: 2,
    figuresWithAlt: 1,
  })
  expect(out.exported.tagging?.headings).toBeGreaterThan(0)
  expect(out.exported.tagging?.tables).toBeGreaterThan(0)
  expect(out.exported.notes.some((n) => /1 of 2 figures/.test(n))).toBe(true)
})

test('the TeX Live 2025 kernel is reported as lacking tagging instead of failing silently', async ({
  page,
}) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ doc, png }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const c = new WasmTexCompiler({
        texliveVersion: '2025',
        engine: 'pdflatex',
        files: { 'main.tex': doc, 'img.png': new Uint8Array(png) },
      })
      try {
        await c.init()
        const exported = await c.exportAccessiblePdf()
        return { kernelSupported: exported.kernelSupported, notes: exported.notes }
      } finally {
        c.dispose()
      }
    },
    { doc: DOC, png: Array.from(PNG) },
  )
  expect(out.kernelSupported).toBe(false)
  expect(out.notes.some((n) => /TeX Live 2026/.test(n))).toBe(true)
})
