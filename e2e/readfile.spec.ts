import { test, expect } from '@playwright/test'

test('engine.readFile returns .log after compilation', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 30_000 })
  await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 10_000 })

  // Read the .log file via the exposed engine instance
  await expect.poll(async () => {
    try {
      return await page.evaluate(async () => {
        const engine = (window as any).__engine
        return await engine.readFile('main.log')
      })
    } catch {
      return ''
    }
  }, { timeout: 10_000 }).toContain('main.tex')
})
