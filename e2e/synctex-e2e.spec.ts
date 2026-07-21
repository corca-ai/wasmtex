import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

/**
 * Iteration 3 final gate: SyncTeX E2E verification.
 * - SyncTeX data generation from WASM engine
 * - Inverse search accuracy (click → correct source line)
 * - Forward search accuracy (source line → correct PDF region)
 * - Performance (< 50ms per lookup)
 */
test.describe('SyncTeX E2E Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('WASM engine produces synctex data', async ({ page }) => {
    // Wait for initial compile + synctex parse to settle
    await page.waitForTimeout(1_000)

    // Check that synctexData was set on the PDF viewer
    const synctexInfo = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      if (!viewer) return null
      const data = viewer.synctexData
      if (!data) return null
      return {
        inputCount: data.inputs.size,
        pageCount: data.pages.size,
        magnification: data.magnification,
        unit: data.unit,
        hasPageRoots: !!data.pageRoots && data.pageRoots.size > 0,
        hasFriendIndex: !!data.friendIndex && data.friendIndex.size > 0,
        page1NodeCount: data.pages.get(1)?.length ?? 0,
      }
    })

    expect(synctexInfo).toBeTruthy()
    expect(synctexInfo!.inputCount).toBeGreaterThan(0)
    expect(synctexInfo!.pageCount).toBeGreaterThan(0)
    expect(synctexInfo!.magnification).toBe(1000)
    expect(synctexInfo!.hasPageRoots).toBe(true)
    expect(synctexInfo!.hasFriendIndex).toBe(true)
    expect(synctexInfo!.page1NodeCount).toBeGreaterThan(10)

    console.log('SyncTeX data:', synctexInfo)
  })

  test('inverse search returns correct source lines', async ({ page }) => {
    // Use a simple doc with known line positions
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'First line of text.',
        'Second line of text.',
        'Third line of text.',
        '\\end{document}',
        '',
      ].join('\n'),
      { delay: 5 },
    )

    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()
    await page.waitForTimeout(1_500) // wait for synctex parse

    // Verify synctex is loaded
    const hasSynctex = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      return !!viewer?.synctexData
    })
    expect(hasSynctex).toBe(true)

    // Test inverse search programmatically for accuracy
    const results = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      if (!viewer?.synctexData) return null

      const parser = viewer.synctexParser
      const data = viewer.synctexData

      // Get page 1 nodes to find vertical positions of text lines
      const nodes = data.pages.get(1) || []
      const textNodes = nodes.filter(
        (n: any) => n.line >= 3 && n.line <= 5 && n.type !== 'vbox',
      )

      // Group by line to find y positions
      const linePositions = new Map<number, { h: number; v: number }>()
      for (const n of textNodes) {
        if (!linePositions.has(n.line)) {
          linePositions.set(n.line, { h: n.h, v: n.v })
        }
      }

      // Do inverse lookups at each line's position
      const lookupResults: Array<{
        clickLine: number
        clickH: number
        clickV: number
        resultLine: number | null
        resultFile: string | null
      }> = []

      for (const [line, pos] of linePositions) {
        const result = parser.inverseLookup(data, 1, pos.h + 5, pos.v)
        lookupResults.push({
          clickLine: line,
          clickH: pos.h,
          clickV: pos.v,
          resultLine: result?.line ?? null,
          resultFile: result?.file ?? null,
        })
      }

      return { nodeCount: nodes.length, textNodeCount: textNodes.length, lookupResults }
    })

    expect(results).toBeTruthy()
    console.log('Inverse search results:', JSON.stringify(results, null, 2))

    // Each inverse lookup should return the correct line (or very close)
    for (const r of results!.lookupResults) {
      expect(r.resultLine).not.toBeNull()
      // Allow ±1 line tolerance (SyncTeX may map to adjacent lines)
      expect(Math.abs(r.resultLine! - r.clickLine)).toBeLessThanOrEqual(1)
    }
  })

  test('forward search returns correct PDF regions', async ({ page }) => {
    // Use a simple doc
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()
    const beforeCompile = await page.evaluate(() => (window as any).__compileCount ?? 0)
    await page.evaluate(
      (content) => {
        ;(window as any).__editor.setValue(content)
      },
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'Line three content here.',
        '',
        'Line five paragraph.',
        '',
        'Line seven text.',
        '\\end{document}',
        '',
      ].join('\n'),
    )

    await page.waitForFunction(
      (count) => ((window as any).__compileCount ?? 0) > count,
      beforeCompile,
      { timeout: 15_000 },
    )
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()
    await page.waitForTimeout(1_500)

    const results = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      if (!viewer?.synctexData) return null

      const parser = viewer.synctexParser
      const data = viewer.synctexData

      // Find the input file name for main.tex
      let mainFile = ''
      for (const [, name] of data.inputs) {
        if (name === 'main.tex' || name.endsWith('/main.tex')) {
          mainFile = name
          break
        }
      }

      const lookups: Array<{
        line: number
        result: { page: number; x: number; y: number; width: number; height: number } | null
      }> = []

      // Test forward search for lines with content
      for (const line of [3, 5, 7]) {
        const result = parser.forwardLookup(data, mainFile, line)
        lookups.push({ line, result })
      }

      // Also test lines without direct content (should zigzag to nearby)
      for (const line of [4, 6]) {
        const result = parser.forwardLookup(data, mainFile, line)
        lookups.push({ line, result })
      }

      return { mainFile, lookups }
    })

    expect(results).toBeTruthy()
    console.log('Forward search results:', JSON.stringify(results, null, 2))

    // Lines with content should have results
    for (const r of results!.lookups.filter((l) => [3, 5, 7].includes(l.line))) {
      expect(r.result).toBeTruthy()
      expect(r.result!.page).toBe(1)
      expect(r.result!.width).toBeGreaterThan(0)
      expect(r.result!.height).toBeGreaterThan(0)
    }

    // Blank lines should also resolve (via zigzag to nearby lines)
    for (const r of results!.lookups.filter((l) => [4, 6].includes(l.line))) {
      expect(r.result).toBeTruthy()
    }

    // Forward results should be vertically ordered (line 3 < line 5 < line 7)
    const contentResults = results!.lookups
      .filter((l) => [3, 5, 7].includes(l.line) && l.result)
      .sort((a, b) => a.line - b.line)
    for (let i = 1; i < contentResults.length; i++) {
      expect(contentResults[i]!.result!.y).toBeGreaterThanOrEqual(
        contentResults[i - 1]!.result!.y,
      )
    }
  })

  test('lookup performance < 50ms', async ({ page }) => {
    // Use the default (richer) document for a realistic benchmark
    await page.waitForTimeout(1_500)

    const perf = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      if (!viewer?.synctexData) return null

      const parser = viewer.synctexParser
      const data = viewer.synctexData

      // Find main file
      let mainFile = ''
      for (const [, name] of data.inputs) {
        if (name === 'main.tex' || name.endsWith('/main.tex')) {
          mainFile = name
          break
        }
      }

      const pageCount = data.pages.size
      const iterations = 100

      // Benchmark inverse search
      const inverseStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const pg = (i % pageCount) + 1
        parser.inverseLookup(data, pg, 200 + (i % 100), 300 + (i % 200))
      }
      const inverseTotal = performance.now() - inverseStart
      const inverseAvg = inverseTotal / iterations

      // Benchmark forward search
      const forwardStart = performance.now()
      for (let i = 0; i < iterations; i++) {
        const line = (i % 80) + 1
        parser.forwardLookup(data, mainFile, line)
      }
      const forwardTotal = performance.now() - forwardStart
      const forwardAvg = forwardTotal / iterations

      return {
        iterations,
        pageCount,
        inverseAvgMs: inverseAvg,
        inverseTotalMs: inverseTotal,
        forwardAvgMs: forwardAvg,
        forwardTotalMs: forwardTotal,
      }
    })

    expect(perf).toBeTruthy()
    console.log('Performance:', perf)

    // KPI: each lookup < 50ms (should be well under 1ms actually)
    expect(perf!.inverseAvgMs).toBeLessThan(50)
    expect(perf!.forwardAvgMs).toBeLessThan(50)
  })

  test('inverse search accuracy on multi-page document', async ({ page }) => {
    // Use the default two-column math document (already loaded)
    await page.waitForTimeout(1_500)

    const accuracy = await page.evaluate(() => {
      const viewer = (window as any).__pdfViewer
      if (!viewer?.synctexData) return null

      const parser = viewer.synctexParser
      const data = viewer.synctexData
      let mainInput = -1
      for (const [tag, name] of data.inputs) {
        if (name === 'main.tex' || name.endsWith('/main.tex')) {
          mainInput = tag
          break
        }
      }

      // Collect all unique source lines from all nodes
      const allNodes: any[] = []
      for (const [, nodes] of data.pages) {
        for (const n of nodes) {
          if (n.input === mainInput && n.line > 0 && n.type !== 'vbox') {
            allNodes.push(n)
          }
        }
      }

      // Sample nodes across the document
      const step = Math.max(1, Math.floor(allNodes.length / 50))
      let correct = 0
      let closeMatch = 0
      let total = 0
      const misses: Array<{ expected: number; got: number | null; page: number }> = []

      for (let i = 0; i < allNodes.length; i += step) {
        const node = allNodes[i]
        const result = parser.inverseLookup(data, node.page, node.h + 1, node.v)
        total++

        if (result && result.line === node.line) {
          correct++
          closeMatch++
        } else if (result && Math.abs(result.line - node.line) <= 2) {
          closeMatch++
        } else {
          misses.push({
            expected: node.line,
            got: result?.line ?? null,
            page: node.page,
          })
        }
      }

      return {
        total,
        correct,
        closeMatch,
        exactAccuracy: (correct / total) * 100,
        closeAccuracy: (closeMatch / total) * 100,
        misses: misses.slice(0, 10), // first 10 misses for debugging
      }
    })

    expect(accuracy).toBeTruthy()
    console.log('Accuracy:', accuracy)

    // KPI: 90%+ accuracy (within ±2 lines) on complex two-column math document.
    // Equation-aware nearest-hbox fallback improved accuracy from 84% → 90%+.
    expect(accuracy!.closeAccuracy).toBeGreaterThanOrEqual(90)
  })
})
