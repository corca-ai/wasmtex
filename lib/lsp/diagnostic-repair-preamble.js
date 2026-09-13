import { getStructuralSelectionIndex as e } from "./structural-selection.js";
import { isConditionalOpener as t } from "./latex-parser.js";
import { consumeRepairArguments as n } from "./diagnostic-repair-arguments.js";
//#region src/lsp/diagnostic-repair-preamble.ts
var r = /* @__PURE__ */ new Map([
	["begingroup", 1],
	["bgroup", 1],
	["endgroup", -1],
	["egroup", -1]
]), i = /* @__PURE__ */ new Map([
	["ifx", 2],
	["newif", 1],
	["ifdefined", 1]
]);
function a(t, n, r, i, a) {
	if (t.length > 1e6 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(i)) return null;
	let l = e(n);
	if (!l || n.classes.length !== 1) return null;
	let u = l.commands.filter((e) => {
		if (e.value !== "begin") return !1;
		let n = e.end;
		for (; /\s/.test(l.masked[n] ?? "") && n < t.length;) n++;
		let r = l.groups.get(n);
		return l.masked[n] === "{" && r !== void 0 && l.masked.slice(n + 1, r).trim() === "document";
	});
	if (u.length !== 1) return null;
	let d = u[0];
	if (!c(l, d.start)) return null;
	let f = s(t, l, d.start);
	if (f === null) return null;
	let p = o(t, l, f, Math.min(d.start, a ?? Infinity));
	if (p === null) return null;
	let m = t.includes("\r\n") ? "\r\n" : "\n", h = p === 0 || t[p - 1] === "\n" ? "" : m;
	return {
		file: r,
		range: {
			startOffset: p,
			endOffset: p
		},
		expectedText: "",
		newText: `${h}\\usepackage{${i}}${m}`
	};
}
function o(e, t, r, i) {
	let a = r, o = new Map(t.commands.map((e) => [e.start, e]));
	for (let r of t.commands) {
		if ([
			"input",
			"include",
			"subfile"
		].includes(r.value) && (i = Math.min(i, r.start)), r.value !== "PassOptionsToPackage") continue;
		let s = n(e, t, o, r.end, [{ kind: "required" }, { kind: "required" }]);
		if (!s || s.missing.length || !c(t, r.start)) return null;
		a = Math.max(a, s.insertOffset);
	}
	return e.slice(a, a + 2) === "\r\n" ? a += 2 : e[a] === "\n" && a++, a <= i ? a : null;
}
function s(e, t, r) {
	let i = t.commands.filter((e) => e.value === "documentclass");
	if (i.length !== 1) return null;
	let a = i[0];
	if (a.start >= r || !c(t, a.start)) return null;
	let o = n(e, t, new Map(t.commands.map((e) => [e.start, e])), a.end, [
		{ kind: "optional" },
		{ kind: "required" },
		{ kind: "optional" }
	]);
	if (!o || o.missing.length || o.insertOffset > r) return null;
	let s = o.insertOffset;
	return e.slice(s, s + 2) === "\r\n" ? s += 2 : e[s] === "\n" && s++, s;
}
function c(e, t) {
	for (let [n, r] of e.groups) if (n < t && r > t) return !1;
	return l(e, t);
}
function l(e, n) {
	let i = 0, a = 0, o = u(e);
	if (!o) return !1;
	for (let s of e.commands) {
		if (s.start >= n) break;
		o.has(s.start) || (t(s.value) && i++, s.value === "fi" && i--, a += r.get(s.value) ?? 0);
	}
	return i === 0 && a === 0;
}
function u(e) {
	let t = /* @__PURE__ */ new Set(), r = new Map(e.commands.map((e) => [e.start, e]));
	for (let a of e.commands) {
		if (t.has(a.start)) continue;
		let o = i.get(a.value) ?? 0;
		if (!o) continue;
		let s = n(e.masked, e, r, a.end, Array.from({ length: o }, () => ({ kind: "required" })));
		if (!s || s.missing.length) return null;
		for (let e of s.arguments) e.commandOffset !== void 0 && t.add(e.commandOffset);
	}
	return t;
}
//#endregion
export { a as packagePreambleEdit };
