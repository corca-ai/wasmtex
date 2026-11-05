import { expect, type Page, test } from '@playwright/test'

/**
 * Each case here failed, or quietly lost content, until the mirror selected every run
 * file a LaTeX document can reach and the engines made bitmap fonts from Metafont
 * source. The mirror's Bloom filter hides a missing file from any route-based test, so
 * these compile against the real snapshot.
 */
const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' as const : '2025' as const
const texliveUrl = process.env.TEXLIVE_URL ?? 'https://texlive.corca.ai/snapshots/2025-2e1df8aa17d29d66/2025/'
type Engine = 'pdflatex' | 'xelatex' | 'lualatex'

async function compile(page: Page, engine: Engine, files: Record<string, string>) {
  await page.goto('/')
  return page.evaluate(async (options) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const compiler = new WasmTexCompiler(options)
    try {
      await compiler.init()
      const { success, pdf, errors, log } = await compiler.compile()
      return {
        success,
        pdf: pdf?.length ?? 0,
        errors: errors.filter(({ severity }) => severity === 'error').map(({ message }) => message),
        log,
      }
    } finally {
      compiler.dispose()
    }
  }, { files, engine, texliveVersion: year, texliveUrl })
}

const document = (preamble: string, body: string) => [
  '\\documentclass{article}',
  preamble,
  '\\begin{document}',
  body,
  '\\end{document}',
  '',
].join('\n')

function expectClean(result: Awaited<ReturnType<typeof compile>>) {
  expect(result.errors).toEqual([])
  expect(result.success).toBe(true)
  expect(result.pdf).toBeGreaterThan(0)
}

for (const engine of ['pdflatex', 'xelatex', 'lualatex'] as const) {
  test(`${engine} makes a bitmap font from Metafont source`, async ({ page }) => {
    test.setTimeout(240_000)
    const result = await compile(page, engine, {
      'main.tex': document('\\usepackage{bbm}', '$\\mathbbm{R}$ and {\\font\\x=dancers at 14pt\\x abc}'),
    })
    expectClean(result)
  })
}

test('XeLaTeX ligates quotes and dashes through tex-text', async ({ page }) => {
  test.setTimeout(240_000)
  const result = await compile(page, 'xelatex', {
    'main.tex': document('', [
      '\\setbox0\\hbox{``}\\setbox1\\hbox{\\textquotedblleft}',
      '\\typeout{QUOTES \\ifdim\\wd0=\\wd1 LIGATED\\else LITERAL\\fi}',
      "``Quoted'' -- dash",
    ].join('\n')),
  })
  expectClean(result)
  expect(result.log).toContain('QUOTES LIGATED')
})

test('LuaLaTeX runs MetaPost through luamplib', async ({ page }) => {
  test.setTimeout(240_000)
  const result = await compile(page, 'lualatex', {
    'main.tex': document(
      '\\usepackage{luamplib}',
      '\\begin{mplibcode}\nbeginfig(1); draw fullcircle scaled 20; endfig;\n\\end{mplibcode}',
    ),
  })
  expectClean(result)
})

test('pdfLaTeX places a MetaPost figure', async ({ page }) => {
  test.setTimeout(240_000)
  const result = await compile(page, 'pdflatex', {
    'main.tex': document('\\usepackage{graphicx}', '\\includegraphics{figure.mps}'),
    'figure.mps': [
      '%!PS',
      '%%BoundingBox: 0 0 20 20',
      '%%Creator: MetaPost 2.11',
      '%%EndProlog',
      '0 0 moveto 20 20 lineto stroke',
      'showpage',
      '%%EOF',
      '',
    ].join('\n'),
  })
  expectClean(result)
})

test('a secondary list reaches the document', async ({ page }) => {
  test.setTimeout(240_000)
  const result = await compile(page, 'pdflatex', {
    'main.tex': document(
      '\\usepackage{nomencl}\\makenomenclature',
      '\\IfFileExists{main.nls}{\\typeout{NOMENCLATURE READ}}{}Text\\nomenclature{$a$}{A symbol}\\printnomenclature',
    ),
  })
  expectClean(result)
  expect(result.log).toContain('NOMENCLATURE READ')
})

test('XeLaTeX refuses an unknown font without downloading every font', async ({ page }) => {
  test.setTimeout(120_000)
  const requests: string[] = []
  page.on('request', (request) => {
    if (/\/pdftex\/(?:36|47)\//.test(request.url())) requests.push(request.url())
  })
  const result = await compile(page, 'xelatex', {
    'main.tex': document('', '\\font\\x="No Such Font Family" \\x Text'),
  })
  expect(result.log).toContain('No Such Font Family')
  expect(requests.length).toBeLessThan(20)
})
