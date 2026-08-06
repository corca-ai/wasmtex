import { CITE_CMDS as e, INPUT_CMDS as t, REF_CMDS as n } from "./latex-patterns.js";
import { tokenize as r } from "./latex-tokenizer.js";
import { buildLineStarts as i, offsetToLineCol as a } from "./source-position.js";
import { maskSpans as o } from "./latex-parser.js";
import { getCommandPackage as s, getCommandSignature as c } from "./package-db.js";
//#region src/lsp/language-features.ts
function l(e) {
	let t = o(e);
	if (t.length === 0) return () => !1;
	let n = new Uint8Array(e.length);
	for (let [e, r] of t) for (let t = e; t < r && t < n.length; t++) n[t] = 1;
	return (e) => n[e] === 1;
}
var u = /\\([a-zA-Z@]+)\s*[[{]/g;
function d(e, t, n) {
	let r = i(e)[t - 1];
	if (r === void 0) return null;
	let a = e.slice(0, r + (n - 1)), o = null;
	for (let e of a.matchAll(u)) o = {
		name: e[1],
		argStart: e.index + e[0].length - 1
	};
	if (!o) return null;
	let s = c(o.name);
	if (!s || s.length === 0) return null;
	let { opened: l, depth: d } = f(a, o.argStart);
	if (d === 0) return null;
	let p = s.map((e) => e.kind === "required" ? `{${e.placeholder || "arg"}}` : `[${e.placeholder || "opt"}]`);
	return {
		label: `\\${o.name}${p.join("")}`,
		parameters: p,
		activeParameter: Math.min(l - 1, s.length - 1)
	};
}
function f(e, t) {
	let n = 0, r = 0;
	for (let i = t; i < e.length; i++) {
		let t = e[i];
		t === "{" || t === "[" ? (n === 0 && r++, n++) : (t === "}" || t === "]") && (n = Math.max(0, n - 1));
	}
	return {
		opened: r,
		depth: n
	};
}
function p(e) {
	let t = e.split("\n"), n = i(e), r = l(e), a = [], o = [], s = [];
	for (let e = 0; e < t.length; e++) g(t[e], e, n[e], r, o, a), _(t[e], e, s, a);
	return a.push(...b(t, n, r)), a;
}
var m = /\\begin\{/g, h = /\\end\{/g;
function g(e, t, n, r, i, a) {
	let o = [];
	for (let t of e.matchAll(m)) o.push({
		index: t.index,
		open: !0
	});
	for (let t of e.matchAll(h)) o.push({
		index: t.index,
		open: !1
	});
	o.sort((e, t) => e.index - t.index);
	for (let e of o) if (!r(n + e.index)) if (e.open) i.push(t + 1);
	else {
		let e = i.pop();
		e !== void 0 && t + 1 > e && a.push({
			startLine: e,
			endLine: t + 1
		});
	}
}
function _(e, t, n, r) {
	if (/^\s*%\s*region\b/i.test(e)) n.push(t + 1);
	else if (/^\s*%\s*endregion\b/i.test(e)) {
		let e = n.pop();
		e !== void 0 && r.push({
			startLine: e,
			endLine: t + 1,
			kind: "region"
		});
	}
}
var v = [
	"part",
	"chapter",
	"section",
	"subsection",
	"subsubsection"
];
function y(e) {
	let t = e.match(/\\(part|chapter|section|subsection|subsubsection)\b/);
	return t ? {
		level: v.indexOf(t[1]),
		index: t.index
	} : {
		level: -1,
		index: -1
	};
}
function b(e, t, n) {
	let r = [], i = [], a = (e, t) => {
		for (; i.length && i[i.length - 1].level >= e;) {
			let e = i.pop();
			t > e.line && r.push({
				startLine: e.line,
				endLine: t
			});
		}
	};
	for (let r = 0; r < e.length; r++) {
		let { level: o, index: s } = y(e[r]);
		o < 0 || n(t[r] + s) || (a(o, r), i.push({
			level: o,
			line: r + 1
		}));
	}
	return a(0, e.length), r;
}
function x(e, t, n, r) {
	let i = r.findSymbolAt(e, t, n);
	return i ? r.findAllOccurrences(i.name, i.type).filter((t) => t.filePath === e).map((e) => ({
		startLine: e.line,
		startColumn: e.column,
		endLine: e.line,
		endColumn: e.column + e.length
	})) : [];
}
function S(e, t) {
	let n = e.toLowerCase(), r = (e) => !n || e.toLowerCase().includes(n), i = [];
	for (let e of t.getAllLabels()) r(e.name) && i.push({
		name: e.name,
		kind: "label",
		...C(e.location)
	});
	for (let e of t.getFiles()) for (let n of t.getFileSymbols(e)?.sections ?? []) r(n.title) && i.push({
		name: n.title,
		kind: "section",
		...C(n.location)
	});
	for (let e of t.getCommandDefs()) r(e.name) && i.push({
		name: e.name,
		kind: "command",
		...C(e.location)
	});
	return i;
}
function C(e) {
	return {
		file: e.file,
		line: e.line,
		column: e.column
	};
}
var w = RegExp(`\\\\(?:${n})\\{([^}]+)\\}`, "g");
function T(e, t) {
	let n = t.getAuxLabels();
	if (n.size === 0) return [];
	let r = i(e), o = l(e), s = [];
	for (let t of e.matchAll(w)) {
		if (o(t.index)) continue;
		let e = n.get(t[1].trim());
		if (!e) continue;
		let { line: i, column: c } = a(r, t.index + t[0].length);
		s.push({
			line: i,
			column: c,
			label: ` (${e})`
		});
	}
	return s;
}
var E = RegExp(`\\\\(?:${t})\\{([^}]+)\\}`, "g"), D = /\\(?:url|href)\{([^}]+)\}/g;
function O(e) {
	let t = i(e), n = l(e), r = [];
	return k(e, E, "file", t, n, r), k(e, D, "url", t, n, r), r;
}
function k(e, t, n, r, i, o) {
	for (let s of e.matchAll(t)) {
		if (i(s.index)) continue;
		let e = s[1].trim();
		if (!e) continue;
		let t = s.index + s[0].indexOf("{") + 1, c = a(r, t), l = a(r, t + s[1].length);
		o.push({
			range: {
				startLine: c.line,
				startColumn: c.column,
				endLine: l.line,
				endColumn: l.column
			},
			target: e,
			kind: n
		});
	}
}
function A(e) {
	let t = r(e), n = [], i = !1;
	for (let e of t) {
		if (e.type === "math") {
			i = !i;
			continue;
		}
		if (e.type === "command" && (e.value === "(" || e.value === "[")) {
			i = !0;
			continue;
		}
		if (e.type === "command" && (e.value === ")" || e.value === "]")) {
			i = !1;
			continue;
		}
		let t = j(e.type, i);
		t && n.push({
			line: e.line,
			startColumn: e.column,
			length: e.end - e.start,
			type: t
		});
	}
	return n;
}
function j(e, t) {
	return e === "comment" ? "comment" : e === "verb" ? "verbatim" : e === "command" ? t ? "math" : "command" : null;
}
function M(e, t, n, r) {
	let i = [], a = e.split("\n")[n - 1] ?? "";
	return N(a, t, n, i), P(a, e, t, r, i), I(a, t, n, r, i), i;
}
function N(t, r, i, a) {
	let o = t.match(RegExp(`(?<=\\S)( )\\\\(?:${n}|${e})\\b`));
	if (!o || o.index === void 0) return;
	let s = o.index + 1;
	a.push({
		title: "Use a non-breaking space '~'",
		kind: "quickfix",
		edits: [{
			file: r,
			edit: {
				range: {
					startLine: i,
					startColumn: s,
					endLine: i,
					endColumn: s + 1
				},
				newText: "~"
			}
		}]
	});
}
function P(e, t, n, r, i) {
	let a = r.getLoadedPackages();
	for (let r of e.matchAll(/\\([a-zA-Z@]+)/g)) {
		let e = s(r[1]);
		if (e && !a.has(e)) {
			i.push(F(t, n, e));
			return;
		}
	}
}
function F(e, t, n) {
	let r = e.split("\n"), i = 1;
	for (let e = 0; e < r.length; e++) if (/\\documentclass/.test(r[e])) {
		i = e + 2;
		break;
	}
	return {
		title: `Add \\usepackage{${n}}`,
		kind: "quickfix",
		edits: [{
			file: t,
			edit: {
				range: {
					startLine: i,
					startColumn: 1,
					endLine: i,
					endColumn: 1
				},
				newText: `\\usepackage{${n}}\n`
			}
		}]
	};
}
function I(e, t, r, i, a) {
	let o = e.match(RegExp(`\\\\(?:${n})\\{([^}]+)\\}`));
	if (!o) return;
	let s = o[1].trim();
	i.findLabelDef(s) || i.resolveLabel(s) || a.push({
		title: `Create \\label{${s}}`,
		kind: "quickfix",
		edits: [{
			file: t,
			edit: {
				range: {
					startLine: r,
					startColumn: 1,
					endLine: r,
					endColumn: 1
				},
				newText: `\\label{${s}}\n`
			}
		}]
	});
}
//#endregion
export { M as getCodeActions, x as getDocumentHighlights, O as getDocumentLinks, p as getFoldingRanges, T as getInlayHints, A as getSemanticTokens, d as getSignatureHelp, S as getWorkspaceSymbols };
