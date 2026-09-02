import { expect, test } from '@playwright/test'

/**
 * Heap checkpoints (#81): with `incremental: true` the headless compiler loads the Asyncify
 * engine build, arms a checkpoint before the edited region on every full compile, and serves
 * later edits after that point by resuming the suspended run — a complete PDF from a fraction
 * of the typesetting, byte-identical (modulo per-run stamps) to a full compile. Needs the
 * checkpoint engine asset and TeX Live over the network, so it lives in the Playwright suite.
 */
test.setTimeout(300_000)

const APP_URL = 'http://localhost:6001'

const LOREM =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
const section = (i: number) =>
  `\\section{Section ${i}}\n${Array.from({ length: 5 }, (_, k) => `${LOREM} Paragraph ${k + 1} of section ${i}.`).join('\n\n')}\n\\begin{equation} E_{${i}}=\\sum_{k=1}^{${i}}\\frac{k^2}{\\sqrt{k+1}} \\end{equation}\n`
/** ~24 pages, no \clearpage anywhere: the page-break checkpoints of #55 never apply here. */
const DOC = `\\documentclass{article}\\usepackage{amsmath}\n\\begin{document}\n${Array.from({ length: 40 }, (_, i) => section(i + 1)).join('\n')}\n\\end{document}\n`

test('edits after a heap checkpoint resume the suspended run and match a full compile', async ({
  page,
}) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(
    async ({ doc }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const strip = (u8: Uint8Array) => {
        let t = ''
        for (let i = 0; i < u8.length; i += 8192) t += String.fromCharCode(...u8.subarray(i, i + 8192))
        return t.replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '').replace(/\/ID ?\[[^\]]*\]/g, '')
      }
      const summarize = (r: Awaited<ReturnType<WasmTexCompiler['compile']>>, ms: number) => ({
        ms: Math.round(ms),
        success: r.success,
        bytes: r.pdf?.byteLength ?? 0,
        resumed: r.phaseTimings?.checkpointResume === true,
        checkpoints: (r.heapCheckpoints ?? []).map((c) => c.line),
        synctex: !!r.synctex,
      })
      const incremental = new WasmTexCompiler({
        texliveVersion: '2025',
        engine: 'pdflatex',
        files: { 'main.tex': doc },
        incremental: true,
      })
      const plain = new WasmTexCompiler({
        texliveVersion: '2025',
        engine: 'pdflatex',
        files: { 'main.tex': doc },
      })
      try {
        await incremental.init()
        await plain.init()
        // First compile (cold): no baseline yet, arms a checkpoint before the end of the document.
        const first = await incremental.compile()
        // Warm baseline: the edit region is known now (unchanged document → arm near the end).
        const base = await incremental.compile()
        // The first compile armed a checkpoint before the last paragraphs. An edit in section 38
        // lies before it: a full compile, which arms a checkpoint before section 37.
        const edit1 = doc.replace(
          'Paragraph 3 of section 38.',
          'Paragraph 3 of section 38, EDITED.',
        )
        incremental.setFile('main.tex', edit1)
        let t0 = performance.now()
        const fast1 = await incremental.compile()
        const fast1ms = performance.now() - t0
        plain.setFile('main.tex', edit1)
        await plain.compile()
        t0 = performance.now()
        const full1 = await plain.compile()
        const full1ms = performance.now() - t0
        // Edits after that checkpoint resume from it — twice, it is reusable.
        const edit2 = edit1.replace(
          'Paragraph 2 of section 39.',
          'Paragraph 2 of section 39 changed as well.',
        )
        incremental.setFile('main.tex', edit2)
        t0 = performance.now()
        const fast2 = await incremental.compile()
        const fast2ms = performance.now() - t0
        plain.setFile('main.tex', edit2)
        const full2 = await plain.compile()
        const edit3 = edit2.replace(
          'Paragraph 4 of section 38.',
          'Paragraph 4 of section 38 with more words to reflow the paragraph.',
        )
        incremental.setFile('main.tex', edit3)
        t0 = performance.now()
        const fast3 = await incremental.compile()
        const fast3ms = performance.now() - t0
        plain.setFile('main.tex', edit3)
        const full3 = await plain.compile()
        // An edit before every checkpoint cannot resume: a full compile, still correct.
        const edit4 = edit3.replace(
          'Paragraph 1 of section 2.',
          'Paragraph 1 of section 2 (early edit).',
        )
        incremental.setFile('main.tex', edit4)
        const early = await incremental.compile()
        plain.setFile('main.tex', edit4)
        const full4 = await plain.compile()
        return {
          first: summarize(first, 0),
          base: summarize(base, 0),
          fast1: summarize(fast1, fast1ms),
          full1: summarize(full1, full1ms),
          fast1Identical: strip(fast1.pdf!) === strip(full1.pdf!),
          fast2: summarize(fast2, fast2ms),
          fast2Identical: strip(fast2.pdf!) === strip(full2.pdf!),
          fast3: summarize(fast3, fast3ms),
          fast3Identical: strip(fast3.pdf!) === strip(full3.pdf!),
          early: summarize(early, 0),
          earlyIdentical: strip(early.pdf!) === strip(full4.pdf!),
        }
      } finally {
        incremental.dispose()
        plain.dispose()
      }
    },
    { doc: DOC },
  )

  expect(out.first.success).toBe(true)
  expect(out.first.checkpoints.length, 'the first compile must arm a checkpoint').toBeGreaterThan(0)
  expect(out.fast1.success).toBe(true)
  expect(out.fast1Identical).toBe(true)
  expect(out.fast1.checkpoints.length, 'a full compile arms a checkpoint before the edit').toBeGreaterThan(0)
  expect(out.fast2.resumed, 'the edit after the checkpoint must resume, not recompile').toBe(true)
  expect(out.fast2.synctex).toBe(true)
  expect(out.fast2Identical).toBe(true)
  expect(out.fast3.resumed, 'the checkpoint is reusable for a second edit').toBe(true)
  expect(out.fast3Identical).toBe(true)
  expect(out.early.resumed).toBe(false)
  expect(out.earlyIdentical).toBe(true)
  // Informational: how much faster the resumes were.
  console.log(JSON.stringify({ full1: out.full1.ms, fast2: out.fast2.ms, fast3: out.fast3.ms }))
})
