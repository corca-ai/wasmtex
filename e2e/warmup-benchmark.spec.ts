import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

test.describe('Warmup Benchmark', () => {
  test.setTimeout(120_000)

  test('with warmup: count sync XHR', async ({ page }) => {
    const downloaded: string[] = []
    const failed: string[] = []
    const allLogs: string[] = []

    page.on('console', (msg) => {
      const text = msg.text()
      allLogs.push(`[${msg.type()}] ${text}`)
      if (text.includes('[kpse] Downloaded:')) downloaded.push(text)
      else if (text.includes('[kpse] Failed:')) failed.push(text)
    })

    page.on('pageerror', (err) => {
      allLogs.push(`[PAGE ERROR] ${err.message}`)
    })

    const start = Date.now()
    await page.goto(APP_URL)

    // Wait for first successful compile (canvas OR error after 60s)
    try {
      await page.waitForFunction(
        () => document.querySelector('.pdf-page-container canvas') !== null,
        { timeout: 60_000 },
      )
    } catch {
      console.log('\n=== TIMEOUT: Page did not render PDF canvas ===')
      console.log('Last 30 console messages:')
      for (const log of allLogs.slice(-30)) console.log(`  ${log}`)
      throw new Error('PDF canvas not found after 60s')
    }

    const totalTimeMs = Date.now() - start
    await page.waitForTimeout(3000)

    console.log('\n╔══════════════════════════════════════╗')
    console.log('║   WITH WARMUP                        ║')
    console.log('╠══════════════════════════════════════╣')
    console.log(`║  [kpse] Downloaded: ${String(downloaded.length).padStart(3)}              ║`)
    console.log(`║  [kpse] Failed:     ${String(failed.length).padStart(3)}              ║`)
    console.log(`║  Total sync XHR:    ${String(downloaded.length + failed.length).padStart(3)}              ║`)
    console.log(`║  Time to first PDF: ${String(totalTimeMs).padStart(5)}ms          ║`)
    console.log('╚══════════════════════════════════════╝')

    if (downloaded.length > 0) {
      console.log('\nUnexpected downloaded files:')
      for (const f of downloaded) console.log(`  ${f}`)
    }
    if (failed.length > 0) {
      console.log('\nUnexpected failed files:')
      for (const f of failed) console.log(`  ${f}`)
    }

    // With warmup, we expect ZERO sync XHR
    expect(downloaded.length).toBe(0)
    expect(failed.length).toBe(0)
  })
})
