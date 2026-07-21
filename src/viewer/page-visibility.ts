/**
 * Pick the page number with the greatest visible height from a map of
 * `pageNumber → visibleHeightPx`.
 *
 * Using visible height (not `intersectionRatio`) is what makes the page indicator
 * correct for pages taller than the viewport: such a page's ratio can never reach a
 * fixed threshold like 0.5, so a threshold-based observer would never mark it current.
 * Greatest-visible-height always resolves to the page filling most of the viewport.
 * Ties break to the smaller page number (deterministic). Returns null when nothing is
 * visible.
 */
export function pickMostVisiblePage(visibleHeights: Map<number, number>): number | null {
  let best: number | null = null
  let bestHeight = 0
  for (const [page, height] of visibleHeights) {
    if (height <= 0) continue
    if (best === null || height > bestHeight || (height === bestHeight && page < best)) {
      best = page
      bestHeight = height
    }
  }
  return best
}
