import { getStructuralSelectionIndex as e } from "./structural-selection.js";
import { consumeRepairArguments as t } from "./diagnostic-repair-arguments.js";
import { packagePreambleEdit as n, topLevel as r } from "./diagnostic-repair-preamble.js";
//#region src/lsp/diagnostic-repair-metadata.ts
var i = /* @__PURE__ */ new Set([
	"title",
	"author",
	"hypersetup",
	"documentclass"
]);
function a(t, a, l) {
	if (a !== t.root) return [];
	let u = t.fs.readFile(a), d = t.index.getFileSymbols(a), f = e(d);
	if (typeof u != "string" || !d || !f || u.length > 1e6) return [];
	let p = f.commands.find((e) => e.start <= l && l < e.end);
	if (!p || !i.has(p.value) || !r(f, p.start) || !n(u, d, a, "hyperref")) return [];
	let m = o(f);
	if (m === null || p.start >= m) return [];
	let h = s(t);
	if (!h) return [];
	let g = c(u, f, m, h.code);
	if (!Object.keys(g).length) return [];
	let _ = u.includes("\r\n") ? "\r\n" : "\n", v = Object.entries(g).map(([e, t]) => `${e}={${t}}`).join(", "), y = m > 0 && u[m - 1] !== "\n" ? _ : "", b = h.hyperref ? "" : `\\usepackage{hyperref}${_}`;
	return [{
		kind: "pdf-metadata",
		root: t.root,
		revision: t.revision,
		contextRevision: t.contextRevision,
		anchor: {
			file: a,
			range: {
				startOffset: p.start,
				endOffset: p.end
			},
			expectedText: u.slice(p.start, p.end)
		},
		command: p.value,
		diagnostic: {
			code: "a11y-pdf-metadata",
			file: a,
			line: p.line,
			column: p.column,
			endColumn: p.column + p.end - p.start,
			severity: "info",
			message: "Review copying the source title and author into explicit PDF metadata."
		},
		metadata: g,
		edits: [{
			file: a,
			range: {
				startOffset: m,
				endOffset: m
			},
			expectedText: "",
			newText: `${y}${b}\\hypersetup{${v}}${_}`
		}]
	}];
}
function o(e) {
	return e.commands.find((t) => t.value === "begin" && /^\s*\{document\}/.test(e.masked.slice(t.end)))?.start ?? null;
}
function s(t) {
	let n = t.index.getRootFiles(t.root);
	if (n.length > 1024) return null;
	let r = [], a = 0, o = !1;
	for (let s of n) {
		let n = t.index.getFileSymbols(s), c = e(n);
		if (!n || !c || n.commands.some((e) => i.has(e.name) || e.name === "usepackage") || (a += c.masked.length, a > 4e6) || !u(c)) return null;
		r.push(c.masked), s === t.root && (o = n.packages.some((e) => e.name === "hyperref"));
	}
	return {
		code: r.join("\n"),
		hyperref: o
	};
}
function c(e, t, n, r) {
	let i = {};
	for (let [a, o] of [["title", "pdftitle"], ["author", "pdfauthor"]]) {
		if (RegExp(`\\b${o}\\s*=`).test(r)) continue;
		let s = l(e, t, a, n);
		s !== null && (i[o] = s);
	}
	return i;
}
function l(e, n, i, a) {
	let o = n.commands.filter((e) => e.value === i);
	if (o.length !== 1) return null;
	let s = o[0];
	if (s.start >= a || !r(n, s.start)) return null;
	let c = t(e, n, new Map(n.commands.map((e) => [e.start, e])), s.end, [{ kind: "optional" }, { kind: "required" }]), l = c?.arguments.at(-1);
	if (!l?.grouped || c?.missing.length) return null;
	let u = e.slice(l.start + 1, l.end - 1);
	return !u.trim() || /\\(?:[A-Za-z@]|$)|(?<!\\)[%$#]/.test(u) ? null : u;
}
function u(e) {
	for (let t of e.commands) {
		if (!["hypersetup", "DocumentMetadata"].includes(t.value)) continue;
		let n = t.end;
		for (; /\s/.test(e.masked[n] ?? "") && n < e.masked.length;) n++;
		let r = e.groups.get(n);
		if (r === void 0 || /\\[A-Za-z@]/.test(e.masked.slice(n + 1, r))) return !1;
	}
	return !0;
}
//#endregion
export { a as getPdfMetadataRepairs };
