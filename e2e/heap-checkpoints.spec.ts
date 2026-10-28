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
const texliveVersion = process.env.TEXLIVE_VERSION === '2026' ? ('2026' as const) : ('2025' as const)
const texliveUrl =
  process.env.TEXLIVE_URL ??
  (texliveVersion === '2026'
    ? 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/'
    : 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/')

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
    async ({ doc, profile }) => {
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
        ...profile,
        engine: 'pdflatex',
        files: { 'main.tex': doc },
        incremental: true,
      })
      const plain = new WasmTexCompiler({
        ...profile,
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
        // Hosts like cortex re-assert the main file before every compile; that must not
        // drop the checkpoints.
        incremental.setMainFile('main.tex')
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
    { doc: DOC, profile: { texliveVersion, texliveUrl } },
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

test('compact source resumes within an unfinished paragraph and preserves full output', async ({ page }) => {
  await page.goto(APP_URL)
  const out = await page.evaluate(async (profile) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const strip = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)
      .replace(/\/(?:CreationDate|ModDate) ?\([^)]*\)/g, '')
      .replace(/\/ID ?\[[^\]]*\]/g, '')
    const source = '\\documentclass{article}\n\\usepackage{amsmath}\n\\begin{document}\n' +
      Array.from({ length: 12 }, (_, i) =>
        `\\section{Section ${i}}\\label{s${i}}\n` +
        'Some ordinary words for this section. '.repeat(25) + '\n' +
        '\\begin{equation} E=mc^2 \\end{equation}\n').join('') +
      '\\textbf{An unfinished\nparagraph spanning\nseveral lines with Editable text.}\n' +
      'See section \\ref{s5}.\n\\end{document}\n'
    const options = { ...profile, engine: 'pdflatex' as const, files: { 'main.tex': source } }
    const compiler = new WasmTexCompiler({ ...options, incremental: true,
      heapCheckpointOptions: { minHeadBytes: 0, maxCheckpoints: 1, maxBytes: 64 * 2 ** 20 } })
    const plain = new WasmTexCompiler(options)
    const rows = []
    try {
      await compiler.init()
      await plain.init()
      await compiler.compile()
      const prepared = await compiler.prepareIncrementalCompile('main.tex', source.indexOf('Editable'))
      for (const replacement of ['Edited once', 'Edited twice', 'Edited three times']) {
        const edited = source.replace('Editable', replacement)
        compiler.setFile('main.tex', edited)
        plain.setFile('main.tex', edited)
        const preview = await compiler.previewPages(1000)
        const full = await compiler.compile()
        const expected = await plain.compile()
        if (!full.pdf || !expected.pdf) throw new Error(JSON.stringify({full:full.log,expected:expected.log}))
        rows.push({
          success: full.success && expected.success,
          preview: !!preview?.synctex,
          previewIdentical: !!preview && strip(preview.pdf) === strip(expected.pdf!),
          resumed: full.phaseTimings?.checkpointResume === true,
          identical: strip(full.pdf!) === strip(expected.pdf!),
          auxIdentical: await compiler.readOutput('main.aux') === await plain.readOutput('main.aux'),
          synctex: !!full.synctex,
        })
      }
      // Editing the captured prefix must invalidate it, including macro/group state.
      const changed = source.replace('An unfinished', 'A changed unfinished')
      compiler.setFile('main.tex', changed)
      plain.setFile('main.tex', changed)
      const fallback = await compiler.compile()
      const expected = await plain.compile()
      return { rows, prepared, fallbackResumed: fallback.phaseTimings?.checkpointResume === true,
        fallbackIdentical: strip(fallback.pdf!) === strip(expected.pdf!) }
    } finally { compiler.dispose(); plain.dispose() }
  }, { texliveVersion, texliveUrl })
  expect(out.prepared).toBe(true)
  expect(out.rows).toHaveLength(3)
  for (const row of out.rows) expect(row).toEqual({ success: true, preview: true, resumed: true,
    identical: true, previewIdentical: true, auxIdentical: true, synctex: true })
  expect(out.fallbackResumed).toBe(false)
  expect(out.fallbackIdentical).toBe(true)
})

