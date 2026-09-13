import { getStructuralSelectionIndex as e } from "./structural-selection.js";
import { buildFileContext as t } from "../engine/parse-errors.js";
//#region src/lsp/diagnostic-repair-compile.ts
function n(e, n, i, a, o) {
	if (e.length > 4e6 || o?.isCancellationRequested) return [];
	let s = e.split(/\r?\n/), c = t(s), l = new Set(i.getRootFiles(a)), u = [];
	for (let e = 0; e < s.length; e++) {
		if (o?.isCancellationRequested) return [];
		if (s[e] !== "! Undefined control sequence.") continue;
		let t = c[e];
		if (!t || !l.has(t)) continue;
		let a = r(s, e + 1, t, n, i);
		if (a && u.push(a), u.length > 1024) return [];
	}
	return u;
}
function r(e, t, n, r, o) {
	let s = i(e, t);
	if (!s) return null;
	let c = a(s.line, n, r, o);
	return s.command && c?.command !== s.command ? null : c;
}
function i(e, t) {
	let n = e[t] ?? "";
	if (n.startsWith("l.")) return { line: n };
	let r = /^<recently read> \\([A-Za-z]+)\s*$/.exec(n);
	if (!r) return null;
	let i = t + 1;
	for (; i < t + 4 && e[i]?.trim() === "";) i++;
	return {
		line: e[i] ?? "",
		command: r[1]
	};
}
function a(t, n, r, i) {
	let a = /^l\.(\d+) (.*\\([A-Za-z]+))$/.exec(t);
	if (!a || a[2].startsWith("...")) return null;
	let o = Number(a[1]), s = a[2], c = a[3], l = e(i.getFileSymbols(n)), u = r.readFile(n);
	if (!l || typeof u != "string") return null;
	let d = l.lineStarts[o - 1];
	if (d === void 0 || !u.startsWith(s, d)) return null;
	let f = d + s.length, p = f - c.length - 1, m = l.commands.find((e) => e.start === p);
	return !m || m.end !== f || m.value !== c ? null : {
		code: "undefined-control-sequence",
		file: n,
		command: c,
		range: {
			startOffset: p,
			endOffset: f
		},
		expectedText: u.slice(p, f),
		evidence: "direct-engine-error-context"
	};
}
//#endregion
export { n as undefinedCommandEvidence };
