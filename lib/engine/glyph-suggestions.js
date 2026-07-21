import { SCRIPT_FONTS as s } from "./font-scripts.js";
function e(n) {
  for (const t of n) {
    if (!t.script) continue;
    const i = (s[t.script] ?? []).filter((o) => o !== t.font);
    i.length > 0 && (t.suggestions = i);
  }
}
export {
  e as enrichGlyphSuggestions
};