for (const command of ['include', 'subfile'] as const) {
  test(`indexed ${command} books reuse the edited chapter and preserve settled output`, async ({ page }) => {
    await page.route('**/*.worker.js*', async (route) => {
      const response = await route.fetch()
      const clock = `var NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-13T00:00:00Z'])); } static now() { return 1791849600000; } };\n`
      await route.fulfill({ response, body: (await response.text()).replace('Module["postRun"] = function() {', 'Module["postRun"] = function() {' + clock) })
    })
    await page.route('**/book-probe.html', (route) => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Book qualification</title>' }))
    await page.goto(`${APP_URL}/book-probe.html`)
    const out = await page.evaluate(async ({ command, texliveVersion, texliveUrl }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const main = '\\documentclass{book}\n\\usepackage{subfiles,makeidx,hyperref}\n\\makeindex\n\\begin{document}\n\\frontmatter\n\\tableofcontents\n\\mainmatter\n' +
        Array.from({ length: 6 }, (_, i) => `\\${command}{chapter${i + 1}}`).join('\n') + '\n\\printindex\n\\end{document}\n'
      const files: Record<string, string> = { 'main.tex': main }
      for (let i = 1; i <= 6; i++) {
        const body = `\\chapter{Chapter ${i}}\n` +
          'Every function preserves its structure.\\index{structure}\n\n' +
          'Composition respects identity and associativity. '.repeat(20) + '\n'
        files[`chapter${i}.tex`] = command === 'subfile'
          ? `\\documentclass[main]{subfiles}\n\\begin{document}\n${body}\\end{document}\n`
          : body
      }
      const options = { files, engine: 'pdflatex' as const, texliveVersion, texliveUrl }
      const candidate = new WasmTexCompiler({ ...options, incremental: true, heapCheckpointOptions: { maxCheckpoints: 1, maxBytes: 64 * 2 ** 20 } })
      const full = new WasmTexCompiler(options)
      const normalize = (pdf: Uint8Array | null) => {
        if (!pdf) return null
        let text = ''
        for (let i = 0; i < pdf.length; i += 8192) text += String.fromCharCode(...pdf.subarray(i, i + 8192))
        return text.replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '').replace(/\/ID\s*\[[^\]]*\]/g, '')
      }
      const hint = { incrementalPreparation: { path: 'chapter4.tex', offset: files['chapter4.tex']!.indexOf('Every function') } }
      try {
        await candidate.init()
        await full.init()
        const initial = await candidate.compile(hint)
        await full.compile()
        const settled = await full.compile()
        const wantedLine = main.slice(0, main.indexOf('{chapter4}')).split('\n').length
        const rows = []
        for (const replacement of ['Every mapping', 'Every morphism']) {
          const edited = files['chapter4.tex']!.replace('Every function', replacement)
          candidate.setFile('chapter4.tex', edited)
          full.setFile('chapter4.tex', edited)
          const actual = await candidate.compile(hint)
          const expected = await full.compile()
          const outputs = []
          for (const extension of ['aux', 'toc', 'ind', 'out']) {
            outputs.push(await candidate.readOutput(`main.${extension}`) === await full.readOutput(`main.${extension}`))
          }
          rows.push({ success: actual.success, resumed: actual.phaseTimings?.checkpointResume === true,
            pdf: normalize(actual.pdf) === normalize(expected.pdf), outputs: outputs.every(Boolean),
            errors: actual.errors, synctex: !!actual.synctex && String(actual.synctex) === String(expected.synctex) })
        }
        candidate.setFile('chapter4.tex', files['chapter4.tex']!)
        full.setFile('chapter4.tex', files['chapter4.tex']!)
        const early = files['chapter1.tex']!.replace('Every function', 'A changed function')
        candidate.setFile('chapter1.tex', early)
        full.setFile('chapter1.tex', early)
        const fallback = await candidate.compile(hint)
        const truth = await full.compile()
        return { rows, wantedLine, line: initial.heapCheckpoints?.[0]?.line,
          coldEqual: normalize(initial.pdf) === normalize(settled.pdf), coldErrors: initial.errors,
          fallback: { resumed: fallback.phaseTimings?.checkpointResume === true, equal: normalize(fallback.pdf) === normalize(truth.pdf) } }
      } finally { candidate.dispose(); full.dispose() }
    }, { command, texliveVersion, texliveUrl })
    expect(out.coldErrors).toEqual([])
    expect(out.coldEqual).toBe(true)
    expect(out.line).toBe(out.wantedLine)
    expect(out.rows).toHaveLength(2)
    for (const row of out.rows) expect(row).toEqual({ success: true, resumed: true, pdf: true, outputs: true, errors: [], synctex: true })
    expect(out.fallback).toEqual({ resumed: false, equal: true })
  })
}
