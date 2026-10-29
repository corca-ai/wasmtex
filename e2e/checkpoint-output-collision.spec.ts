import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'

const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const mirror = year === '2026' ? '2026-ba38749b8714505a' : '2025-0d3fc73b65e39905'
const controller = ['shared-file.js', 'resolver-evidence.js', 'kpse-resolve.cjs', 'pdftex-worker.js']
  .map(name => readFileSync(new URL(`../wasm-build/${name}`, import.meta.url), 'utf8')).join('\n')

test('an imported PDF cannot overwrite the checkpoint output prefix after a prose edit', async ({ page }) => {
  const old = await PDFDocument.create()
  old.addPage([100, 100])
  const importedPdf = Array.from(await old.save())
  await page.route('**/wasmtex-pdftex.worker.js*', route => route.fulfill({
    body: controller, contentType: 'application/javascript',
  }))
  await page.goto('http://localhost:6001')
  const result = await page.evaluate(async ({ importedPdf, year, mirror }) => {
    const { WasmTexCompiler } = await import('/src/headless.ts')
    const normalize = (pdf: Uint8Array) => new TextDecoder('latin1').decode(pdf)
      .replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '')
      .replace(/\/ID\s*\[[^\]]*\]/g, '')
    const source = '\\documentclass{book}\n\\begin{document}\n\\tableofcontents\n' +
      '\\chapter{First}\nOriginal first page.\n\n\\chapter{Second}\n' +
      'A paragraph before the edit.\n\nEditable last paragraph.\n\\end{document}\n'
    const options = { engine: 'pdflatex' as const, texliveVersion: year,
      texliveUrl: `https://texlive.corca.ai/snapshots/${mirror}/${year}/`,
      incremental: true, heapCheckpointOptions: { minHeadBytes: 0 },
      files: { 'main.tex': source, 'main.pdf': Uint8Array.from(importedPdf) } }
    const compiler = new WasmTexCompiler(options)
    const edited = source.replace('Editable', 'editable')
    const fresh = new WasmTexCompiler({ ...options, incremental: false,
      files: { ...options.files, 'main.tex': edited } })
    try {
      await compiler.init()
      const baseline = await compiler.compile({ incrementalPreparation: {
        path: 'main.tex', offset: source.indexOf('Editable'),
      } })
      compiler.setFile('main.tex', edited)
      const resumed = await compiler.compile()
      await fresh.init()
      const canonical = await fresh.compile()
      return { success: [baseline.success, resumed.success, canonical.success],
        resumed: resumed.phaseTimings?.checkpointResume,
        equal: normalize(resumed.pdf!) === normalize(canonical.pdf!) }
    } finally { fresh.dispose(); compiler.dispose() }
  }, { importedPdf, year, mirror })
  expect(result.success).toEqual([true, true, true])
  expect(result.resumed).toBe(true)
  expect(result.equal).toBe(true)
})
