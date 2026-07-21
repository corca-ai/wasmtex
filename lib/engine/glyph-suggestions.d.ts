import { FontGlyphGap } from '../types';
/**
 * Fill `gap.suggestions` with mirror fonts that cover the gap's script, so a host can
 * offer a one-click substitute when the chosen font lacks the script's glyphs (#89,
 * L1b). Pure + synchronous (a static, generated catalog) — no network, headless.
 * The gap's own font is never suggested.
 */
export declare function enrichGlyphSuggestions(gaps: FontGlyphGap[]): void;
