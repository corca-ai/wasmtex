import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

const year = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'
const texliveUrl = process.env.TEXLIVE_URL ?? (year === '2026'
  ? 'https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/'
  : 'https://texlive.corca.ai/snapshots/2025-0d3fc73b65e39905/2025/')
// Exercise authored controller changes against pinned native engines before a
// release exists. Distribution qualification separately uses the built receipt.
const controller = ['shared-file.js', 'resolver-evidence.js', 'kpse-resolve.cjs', 'pdftex-worker.js'].map((name) =>
  readFileSync(new URL(`../wasm-build/${name}`, import.meta.url), 'utf8')).join('\n')

test.setTimeout(300_000)
for (const command of ['include', 'subfile'] as const) {
 for (const inside of [false,true]) {
  test(`bounded ${command} book forks ${inside ? "chapter-local" : "chapter-boundary"} previews without changing canonical outputs`, async ({ page }) => {
    await page.route('**/wasmtex-pdftex.worker.js*', (route) => route.fulfill({
      body: controller, contentType: 'application/javascript',
    }))
    await page.goto('http://localhost:6001')
    // Git repositories often retain a PDF beside its matching TeX source.
    const imported = await PDFDocument.create()
    imported.addPage([100, 100])
    const importedPdf = Array.from(await imported.save())
    const out = await page.evaluate(async ({ year, texliveUrl, command, inside, importedPdf }) => {
      const { WasmTexCompiler } = await import('/src/headless.ts')
      const strip = (pdf: Uint8Array) => {
        let text = ''
        for (let at = 0; at < pdf.length; at += 8192)
          text += String.fromCharCode(...pdf.subarray(at, at + 8192))
        return text.replace(/\/(?:CreationDate|ModDate)\s*\([^)]*\)/g, '').replace(/\/ID\s*\[[^\]]*\]/g, '')
      }
      const synctexText = async (bytes: Uint8Array | null) => bytes
        ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : null
      const prose = 'Every function preserves its structure. Composition respects identity and associativity. '
      const files: Record<string, string> = { 'main.tex': '\\documentclass{book}\n\\usepackage{makeidx,subfiles}\n\\makeindex\n\\begin{document}\n\\tableofcontents\n' +
        Array.from({ length: 22 }, (_, i) => `\\${command}{ch${i + 1}}`).join('\n') +
        '\n\\printindex\n\\end{document}\n' }
      for (let i = 1; i <= 22; i++) files[`ch${i}.tex`] =
        (command === 'subfile' ? '\\documentclass[main]{subfiles}\n\\begin{document}\n' : '') +
        `\\chapter{Chapter ${i}}\n` + Array.from({ length: 4 }, () => prose.repeat(8) + '\\index{composition}\n\n').join('') +
        (command === 'subfile' ? '\\end{document}\n' : '')
      const options = { texliveVersion: year, texliveUrl, engine: 'pdflatex' as const,
        incremental: true, files: { ...files, 'main.pdf': Uint8Array.from(importedPdf) }, heapCheckpointOptions: { maxCheckpoints: 32, maxBytes: 256 * 2 ** 20, minHeadBytes: 0 } }
      const compiler = new WasmTexCompiler(options)
      let sibling: Awaited<ReturnType<typeof compiler.createPagePreviewSession>> = null
      try {
        await compiler.init()
        const offset = inside ? files['ch12.tex'].lastIndexOf('Every') : files['ch12.tex'].indexOf('Every')
        const hint = {path:'ch12.tex',offset}
        const baseline = await compiler.compile({incrementalPreparation:hint})
        if (inside && !baseline.heapCheckpoints?.some(cp => cp.path === 'ch12.tex' && cp.prefixSafe))
          throw new Error('Chapter-local checkpoint was not captured')
        const auxiliary = async () => Object.fromEntries(await Promise.all(
          ['main.aux', 'main.toc', 'main.ind', ...Array.from({ length: 22 }, (_, i) => `ch${i + 1}.aux`)]
            .map(async (path) => [path, await compiler.getFile(path)])))
        const baselineAux = await auxiliary()
        sibling = await compiler.createPagePreviewSession(hint)
        if (!sibling) throw new Error('Capable checkpoint worker did not create a preview session')
        const original = files['ch12.tex'], changed = original.slice(0,offset) + original.slice(offset).replace('Every function', 'Each  function')
        compiler.setFile('ch12.tex', changed)
        const canonical = compiler.compile()
        sibling.setFile('ch12.tex', changed)
        const first = await sibling.previewPages(30)
        sibling.setFile('ch12.tex', original)
        const revertedPreview = await sibling.previewPages(30)
        sibling.setFile('ch12.tex', changed)
        const repeatedPreview = await sibling.previewPages(30)
        const full = await canonical
        const changedAux = await auxiliary()
        const verification = await compiler.createPagePreviewSession(hint)
        const sameWorkerPreview = await verification?.previewPages(30)
        verification?.dispose()
        compiler.setFile('ch12.tex', original)
        const reverted = await compiler.compile()
        const revertedAux = await auxiliary()
        // Invalidate every later checkpoint by changing an already-read chapter.
        compiler.setFile('ch1.tex', files['ch1.tex'].replace('Every function', 'Each  function'))
        const early = await compiler.compile()
        const fresh = new WasmTexCompiler({ ...options, incremental: false,
          files: { ...files, 'ch1.tex': files['ch1.tex'].replace('Every function', 'Each  function') } })
        try {
          await fresh.init(); const settled = await fresh.compile()
          return { held: baseline.heapCheckpointRetention, first: !!first,
            previewChanged: !!first && !!revertedPreview && strip(first.pdf) !== strip(revertedPreview.pdf),
            repeatExact: !!first && !!repeatedPreview && strip(first.pdf) === strip(repeatedPreview.pdf),
            matchesCanonicalPrefix: !!first && !!sameWorkerPreview && strip(first.pdf) === strip(sameWorkerPreview.pdf),
            revertedExact: strip(baseline.pdf!) === strip(reverted.pdf!),
            earlyExact: strip(early.pdf!) === strip(settled.pdf!),
            earlySynctex: !!early.synctex, fullSynctex: !!full.synctex,
            synctexReverted: await synctexText(baseline.synctex) === await synctexText(reverted.synctex),
            earlySynctexExact: await synctexText(early.synctex) === await synctexText(settled.synctex),
            retained: full.heapCheckpointRetention,
            auxiliaryReverted: JSON.stringify(baselineAux) === JSON.stringify(revertedAux),
            index: typeof changedAux['main.ind'] === 'string' && changedAux['main.ind'].includes('composition') }
        } finally { fresh.dispose() }
      } finally { sibling?.dispose(); compiler.dispose() }
    }, { year, texliveUrl, command, inside, importedPdf })
    console.log(JSON.stringify(out))
    expect(out.held?.ids.length).toBeGreaterThanOrEqual(22)
    expect(out.held!.bytes).toBeLessThanOrEqual(256 * 2 ** 20)
    expect(out.retained!.bytes).toBeLessThanOrEqual(256 * 2 ** 20)
    expect(out.first).toBe(true)
    expect(out.previewChanged).toBe(true)
    expect(out.repeatExact).toBe(true)
    expect(out.matchesCanonicalPrefix).toBe(true)
    expect(out.revertedExact).toBe(true)
    expect(out.earlyExact).toBe(true)
    expect(out.earlySynctex).toBe(true)
    expect(out.fullSynctex).toBe(true)
    expect(out.synctexReverted).toBe(true)
    expect(out.earlySynctexExact).toBe(true)
    expect(out.index).toBe(true)
    expect(out.auxiliaryReverted).toBe(true)
  })
}
}
