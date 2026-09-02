import { expect, test } from '@playwright/test'

/**
 * TikZ figure externalization acceptance (#82): a document that calls `\tikzexternalize`
 * gets its pictures rendered by sibling figure jobs (no shell escape), the main job includes
 * them, and the library's MD5 keeps unchanged pictures out of later compiles. Needs the dev
 * server + engine assets (network), so it lives in the Playwright suite, not unit CI.
 */
test.setTimeout(300_000)

const APP_URL = 'http://localhost:6001'

const PICTURE = (label: string) =>
  [
    '\\begin{tikzpicture}[node distance=1.2cm, every node/.style={draw, circle}]',
    `  \\node (a) {${label}};`,
    '  \\node (b) [right=of a] {B};',
    '  \\draw[->] (a) -- (b);',
    '\\end{tikzpicture}\\par',
  ].join('\n')

const DOC = (labels: string[], text: string) =>
  [
    '\\documentclass{article}',
    '\\usepackage{tikz}',
    '\\usetikzlibrary{positioning}',
    '\\usetikzlibrary{external}',
    '\\tikzexternalize',
    '\\begin{document}',
    `\\section{Figures} ${text}`,
    ...labels.map(PICTURE),
    '\\end{document}',
    '',
  ].join('\n')

test('externalized figures render once and are reused across text edits', async ({ page }) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ first, textEdit, figureEdit }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const c = new WasmTexCompiler({
        texliveVersion: '2025',
        engine: 'pdflatex',
        files: { 'main.tex': first },
        tikzExternalization: { workers: 2 },
      })
      const summarize = (r: Awaited<ReturnType<typeof c.compile>>) => ({
        success: r.success,
        bytes: r.pdf?.byteLength ?? 0,
        figures: r.telemetry?.tikzExternalization ?? null,
        // The library's own fallback when `system()` is unavailable (not epstopdf's generic warning).
        shellEscapeErrors: r.log.split('\n').filter((l) => /Package tikz Error: Sorry, the system call/.test(l)).length,
        notFound: r.log.split('\n').filter((l) => /file not found|not up-to-date/i.test(l)).length,
      })
      try {
        await c.init()
        const a = summarize(await c.compile())
        c.setFile('main.tex', textEdit)
        const b = summarize(await c.compile())
        c.setFile('main.tex', figureEdit)
        const d = summarize(await c.compile())
        return { a, b, d, figlist: await c.readOutput('_preamble.figlist') }
      } finally {
        c.dispose()
      }
    },
    {
      first: DOC(['A', 'B', 'C'], 'first'),
      textEdit: DOC(['A', 'B', 'C'], 'second'),
      figureEdit: DOC(['A', 'B', 'changed'], 'second'),
    },
  )

  expect(out.a.success, 'first compile failed').toBe(true)
  expect(out.figlist).toContain('_preamble-figure0')
  expect(out.a.figures).toMatchObject({ figures: 3, compiled: 3, reused: 0, failed: [] })
  expect(out.a.shellEscapeErrors, 'figures fell back to shell escape').toBe(0)
  expect(out.a.notFound, 'final PDF still misses figures').toBe(0)

  // Text edit: every picture reused, nothing rendered.
  expect(out.b.success).toBe(true)
  expect(out.b.figures).toMatchObject({ figures: 3, compiled: 0, reused: 3 })
  expect(out.b.bytes).toBeGreaterThan(0)

  // One picture edited: exactly that one re-rendered.
  expect(out.d.success).toBe(true)
  expect(out.d.figures).toMatchObject({ figures: 3, compiled: 1, reused: 2 })
  expect(out.d.notFound).toBe(0)
})

const PLAIN = (labels: string[], body = '') =>
  [
    '\\documentclass{article}',
    '\\usepackage{tikz}',
    '\\usetikzlibrary{positioning}',
    '\\begin{document}',
    '\\section{Intro}\\label{sec:intro}',
    body,
    ...labels.map(PICTURE),
    '\\end{document}',
    '',
  ].join('\n')

