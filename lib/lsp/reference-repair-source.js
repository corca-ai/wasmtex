import { offsetToLineCol as e } from "./source-position.js";
import { REF_CMDS as t } from "./latex-patterns.js";
import { getStructuralSelectionIndex as n } from "./structural-selection.js";
//#region src/lsp/reference-repair-source.ts
var r = new Set(t.split("|")), i = 1024, a = 4e6, o = 1e4;
function s(e) {
	return e.length > 0 && e.length <= 256 && /^[\p{L}\p{M}\p{N}:._/-]+$/u.test(e);
}
function c(e, t) {
	let n = e.index.getRootFiles(e.root);
	if (n.length > i) return "limit";
	let r = {
		definitions: [],
		references: [],
		names: /* @__PURE__ */ new Map()
	}, s = m(e.index, n), c = 0;
	for (let i of n) {
		if (t?.isCancellationRequested) return "cancelled";
		let n = e.fs.readFile(i), u = e.index.getFileSymbols(i);
		if (!(typeof n != "string" || !u) && (c += n.length, c > a || (l(r, i, n, u, s), r.definitions.length + r.references.length > o))) return "limit";
	}
	return t?.isCancellationRequested ? "cancelled" : r;
}
function l(e, t, i, a, o) {
	let s = n(a);
	if (!s) return;
	u(e, i, a, s);
	let c = new Map(a.labels.map((e) => [f(e), e])), l = new Set(a.labelRefs.map(f));
	for (let n of s.commands) {
		if (o.has(n.value) || n.value !== "label" && !r.has(n.value)) continue;
		let a = d(t, i, s, n);
		if (!a) continue;
		let { line: u, column: f, key: m } = a, h = `${u}:${f}:${m}`;
		n.value === "label" ? p(e, a, c.get(h)) : l.has(h) && e.references.push(a);
	}
}
function u(e, t, n, r) {
	for (let i of n.labels) {
		let n = (r.lineStarts[i.location.line - 1] ?? 0) + i.location.column - 1;
		r.masked[n] === t[n] && e.names.set(i.name, (e.names.get(i.name) ?? 0) + 1);
	}
}
function d(t, n, r, i) {
	let a = r.groups.get(i.end);
	if (n[i.end] !== "{" || a === void 0) return null;
	let o = n.slice(i.end + 1, a), c = o.trim();
	if (!s(c) || r.masked.slice(i.end + 1, a) !== o) return null;
	let l = i.end + 1 + o.length - o.trimStart().length;
	return {
		file: t,
		key: c,
		command: i.value,
		...e(r.lineStarts, l),
		range: {
			startOffset: l,
			endOffset: l + c.length
		}
	};
}
function f(e) {
	return `${e.location.line}:${e.location.column}:${e.name}`;
}
function p(e, t, n) {
	n && e.definitions.push({
		definition: t,
		...n.context ? { context: { ...n.context } } : {}
	});
}
function m(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (let r of t) {
		let t = e.getFileSymbols(r);
		for (let e of t?.commands ?? []) n.add(e.name);
		for (let e of t?.environmentDefs ?? []) n.add(e.name), n.add(`end${e.name}`);
	}
	return n;
}
//#endregion
export { c as referenceInventory, s as validReferenceKey };
