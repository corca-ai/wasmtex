import { expect, test } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

// A document whose packages (xcolor, hyperref) are NOT in the warmup manifest,
// so the worker must fetch them on a cold first compile.
const DOC = [
  '\\documentclass{article}',
  '\\usepackage{xcolor}',
  '\\usepackage{hyperref}',
  '\\begin{document}',
  '\\textcolor{red}{Hello} \\href{https://example.com}{link}.',
  '\\end{document}',
  '',
].join('\n')

async function waitReady(page: import('@playwright/test').Page) {
  await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
  await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function setDocAndCompile(page: import('@playwright/test').Page, content: string) {
  const before = await page.evaluate(() => (window as any).__compileCount ?? 0)
  await page.evaluate((c) => (window as any).__editor.setValue(c), content)
  await page.waitForFunction((n) => ((window as any).__compileCount ?? 0) > n, before, {
    timeout: 90_000,
  })
  await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 90_000 })
}

test.describe('Iteration 5: persistent TeX Live cache', () => {
  test('second load serves already-fetched packages without re-downloading', async ({ page }) => {
    // Start from a clean durable cache so the first session is genuinely cold.
    await page.goto(`${APP_URL}?cache=1`)
    await waitReady(page)
    await page.evaluate(() => (window as any).__engine.clearCache())
    await page.reload()
    await waitReady(page)

    // --- Session 1 (cold): fetches xcolor/hyperref and persists the cache. ---
    const coldDownloads = await page.evaluate(async (doc) => {
      const w = window as any
      w.__editor.setValue(doc)
      // Wait for the compile triggered by the edit.
      const start = w.__compileCount ?? 0
      await new Promise<void>((resolve) => {
        const id = setInterval(() => {
          if ((w.__compileCount ?? 0) > start && w.__lastCompile) {
            clearInterval(id)
            resolve()
          }
        }, 100)
      })
      await w.__engine.persistTexliveCache()
      return w.__engine.getDownloadCount() as number
    }, DOC)
    expect(coldDownloads).toBeGreaterThan(0)

    // --- Session 2 (warm): reload; the durable cache seeds the worker. ---
    await page.reload()
    await waitReady(page)
    await setDocAndCompile(page, DOC)
    const warmDownloads = await page.evaluate(() => (window as any).__engine.getDownloadCount())

    const pct = Math.round((1 - warmDownloads / coldDownloads) * 100)
    console.log(
      `[persistent-cache] cold on-demand downloads=${coldDownloads}, ` +
        `warm=${warmDownloads}, reduction=${pct}%`,
    )

    // The whole point: the second load re-downloads ~nothing it has already seen.
    expect(warmDownloads).toBeLessThan(coldDownloads)
    expect(warmDownloads).toBeLessThanOrEqual(Math.max(2, Math.floor(coldDownloads * 0.1)))
  })

  // psnfss Times fonts: kpathsea requests the TFM (format 3) and the VF (format 33)
  // under the same bare name (`ptmr7t`). A rehydrated cache must keep them apart,
  // or the second session typesets with nullfont / fails with "Bad metric (TFM) file".
  const TIMES_DOC = [
    '\\documentclass{article}',
    '\\usepackage{times}',
    '\\begin{document}',
    'Times roman \\textbf{bold} \\textit{italic} text.',
    '\\end{document}',
    '',
  ].join('\n')

  test('rehydrated same-named TFM and VF entries still typeset', async ({ page }) => {
    await page.goto(`${APP_URL}?cache=1`)
    await waitReady(page)
    await page.evaluate(() => (window as any).__engine.clearCache())
    await page.reload()
    await waitReady(page)

    await setDocAndCompile(page, TIMES_DOC)
    const cold = await page.evaluate(async () => {
      const w = window as any
      await w.__engine.persistTexliveCache()
      return { ok: w.__lastCompile?.success, bytes: w.__lastCompile?.pdf?.byteLength ?? 0 }
    })
    expect(cold.ok).toBe(true)

    await page.reload()
    await waitReady(page)
    await setDocAndCompile(page, TIMES_DOC)
    const warm = await page.evaluate(() => {
      const w = window as any
      return {
        ok: w.__lastCompile?.success,
        bytes: w.__lastCompile?.pdf?.byteLength ?? 0,
        badMetric: /Bad metric \(TFM\) file|not loadable/.test(w.__lastCompile?.log ?? ''),
        downloads: w.__engine.getDownloadCount() as number,
      }
    })
    expect(warm.badMetric).toBe(false)
    expect(warm.ok).toBe(true)
    // Same fonts, same text: the rehydrated session must produce the same-sized PDF.
    expect(warm.bytes).toBe(cold.bytes)
    expect(warm.downloads).toBe(0)
  })

  test('clearCache() forces a cold re-fetch on the next load', async ({ page }) => {
    await page.goto(`${APP_URL}?cache=1`)
    await waitReady(page)
    await setDocAndCompile(page, DOC)
    await page.evaluate(async () => {
      const w = window as any
      await w.__engine.persistTexliveCache()
      await w.__engine.clearCache()
    })

    await page.reload()
    await waitReady(page)
    await setDocAndCompile(page, DOC)
    const afterClear = await page.evaluate(() => (window as any).__engine.getDownloadCount())
    // With the durable cache cleared, the warm path is gone: the worker fetches again.
    expect(afterClear).toBeGreaterThan(0)
  })
})
