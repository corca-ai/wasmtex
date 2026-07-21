import { expect, test } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

// A realistic preamble whose setup (hyperref, color, amsmath) is non-trivial to
// re-execute on every keystroke — exactly the cost preamble snapshots remove.
function doc(body: string): string {
  return [
    '\\documentclass{article}',
    '\\usepackage{amsmath}',
    '\\usepackage{xcolor}',
    '\\usepackage{hyperref}',
    '\\begin{document}',
    body,
    '\\[ E = mc^2 \\]',
    '\\end{document}',
    '',
  ].join('\n')
}

test.describe('Iteration 4: Preamble Snapshot benchmark & correctness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // Edit the body, wait for the resulting compile, and return its CompileResult.
  async function compileBody(page: import('@playwright/test').Page, body: string) {
    const before = await page.evaluate(() => (window as any).__compileCount ?? 0)
    await page.evaluate((src) => (window as any).__editor.setValue(src), doc(body))
    await page.waitForFunction((n) => ((window as any).__compileCount ?? 0) > n, before, {
      timeout: 60_000,
    })
    await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 60_000 })
    return page.evaluate(() => {
      const r = (window as any).__lastCompile
      return {
        compileTime: r.compileTime as number,
        success: r.success as boolean,
        hasPdf: !!r.pdf,
        hasSynctex: !!r.synctex,
        preambleSnapshot: r.preambleSnapshot as boolean | undefined,
        preambleRebuilt: r.preambleRebuilt as boolean | undefined,
      }
    })
  }

  function setSnapshot(page: import('@playwright/test').Page, enabled: boolean) {
    return page.evaluate((en) => (window as any).__engine.setPreambleSnapshot(en), enabled)
  }

  test('body-only edits are materially faster with snapshots than full compiles', async ({
    page,
  }) => {
    // --- Baseline: snapshots OFF (every compile re-runs the full preamble) ---
    await setSnapshot(page, false)
    // Warm-up compile downloads packages into the worker's in-memory FS so the
    // measured compiles below reflect typesetting cost, not network fetches.
    await compileBody(page, 'Warm up the package cache.')
    const fullA = await compileBody(page, 'Full compile sample A.')
    const fullB = await compileBody(page, 'Full compile sample B.')
    expect(fullA.preambleSnapshot).toBeFalsy()
    expect(fullB.preambleSnapshot).toBeFalsy()
    const baseline = Math.min(fullA.compileTime, fullB.compileTime)

    // --- Snapshot ON: first compile rebuilds the .fmt, then body edits hit it ---
    await setSnapshot(page, true)
    const miss = await compileBody(page, 'Rebuild snapshot here.')
    expect(miss.preambleRebuilt).toBe(true)
    const hitA = await compileBody(page, 'Snapshot hit sample A.')
    const hitB = await compileBody(page, 'Snapshot hit sample B.')
    expect(hitA.preambleSnapshot).toBe(true)
    expect(hitB.preambleSnapshot).toBe(true)
    const snapshot = Math.min(hitA.compileTime, hitB.compileTime)

    const pct = Math.round((1 - snapshot / baseline) * 100)
    console.log(
      `[preamble-benchmark] full-compile baseline=${Math.round(baseline)}ms, ` +
        `snapshot-hit=${Math.round(snapshot)}ms, reduction=${pct}%`,
    )

    // Correctness: both modes succeed and produce a PDF + SyncTeX.
    for (const r of [fullA, fullB, hitA, hitB]) {
      expect(r.success).toBe(true)
      expect(r.hasPdf).toBe(true)
      expect(r.hasSynctex).toBe(true)
    }

    // The whole point of the feature: body-only recompiles are faster.
    expect(snapshot).toBeLessThan(baseline)
  })

  test('disablePreambleSnapshot opt-out keeps the engine producing valid PDFs', async ({
    page,
  }) => {
    // With snapshots disabled, a normal edit still compiles cleanly and never
    // takes the snapshot path.
    await setSnapshot(page, false)
    const result = await compileBody(page, 'Opt-out smoke test.')
    expect(result.success).toBe(true)
    expect(result.hasPdf).toBe(true)
    expect(result.preambleSnapshot).toBeFalsy()
  })
})
