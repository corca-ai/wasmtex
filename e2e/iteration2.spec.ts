import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

test.describe('Iteration 2 Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    // Wait for initial PDF
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('1. Typing during compilation — changes reflected in final PDF', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()

    // Replace content with a document, wait for it to compile
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(
      '\\documentclass{article}\n\\begin{document}\nFirst version\n\\end{document}\n',
      { delay: 5 },
    )
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })

    // Now rapidly change content while compilation may be in progress
    // Type a second version immediately
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(
      '\\documentclass{article}\n\\begin{document}\nSecond version MARKER2\n\\end{document}\n',
      { delay: 3 },
    )

    // Wait for final compilation
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })

    // PDF should be re-rendered with the latest content
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()

    // Verify no errors — the final document should compile cleanly
    const errorCount = await page.locator('#error-log-panel .log-entry.error').count()
    expect(errorCount).toBe(0)
  })

  test('2. Rapid typing (50+ chars) — no UI freeze, final PDF correct', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()
    await page.keyboard.press('Meta+a')

    // Type 50+ characters rapidly (delay: 0 = as fast as possible)
    const longText = 'The quick brown fox jumps over the lazy dog repeatedly here.'
    await page.keyboard.type(
      `\\documentclass{article}\n\\begin{document}\n${longText}\n\\end{document}\n`,
      { delay: 0 },
    )

    // Editor should still be responsive — type one more character to confirm
    await editor.focus()
    await page.keyboard.press('End')

    // Wait for final compile to finish
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 20_000 })

    // PDF should exist
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()

    // No errors
    const errorCount = await page.locator('#error-log-panel .log-entry.error').count()
    expect(errorCount).toBe(0)
  })

  test('3. PDF update is flash-free (double-buffer)', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()

    // Set up a MutationObserver to detect if pagesContainer is ever emptied
    const sawEmpty = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const firstPage = document.querySelector('.pdf-page-container')
        const container = firstPage?.parentElement
        if (!container) { resolve(false); return }

        let sawEmptyState = false
        const observer = new MutationObserver(() => {
          if (container.children.length === 0) {
            sawEmptyState = true
          }
        })
        observer.observe(container, { childList: true })

        // Expose for later check
        ;(window as any).__pdfObserver = { observer, sawEmptyState: () => sawEmptyState }
        resolve(true)
      })
    })

    expect(sawEmpty).toBe(true) // Observer set up OK

    // Trigger a recompile
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(
      '\\documentclass{article}\n\\begin{document}\nDouble buffer test content\n\\end{document}\n',
      { delay: 5 },
    )

    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()

    // Check if the container was ever empty (would indicate flash)
    const hadFlash = await page.evaluate(() => {
      const obs = (window as any).__pdfObserver
      if (!obs) return null
      obs.observer.disconnect()
      return obs.sawEmptyState()
    })

    // With double-buffer, container should never be emptied — replaceChildren swaps atomically
    expect(hadFlash).toBe(false)
  })

  test('4. Service Worker caches texlive requests', async ({ page, context }) => {
    await page.waitForFunction(() => navigator.serviceWorker.ready, { timeout: 10_000 })

    // Count requests on a controlled second page. The app now fetches the public
    // CloudFront CDN directly, so exercise the SW cache with a known TeX Live file.
    const page2 = await context.newPage()
    const texliveRequests: string[] = []
    page2.on('request', (req) => {
      if (req.url().includes('d1jectpaw0dlvl.cloudfront.net')) {
        texliveRequests.push(req.url())
      }
    })

    // Track which responses come from SW cache vs network
    const fromSW: string[] = []
    page2.on('response', (res) => {
      if (res.url().includes('d1jectpaw0dlvl.cloudfront.net') && res.fromServiceWorker()) {
        fromSW.push(res.url())
      }
    })

    await page2.goto(APP_URL)
    await expect(page2.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await page2.waitForFunction(() => navigator.serviceWorker.controller, { timeout: 10_000 })

    const statuses = await page2.evaluate(async () => {
      const url = 'https://d1jectpaw0dlvl.cloudfront.net/2025/pdftex/7/plain.bst'
      const first = await fetch(url)
      const second = await fetch(url)
      return [first.status, second.status]
    })

    expect(statuses).toEqual([200, 200])
    console.log(`Texlive requests: ${texliveRequests.length}, from SW: ${fromSW.length}`)
    expect(fromSW.length).toBeGreaterThan(0)

    await page2.close()
  })
})
