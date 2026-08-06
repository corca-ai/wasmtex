import { SCRIPT_FONTS as e } from "./font-scripts.js";
//#region src/engine/glyph-suggestions.ts
function t(t) {
	for (let n of t) {
		if (!n.script) continue;
		let t = (e[n.script] ?? []).filter((e) => e !== n.font);
		t.length > 0 && (n.suggestions = t);
	}
}
//#endregion
export { t as enrichGlyphSuggestions };
