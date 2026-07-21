import type { FontGlyphGap } from '../types'
import { SCRIPT_FONTS } from './font-scripts'

/**
 * Fill `gap.suggestions` with mirror fonts that cover the gap's script, so a host can
 * offer a one-click substitute when the chosen font lacks the script's glyphs (#89,
 * L1b). Pure + synchronous (a static, generated catalog) — no network, headless.
 * The gap's own font is never suggested.
 */
export function enrichGlyphSuggestions(gaps: FontGlyphGap[]): void {
  for (const gap of gaps) {
    if (!gap.script) continue
    const candidates = (SCRIPT_FONTS[gap.script] ?? []).filter((f) => f !== gap.font)
    if (candidates.length > 0) gap.suggestions = candidates
  }
}
