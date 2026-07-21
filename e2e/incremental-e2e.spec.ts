import { expect, test } from '@playwright/test'

/**
 * Incremental fast path in the editor loop (#99): a late-section edit is served from a
 * checkpoint (fast paint). With the Phase 2 SyncTeX splice the fast paint carries EXACT
 * SyncTeX, so the reconcile is skipped — this test asserts the fast paint engages, NO full
 * reconcile follows, and inverse search is correct on the fast paint itself. Opt-in via
 * `?incremental=1` (see main.ts / readDemoConfig).
 */
const APP_URL = 'http://localhost:6001/?incremental=1'

// N sections separated by \clearpage (checkpoint boundaries). The head (sections 1..N-1) is
// well over the 2000-byte minimum, and each section's MARKER is plain text away from \section
// / math, so editing the last one is a `final` (label-safe) tail edit — the servable case.
const N = 8
function buildDoc(lastMarker: string): string {
  const filler =
    'The quick brown fox jumps over the lazy dog and the typesetting stays measurable across pages. '.repeat(
      4,
    )
  const sections = Array.from({ length: N }, (_, i) => {
    const n = i + 1
    const marker = n === N ? lastMarker : `S${n}`
    return `\\section{Section ${n}}\n${filler}\n\nMarker-${n}: ${marker} is the editable token here.\n\n${filler}\n`
  })
  return (
    '\\documentclass{article}\n\\begin{document}\n' +
    sections.map((s, i) => s + (i < sections.length - 1 ? '\n\\clearpage\n' : '')).join('\n') +
    '\n\\end{document}\n'
  )
}

// biome-ignore lint/suspicious/noExplicitAny: window debug globals set by the demo (main.ts)
type Win = any

test.describe('Incremental fast path (#99)', () => {
  test('late edit → exact fast paint with no reconcile (SyncTeX spliced)', async ({ page }) => {
    await page.goto(APP_URL)
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 60_000 })
    await expect(page.locator('.pdf-page-container canvas').first()).toBeVisible({
      timeout: 15_000,
    })

    // Load a CLEAN single-file project (loadProject clears the default sample + auto-compiles),
    // so the incremental baseline is exactly our multi-page doc — no lingering sample files.
    await page.evaluate(() => {
      ;(window as Win).__fullReadys = 0
      ;(window as Win).__incrementalPaints = 0
    })
    await page.evaluate((content) => {
      ;(window as Win).__wasmTex.loadProject({ 'main.tex': content })
    }, buildDoc('BASE'))
    // That first full compile seeds the baseline (our doc has no \ref/\cite → no rerun).
    await page.waitForFunction(() => (window as Win).__fullReadys >= 1, null, { timeout: 60_000 })
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 60_000 })
    await page.waitForTimeout(300) // let noteFull + any settle land before we measure

    // Reset counters; the next edit is what we measure.
    await page.evaluate(() => {
      ;(window as Win).__incrementalPaints = 0
      ;(window as Win).__fullReadys = 0
    })

    // Edit ONLY the last section's marker (after the last \clearpage): a servable final tail edit.
    await page.evaluate((content) => {
      ;(window as Win).__editor.setValue(content)
    }, buildDoc('EDITED'))

    // (1) The fast path engages — an incremental fast paint is rendered.
    await page.waitForFunction(() => (window as Win).__incrementalPaints >= 1, null, {
      timeout: 30_000,
    })

    // (2) Phase 2 throughput win: the SyncTeX splice makes the fast paint exact, so NO full
    // reconcile follows. Give a reconcile ample time to (not) happen, then assert it didn't.
    await expect(page.locator('#status')).toHaveText('Ready', { timeout: 30_000 })
    await page.waitForTimeout(2_000)
    const counts = await page.evaluate(() => {
      const g = window as Win
      return {
        inc: g.__incrementalPaints ?? 0,
        full: g.__fullReadys ?? 0,
        success: g.__lastCompile?.success,
        errors: g.__lastCompile?.errors?.length ?? 0,
      }
    })
    expect(counts.inc).toBeGreaterThanOrEqual(1) // the fast paint engaged
    expect(counts.full).toBe(0) // …and the reconcile was skipped (merged SyncTeX is exact)

    // (3) No correctness regression: the fast paint succeeded with no errors.
    expect(counts.success).toBe(true)
    expect(counts.errors).toBe(0)

    // (4) Inverse search is EXACT immediately (from the merged SyncTeX, with no reconcile):
    // an inverse lookup on a real node of the edited tail page resolves to its source line.
    const inverse = await page.evaluate(() => {
      const viewer = (window as Win).__pdfViewer
      const data = viewer?.synctexData
      if (!data) return { hasSynctex: false, checked: 0, correct: 0 }
      const parser = viewer.synctexParser
      let mainInput = -1
      for (const [tag, name] of data.inputs) {
        if (name === 'main.tex' || String(name).endsWith('/main.tex')) {
          mainInput = tag
          break
        }
      }
      // Sample nodes from the LAST page (the edited tail region).
      const lastPage = Math.max(...[...data.pages.keys()])
      const nodes = (data.pages.get(lastPage) || []).filter(
        (n: { input: number; line: number; type: string }) =>
          n.input === mainInput && n.line > 0 && n.type !== 'vbox',
      )
      let checked = 0
      let correct = 0
      for (let i = 0; i < nodes.length; i += Math.max(1, Math.floor(nodes.length / 8))) {
        const n = nodes[i]
        const r = parser.inverseLookup(data, lastPage, n.h + 1, n.v)
        checked++
        if (r && Math.abs(r.line - n.line) <= 2) correct++
      }
      return { hasSynctex: true, lastPage, checked, correct }
    })
    expect(inverse.hasSynctex).toBe(true)
    expect(inverse.checked).toBeGreaterThan(0)
    // The merged SyncTeX maps the edited tail correctly (allow ±2 lines like the other synctex
    // e2e), so click-to-source works on the fast paint itself — no reconcile needed.
    expect(inverse.correct).toBeGreaterThan(inverse.checked / 2)
  })
})
