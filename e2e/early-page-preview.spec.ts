import { expect, test } from '@playwright/test'

// Qualify with the same annual assets and mirrors as heap-checkpoints.spec.ts.
test('shared checkpoints retain an opening fallback and preserve backward-edit output', async ({
  page,
}, info) => {
  test.setTimeout(180_000)
  const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
  const mirror =
    process.env.TEXLIVE_URL ??
    (year === '2026'
      ? 'https://texlive.corca.ai/snapshots/2026-d26706764b740276/2026/'
      : 'https://texlive.corca.ai/snapshots/2025-2e1df8aa17d29d66/2025/')
  // DocumentMetadata writes wall-clock dates into XMP as well as PDF info.
  // Freeze only engine wall time; keep byte comparison strict and browser timings real.
  await page.route('**/wasmtex-pdftex*.worker.js*', async (route) => {
    const response = await route.fetch()
    const clock = `var NativeDate = Date; Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : ['2026-10-13T00:00:00Z'])); } static now() { return 1791849600000; } };\n`
    const body = await response.text()
    const startup = 'Module["postRun"] = function() {'
    if (!body.includes(startup)) throw new Error('Missing engine clock qualification boundary')
    await route.fulfill({ response, body: body.replace(startup, startup + clock) })
  })
  await page.route('**/early-preview-probe.html', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Early preview qualification</title>',
    }),
  )
  await page.goto('/early-preview-probe.html')
  const result = await page.evaluate(
    async ({ year, mirror }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const source =
        '\\DocumentMetadata{lang=en-US}\n\\documentclass[11pt,twocolumn]{article}\n' +
        '\\usepackage{tikz,amsmath,amssymb,hyperref}\n\\begin{document}\n' +
        '\\begin{abstract}\nA representative mathematical introduction.\n\\end{abstract}\n\n' +
        '\\section{Vectors}\n\nA vector in $\\mathbb{R}^n$ is an ordered list.\n\n' +
        '\\[\\mathbf{v}=(v_1,\\ldots,v_n).\\]\n\n' +
        'Later paragraph with independent coordinates and vector operations.\n\n' +
        'Repeated prose explains the relationship between bases and transformations. '.repeat(80) +
        '\n\\section{Matrices}\\label{matrices}\nSee section \\ref{matrices}.\n\\end{document}\n'
      const options = {
        engine: 'pdflatex' as const,
        texliveVersion: year,
        texliveUrl: mirror,
        files: { 'main.tex': source },
      }
      const candidate = new WasmTexCompiler({
        ...options,
        incremental: true,
        heapCheckpointOptions: { minHeadBytes: 0, maxCheckpoints: 2, maxBytes: 64 * 2 ** 20 },
      })
      const plain = new WasmTexCompiler(options)
      const normalize = (bytes: Uint8Array | null) =>
        bytes &&
        new TextDecoder('latin1')
          .decode(bytes)
          .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
          .replace(/\/ID\s*\[[^\]]*\]/g, '')
      const hint = {
        incrementalPreparation: { path: 'main.tex', offset: source.indexOf('Later paragraph') },
      }
      try {
        await candidate.init()
        await plain.init()
        const baseline = await candidate.compile(hint)
        const bodyLine = source.slice(0, source.indexOf('\\begin{document}')).split('\n').length + 1
        const rows = []
        for (const [before, after] of [
          ['A vector in', 'Every vector in'],
          ['A representative', 'This representative'],
        ] as const) {
          const edited = source.replace(before, after)
          candidate.setFile('main.tex', edited)
          plain.setFile('main.tex', edited)
          const started = performance.now()
          const preview = await candidate.previewPages(2)
          const previewMs = performance.now() - started
          const actual = await candidate.compile(hint)
          const expected = await plain.compile()
          const expectedPreview = await plain.previewPages(2)
          rows.push({
            preview: !!preview,
            previewMs,
            prefixEqual:
              normalize(preview?.pdf ?? null) === normalize(expectedPreview?.pdf ?? null),
            resumed: actual.phaseTimings?.checkpointResume === true,
            fullEqual: normalize(actual.pdf) === normalize(expected.pdf),
            errors: actual.errors,
          })
          candidate.setFile('main.tex', source)
          await candidate.compile(hint)
        }
        return {
          rows,
          bodyLine,
          checkpoints: baseline.heapCheckpoints?.map((cp) => cp.line),
          retention: baseline.heapCheckpointRetention,
          errors: baseline.errors,
        }
      } finally {
        candidate.dispose()
        plain.dispose()
      }
    },
    { year, mirror },
  )
  await info.attach('early-preview-evidence', {
    contentType: 'application/json',
    body: JSON.stringify(result),
  })
  expect(result.errors).toEqual([])
  expect(result.checkpoints).toContain(result.bodyLine)
  expect(result.retention?.ids.length).toBeLessThanOrEqual(2)
  expect(result.retention?.bytes).toBeLessThanOrEqual(64 * 2 ** 20)
  expect(result.rows[0]?.resumed).toBe(true)
  for (const row of result.rows)
    expect(row).toMatchObject({ preview: true, prefixEqual: true, fullEqual: true, errors: [] })
})
