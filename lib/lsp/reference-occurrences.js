import { tokenize as e } from "./latex-tokenizer.js";
import { maskSpansFromTokens as t } from "./latex-parser.js";
//#region src/lsp/reference-occurrences.ts
function n(n) {
	let r = e(n), i = t(r).sort((e, t) => e[0] - t[0] || e[1] - t[1]), a = 0, o = new Set(r.filter((e) => e.type === "command").map((e) => e.start)), s = [];
	for (let e of n.matchAll(/\\(label|ref|eqref|pageref|cite)\s*\{([^{}\\%#]+)\}/g)) {
		for (; i[a] && i[a][1] <= e.index;) a++;
		let t = i[a];
		if (t && t[0] <= e.index && e.index < t[1] || !o.has(e.index)) continue;
		let n = e[1];
		if (n !== "label" && n !== "ref" && n !== "eqref" && n !== "pageref" && n !== "cite") continue;
		let r = e[2].split(",").map((e) => e.trim());
		r.some((e) => !e || /\s/.test(e)) || n !== "cite" && r.length !== 1 || s.push({
			command: n,
			from: e.index,
			to: e.index + e[0].length,
			keys: r
		});
	}
	return s;
}
//#endregion
export { n as getReferenceOccurrences };
