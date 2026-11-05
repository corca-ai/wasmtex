import { sourceNewline as e } from "./source-position.js";
import { getStructuralSelectionIndex as t } from "./structural-selection.js";
import { consumeRepairArguments as n } from "./diagnostic-repair-arguments.js";
import { packagePreambleEdit as r, topLevel as i } from "./diagnostic-repair-preamble.js";
//#region src/lsp/diagnostic-repair-metadata.ts
var a = /* @__PURE__ */ new Set([
	"title",
	"author",
	"hypersetup",
	"documentclass"
]);
function o(n, o, u) {
	if (o !== n.root) return [];
	let d = n.fs.readFile(o), f = n.index.getFileSymbols(o), p = t(f);
	if (typeof d != "string" || !f || !p || d.length > 1e6) return [];
	let m = p.commands.find((e) => e.start <= u && u < e.end);
	if (!m || !a.has(m.value) || !i(p, m.start) || !r(d, f, o, "hyperref")) return [];
	let h = s(p);
	if (h === null || m.start >= h) return [];
	let g = c(n);
	if (!g) return [];
	let _ = l(d, p, h, g.code);
	if (!Object.keys(_).length) return [];
	let v = e(d), y = Object.entries(_).map(([e, t]) => `${e}={${t}}`).join(", "), b = h > 0 && !/[\r\n]/.test(d[h - 1]) ? v : "", x = g.hyperref ? "" : `\\usepackage{hyperref}${v}`;
	return [{
		kind: "pdf-metadata",
		root: n.root,
		revision: n.revision,
		contextRevision: n.contextRevision,
		anchor: {
			file: o,
			range: {
				startOffset: m.start,
				endOffset: m.end
			},
			expectedText: d.slice(m.start, m.end)
		},
		command: m.value,
		diagnostic: {
			code: "a11y-pdf-metadata",
			file: o,
			line: m.line,
			column: m.column,
			endColumn: m.column + m.end - m.start,
			severity: "info",
			message: "Review copying the source title and author into explicit PDF metadata."
		},
		metadata: _,
		edits: [{
			file: o,
			range: {
				startOffset: h,
				endOffset: h
			},
			expectedText: "",
			newText: `${b}${x}\\hypersetup{${y}}${v}`
		}]
	}];
}
function s(e) {
	return e.commands.find((t) => t.value === "begin" && /^\s*\{document\}/.test(e.masked.slice(t.end)))?.start ?? null;
}
function c(e) {
	let n = e.index.getRootFiles(e.root);
	if (n.length > 1024) return null;
	let r = [], i = 0, o = !1;
	for (let s of n) {
		let n = e.index.getFileSymbols(s), c = t(n);
		if (!n || !c || n.commands.some((e) => a.has(e.name) || e.name === "usepackage") || (i += c.masked.length, i > 4e6) || !d(c)) return null;
		r.push(c.masked), s === e.root && (o = n.packages.some((e) => e.name === "hyperref"));
	}
	return {
		code: r.join("\n"),
		hyperref: o
	};
}
function l(e, t, n, r) {
	let i = {};
	for (let [a, o] of [["title", "pdftitle"], ["author", "pdfauthor"]]) {
		if (RegExp(`\\b${o}\\s*=`).test(r)) continue;
		let s = u(e, t, a, n);
		s !== null && (i[o] = s);
	}
	return i;
}
function u(e, t, r, a) {
	let o = t.commands.filter((e) => e.value === r);
	if (o.length !== 1) return null;
	let s = o[0];
	if (s.start >= a || !i(t, s.start)) return null;
	let c = n(e, t, new Map(t.commands.map((e) => [e.start, e])), s.end, [{ kind: "optional" }, { kind: "required" }]), l = c?.arguments.at(-1);
	if (!l?.grouped || c?.missing.length) return null;
	let u = e.slice(l.start + 1, l.end - 1);
	return !u.trim() || /\\(?:[A-Za-z@]|$)|(?<!\\)[%$#]/.test(u) ? null : u;
}
function d(e) {
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
export { o as getPdfMetadataRepairs };