test('auto mode externalizes plain TikZ documents, resolves refs, surfaces picture errors, and refuses the unsafe ones', async ({
  page,
}) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ plain, ref, broken, overlay, few, fatal }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const compile = async (files: Record<string, string>, times = 1) => {
        const c = new WasmTexCompiler({
          texliveVersion: '2025',
          engine: 'pdflatex',
          files,
          tikzExternalization: { mode: 'auto', workers: 2 },
        })
        try {
          await c.init()
          let r = await c.compile()
          for (let i = 1; i < times; i++) r = await c.compile()
          return {
            success: r.success,
            figures: r.telemetry?.tikzExternalization ?? null,
            errors: r.errors.map((e) => `${e.line}:${e.message.slice(0, 40)}`),
            undefinedRefs: r.log.split('\n').filter((l) => /undefined refer/i.test(l)).length,
          }
        } finally {
          c.dispose()
        }
      }
      return {
        plain: await compile({ 'main.tex': plain }),
        ref: await compile({ 'main.tex': ref }, 2),
        broken: await compile({ 'main.tex': broken }),
        overlay: await compile({ 'main.tex': overlay }),
        few: await compile({ 'main.tex': few }),
        fatal: await compile({ 'main.tex': fatal }),
        brokenLine: broken.split('\n').findIndex((l) => l.includes('undefinedmacro')) + 1,
      }
    },
    {
      plain: PLAIN(['A', 'B', 'C']),
      ref: PLAIN(['A', 'B', 'see \\ref{sec:intro}']),
      broken: PLAIN(['A', 'B']) .replace(
        '\\end{document}',
        '\\begin{tikzpicture}\\node{\\undefinedmacro};\\end{tikzpicture}\n\\end{document}',
      ),
      overlay: PLAIN(['A', 'B', 'C'], '\\begin{tikzpicture}[remember picture, overlay]\\end{tikzpicture}'),
      few: PLAIN(['A', 'B']),
      // A runaway argument: the figure job ends with "no output PDF file produced".
      fatal: PLAIN(['A', 'B']).replace(
        '\\end{document}',
        '\\begin{tikzpicture}\\draw (0,0) -- (1,;\\end{tikzpicture}\n\\end{document}',
      ),
    },
  )

  expect(out.plain.success).toBe(true)
  expect(out.plain.figures).toMatchObject({ mode: 'auto', figures: 3, compiled: 3, failed: [] })

  // \ref inside a picture resolves from the main job's aux (second compile settles it).
  expect(out.ref.success).toBe(true)
  expect(out.ref.figures).toMatchObject({ mode: 'auto', figures: 3 })
  expect(out.ref.undefinedRefs, 'ref inside an externalized picture stayed undefined').toBe(0)

  // A broken picture does not fail its figure job, but its error reaches `errors` at the
  // right line.
  expect(out.broken.figures).toMatchObject({ mode: 'auto', figures: 3 })
  expect(out.broken.figures?.pictureErrors).toBeGreaterThan(0)
  expect(out.broken.errors.some((e) => e.startsWith(`${out.brokenLine}:`)), JSON.stringify(out.broken.errors)).toBe(true)

  // Page-anchored pictures and too few pictures stay inline, and say why.
  expect(out.overlay.figures).toMatchObject({ mode: 'auto', figures: 0, blocked: 'remember-picture' })
  expect(out.few.figures).toMatchObject({ mode: 'auto', figures: 0, blocked: 'too-few-pictures' })

  // A picture that kills its figure job either falls back to an inline compile or is reported;
  // never a silent placeholder.
  expect(out.fatal.figures?.mode).toBe('auto')
  expect(
    out.fatal.figures?.fallback === true || (out.fatal.figures?.pictureErrors ?? 0) > 0,
    JSON.stringify(out.fatal),
  ).toBe(true)
})
