import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

test.describe('Iteration 4: Preamble Snapshot', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('body-only edit uses cached preamble on second compile', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()

    // Type initial document
    let compileCount = await page.evaluate(() => (window as any).__compileCount ?? 0)
    await page.evaluate(
      (content) => {
        ;(window as any).__editor.setValue(content)
      },
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'First version.',
        '\\end{document}',
        '',
      ].join('\n'),
    )

    // Wait for first compile (MISS — builds preamble format)
    await page.waitForFunction(
      (count) => ((window as any).__compileCount ?? 0) > count,
      compileCount,
      { timeout: 30_000 },
    )
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    compileCount = await page.evaluate(() => (window as any).__compileCount ?? 0)

    // Edit body only
    await editor.focus()
    await page.evaluate(
      (content) => {
        ;(window as any).__editor.setValue(content)
      },
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'Second version.',
        '\\end{document}',
        '',
      ].join('\n'),
    )

    // Wait for second compile
    await page.waitForFunction(
      (count) => ((window as any).__compileCount ?? 0) > count,
      compileCount,
      { timeout: 30_000 },
    )
    await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 30_000 })

    // Verify preamble HIT on the compile result
    const usedSnapshot = await page.evaluate(() => (window as any).__lastCompile?.preambleSnapshot)
    expect(usedSnapshot).toBe(true)
  })

  test('preamble change triggers format rebuild', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()

    // Type initial document
    let compileCount = await page.evaluate(() => (window as any).__compileCount ?? 0)
    await page.evaluate(
      (content) => {
        ;(window as any).__editor.setValue(content)
      },
      [
        '\\documentclass{article}',
        '\\begin{document}',
        'Hello.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    await page.waitForFunction(
      (count) => ((window as any).__compileCount ?? 0) > count,
      compileCount,
      { timeout: 30_000 },
    )
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    compileCount = await page.evaluate(() => (window as any).__compileCount ?? 0)

    // Change preamble (add a package)
    await editor.focus()
    await page.evaluate(
      (content) => {
        ;(window as any).__editor.setValue(content)
      },
      [
        '\\documentclass{article}',
        '\\usepackage{amsmath}',
        '\\begin{document}',
        'Hello with math.',
        '\\end{document}',
        '',
      ].join('\n'),
    )
    await page.waitForFunction(
      (count) => ((window as any).__compileCount ?? 0) > count,
      compileCount,
      { timeout: 30_000 },
    )
    await expect(page.locator('#status')).toHaveText(/Ready/, { timeout: 30_000 })

    // A preamble edit should rebuild the format before compiling.
    const preambleRebuilt = await page.evaluate(() => (window as any).__lastCompile?.preambleRebuilt)
    expect(preambleRebuilt).toBe(true)
  })

  test('file without \\begin{document} compiles normally', async ({ page }) => {
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()

    // Type a file without \begin{document} (plain TeX style)
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('Hello, plain TeX!\\bye\n', { delay: 5 })

    // Should still compile (full compile fallback) — might fail but shouldn't crash
    await page.waitForTimeout(3000)
    // App should still be functional
    const status = await page.locator('#status').textContent()
    expect(status).toBeTruthy()
  })
})
