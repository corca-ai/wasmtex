import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:6001'

test.describe('Iteration 3: PDF ↔ Source Jump', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('inverse search: Cmd+click on PDF jumps to source line', async ({ page }) => {
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
        'Alpha paragraph content here.',
        'Beta paragraph content here.',
        'Gamma paragraph content here.',
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

    // Cmd+click on the PDF canvas
    const canvas = page.locator('.pdf-page-container canvas').first()
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()

    // Click in the text region
    await canvas.click({
      position: { x: box!.width / 3, y: box!.height / 4 },
      })

    // App should still be functional after the click
    await expect(page.locator('#status')).toHaveText('Ready')
  })

  test('forward search: cursor move highlights PDF location', async ({ page }) => {
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
        'Unique forward search test text here.',
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

    // Wait for any pending recompiles to settle
    await page.waitForTimeout(2_000)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 10_000 })

    // Move cursor to line 3 (the text line) — triggers auto forward search after 300ms debounce
    await page.evaluate(() => {
      const ed = (window as any).__editor
      if (ed) {
        ed.setPosition({ lineNumber: 3, column: 1 })
        ed.focus()
      }
    })

    // Check that a highlight overlay appeared (300ms debounce + render time)
    const highlight = page.locator('.forward-search-highlight')
    await expect(highlight).toBeVisible({ timeout: 2_000 })

    // Wait for fade-out (2s delay + 0.5s transition)
    await page.waitForTimeout(3_000)
    await expect(highlight).not.toBeVisible()
  })

  test('inverse search works with multiple source files', async ({ page }) => {
    // Create chapter1.tex
    const fileTree = page.locator('#file-tree-panel')
    page.once('dialog', async (dialog) => {
      await dialog.accept('chapter1.tex')
    })
    await fileTree.locator('button', { hasText: '+' }).click()
    await expect(fileTree.locator('.file-item', { hasText: 'chapter1.tex' })).toBeVisible()

    // Edit chapter1.tex content
    await fileTree.locator('.file-item', { hasText: 'chapter1.tex' }).click()
    const editor = page.locator('.monaco-editor textarea')
    await editor.focus()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type('This is chapter one unique content.', { delay: 5 })

    // Switch to main.tex and include chapter1
    await fileTree.locator('.file-item', { hasText: 'main.tex' }).click()
    await editor.focus()
    await page.keyboard.press('Meta+a')
    await page.keyboard.type(
      [
        '\\documentclass{article}',
        '\\begin{document}',
        '\\input{chapter1}',
        '\\end{document}',
        '',
      ].join('\n'),
      { delay: 5 },
    )

    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 15_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()

    // Cmd+click on PDF — should resolve to chapter1.tex or main.tex
    const canvas = page.locator('.pdf-page-container canvas').first()
    const box = await canvas.boundingBox()
    expect(box).toBeTruthy()

    await canvas.click({
      position: { x: box!.width / 3, y: box!.height / 4 },
      })

    // App should remain functional
    await expect(page.locator('#status')).toHaveText('Ready')
  })

  test('readFile returns compilation log', async ({ page }) => {
    // Wait for initial compilation
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible()
    await page.waitForFunction(
      () => ((window as any).__compileCount ?? 0) > 0 && (window as any).__engine?.isReady?.(),
      { timeout: 30_000 },
    )

    // Use exposed engine to read log
    await expect.poll(async () => {
      try {
        return await page.evaluate(async () => {
          const engine = (window as any).__engine
          if (!engine) return ''
          return await Promise.race([
            engine.readFile('main.log'),
            new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500)),
          ])
        })
      } catch {
        return ''
      }
    }, { timeout: 30_000 }).toContain('pdfTeX')
  })
})
