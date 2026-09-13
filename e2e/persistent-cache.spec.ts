import { expect, test } from '@playwright/test'

const APP_URL = 'http://localhost:6001'
const TEXLIVE_VERSION = process.env.TEXLIVE_VERSION === '2026' ? '2026' : '2025'

// A document whose packages (xcolor, hyperref) are NOT in the warmup manifest,
// so the worker must fetch them on a cold first compile.
const DOC = [
  '\\documentclass{article}',
  '\\usepackage{xcolor}',
  '\\usepackage{hyperref}',
  '\\begin{document}',
  '\\typeout{WASMTEX-CACHE-PACKAGES}',
  '\\textcolor{red}{Hello} \\href{https://example.com}{link}.',
  '\\end{document}',
  '',
].join('\n')

async function waitReady(page: import('@playwright/test').Page) {
  await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
  await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 15_000 })
}

async function setDocAndCompile(page: import('@playwright/test').Page, content: string) {
  const marker = content.match(/\\typeout\{([^}]+)\}/)?.[1]
  if (!marker) throw new Error('Cache fixture must declare a compile log marker')
  const before = await page.evaluate(() => (window as any).__compileCount ?? 0)
  await page.evaluate((c) => (window as any).__editor.setValue(c), content)
  // The initial demo can still finish a queued pass after this edit. Its counter
  // increment is not completion of this fixture: match the TeX job's own marker.
  await page.waitForFunction(
    ({ before, marker }) => {
      const state = window as any
      return (state.__compileCount ?? 0) > before && state.__lastCompile?.log?.includes(marker)
    },
    { before, marker },
    { timeout: 90_000 },
  )
  await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 90_000 })
}

test.afterEach(async ({ page }, testInfo) => {
  const log = await page
    .evaluate(() => (window as any).__lastCompile?.log ?? 'No compile result')
    .catch(String)
  await testInfo.attach('engine.log', { body: log, contentType: 'text/plain' })
})

test.describe('Iteration 5: persistent TeX Live cache', () => {
  test('second load serves already-fetched packages without re-downloading', async ({ page }) => {
    // Start from a clean durable cache so the first session is genuinely cold.
    await page.goto(`${APP_URL}?cache=1&tl=${TEXLIVE_VERSION}`)
    await waitReady(page)
    await page.evaluate(() => (window as any).__engine.clearCache())
    await page.reload()
    await waitReady(page)

    // --- Session 1 (cold): fetches xcolor/hyperref and persists the cache. ---
    await setDocAndCompile(page, DOC)
    const coldDownloads = await page.evaluate(async () => {
      const w = window as any
      await w.__engine.persistTexliveCache()
      return w.__engine.getDownloadCount() as number
    })
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
    '\\typeout{WASMTEX-CACHE-TIMES}',
    'Times roman \\textbf{bold} \\textit{italic} text.',
    '\\end{document}',
    '',
  ].join('\n')

  test('rehydrated same-named TFM and VF entries still typeset', async ({ page }) => {
    await page.goto(`${APP_URL}?cache=1&tl=${TEXLIVE_VERSION}`)
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
    await page.goto(`${APP_URL}?cache=1&tl=${TEXLIVE_VERSION}`)
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
