import { newlineLength as e, sourceNewline as t } from "./source-position.js";
import { getStructuralSelectionIndex as n } from "./structural-selection.js";
import { isConditionalOpener as r } from "./latex-parser.js";
import { consumeRepairArguments as i } from "./diagnostic-repair-arguments.js";
//#region src/lsp/diagnostic-repair-preamble.ts
var a = /* @__PURE__ */ new Map([
	["begingroup", 1],
	["bgroup", 1],
	["endgroup", -1],
	["egroup", -1]
]), o = /* @__PURE__ */ new Map([
	["ifx", 2],
	["newif", 1],
	["ifdefined", 1]
]);
function s(e, r, i, a, o) {
	if (e.length > 1e6 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(a)) return null;
	let s = n(r);
	if (!s || r.classes.length !== 1) return null;
	let d = s.commands.filter((t) => {
		if (t.value !== "begin") return !1;
		let n = t.end;
		for (; /\s/.test(s.masked[n] ?? "") && n < e.length;) n++;
		let r = s.groups.get(n);
		return s.masked[n] === "{" && r !== void 0 && s.masked.slice(n + 1, r).trim() === "document";
	});
	if (d.length !== 1) return null;
	let f = d[0];
	if (!u(s, f.start)) return null;
	let p = l(e, s, f.start);
	if (p === null) return null;
	let m = c(e, s, p, Math.min(f.start, o ?? Infinity));
	if (m === null) return null;
	let h = t(e), g = m === 0 || /[\r\n]/.test(e[m - 1]) ? "" : h;
	return {
		file: i,
		range: {
			startOffset: m,
			endOffset: m
		},
		expectedText: "",
		newText: `${g}\\usepackage{${a}}${h}`
	};
}
function c(t, n, r, a) {
	let o = r, s = new Map(n.commands.map((e) => [e.start, e]));
	for (let e of n.commands) {
		if ([
			"input",
			"include",
			"subfile"
		].includes(e.value) && (a = Math.min(a, e.start)), e.value !== "PassOptionsToPackage") continue;
		let r = i(t, n, s, e.end, [{ kind: "required" }, { kind: "required" }]);
		if (!r || r.missing.length || !u(n, e.start)) return null;
		o = Math.max(o, r.insertOffset);
	}
	return o += e(t, o), o <= a ? o : null;
}
function l(t, n, r) {
	let a = n.commands.filter((e) => e.value === "documentclass");
	if (a.length !== 1) return null;
	let o = a[0];
	if (o.start >= r || !u(n, o.start)) return null;
	let s = i(t, n, new Map(n.commands.map((e) => [e.start, e])), o.end, [
		{ kind: "optional" },
		{ kind: "required" },
		{ kind: "optional" }
	]);
	if (!s || s.missing.length || s.insertOffset > r) return null;
	let c = s.insertOffset;
	return c += e(t, c), c;
}
function u(e, t) {
	for (let [n, r] of e.groups) if (n < t && r > t) return !1;
	return d(e, t);
}
function d(e, t) {
	let n = 0, i = 0, o = f(e);
	if (!o) return !1;
	for (let s of e.commands) {
		if (s.start >= t) break;
		o.has(s.start) || (r(s.value) && n++, s.value === "fi" && n--, i += a.get(s.value) ?? 0);
	}
	return n === 0 && i === 0;
}
function f(e) {
	let t = /* @__PURE__ */ new Set(), n = new Map(e.commands.map((e) => [e.start, e]));
	for (let r of e.commands) {
		if (t.has(r.start)) continue;
		let a = o.get(r.value) ?? 0;
		if (!a) continue;
		let s = i(e.masked, e, n, r.end, Array.from({ length: a }, () => ({ kind: "required" })));
		if (!s || s.missing.length) return null;
		for (let e of s.arguments) e.commandOffset !== void 0 && t.add(e.commandOffset);
	}
	return t;
}
//#endregion
export { s as packagePreambleEdit, u as topLevel };
