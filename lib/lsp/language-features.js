import { CITE_CMDS as e, INPUT_CMDS as t, REF_CMDS as n } from "./latex-patterns.js";
import { tokenize as r } from "./latex-tokenizer.js";
import { buildLineStarts as i, offsetToLineCol as a } from "./source-position.js";
import { maskSpans as o } from "./latex-parser.js";
import { getCommandPackage as s, getCommandSignature as c } from "./package-db.js";
import { analyzeCompletionContext as l } from "./completion-context.js";
//#region src/lsp/language-features.ts
function u(e) {
	let t = o(e);
	if (t.length === 0) return () => !1;
	let n = new Uint8Array(e.length);
	for (let [e, r] of t) for (let t = e; t < r && t < n.length; t++) n[t] = 1;
	return (e) => n[e] === 1;
}
function d(e, t, n, r) {
	let i = e.split("\n"), a = l({
		path: "",
		getText: () => e,
		lineAt: (e) => i[e - 1] ?? ""
	}, {
		line: t,
		column: n
	}, r);
	if (a?.type !== "argument" || a.signatureIndex === void 0) return null;
	let o = `${a.command}${a.starred ? "*" : ""}`, s = r?.getCommandArguments(o) ?? c(o);
	if (!s?.length) return null;
	let u = s.map((e) => e.kind === "required" ? `{${e.placeholder || "arg"}}` : `[${e.placeholder || "opt"}]`);
	return {
		label: `\\${a.command}${a.starred ? "*" : ""}${u.join("")}`,
		parameters: u,
		activeParameter: a.signatureIndex,
		command: a.command,
		starred: a.starred,
		argumentIndex: a.argumentIndex,
		parameterDetails: s.map((e) => ({ ...e }))
	};
}
function f(e) {
	let t = e.split("\n"), n = i(e), r = u(e), a = [], o = [], s = [];
	for (let e = 0; e < t.length; e++) h(t[e], e, n[e], r, o, a), g(t[e], e, s, a);
	return a.push(...y(t, n, r)), a;
}
var p = /\\begin\{/g, m = /\\end\{/g;
function h(e, t, n, r, i, a) {
	let o = [];
	for (let t of e.matchAll(p)) o.push({
		index: t.index,
		open: !0
	});
	for (let t of e.matchAll(m)) o.push({
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
function g(e, t, n, r) {
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
var _ = [
	"part",
	"chapter",
	"section",
	"subsection",
	"subsubsection"
];
function v(e) {
	let t = e.match(/\\(part|chapter|section|subsection|subsubsection)\b/);
	return t ? {
		level: _.indexOf(t[1]),
		index: t.index
	} : {
		level: -1,
		index: -1
	};
}
function y(e, t, n) {
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
		let { level: o, index: s } = v(e[r]);
		o < 0 || n(t[r] + s) || (a(o, r), i.push({
			level: o,
			line: r + 1
		}));
	}
	return a(0, e.length), r;
}
function b(e, t, n, r) {
	let i = r.findSymbolAt(e, t, n);
	return !i || !x(e, i, r) ? [] : r.findAllOccurrences(i.name, i.type).filter((t) => t.filePath === e).map((e) => ({
		startLine: e.line,
		startColumn: e.column,
		endLine: e.line,
		endColumn: e.column + e.length
	}));
}
function x(e, t, n) {
	if (t.type === "label") return n.getAllLabels(e).filter((e) => e.name === t.name).length <= 1;
	if (t.type === "command") {
		let r = n.getCommandDefs(e).filter((e) => e.name === t.name);
		return r.length === 1 && !r[0].mayRedefine;
	}
	let r = n.getActiveFiles(e).flatMap((e) => (n.getFileSymbols(e)?.bibItems ?? []).filter((e) => e.key === t.name)), i = n.getBibEntries(e).filter((e) => e.key === t.name);
	return r.length + i.length <= 1;
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
var w = /\\(ref|eqref|pageref)\{([^{}\\,]+)\}/g;
function T(e, t) {
	let n = t.getAuxLabels();
	if (n.size === 0 || !t.hasCompleteAuxData()) return [];
	let o = i(e), s = u(e), c = [], l = new Set(r(e).filter((e) => e.type === "command").map((e) => e.start));
	for (let r of e.matchAll(w)) {
		if (s(r.index) || !l.has(r.index)) continue;
		let e = r[2].trim(), i = r[1] === "pageref" ? t.resolveLabelPage(e) : n.get(e);
		if (!i || /[\\{}%$~_^#&]/.test(i)) continue;
		let { line: u, column: d } = a(o, r.index + r[0].length);
		c.push({
			line: u,
			column: d,
			label: ` (${i})`
		});
	}
	return c;
}
var E = RegExp(`\\\\(?:${t})\\{([^}]+)\\}`, "g"), D = /\\(?:url|href)\{([^}]+)\}/g;
function O(e) {
	let t = i(e), n = u(e), r = [];
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
export { M as getCodeActions, b as getDocumentHighlights, O as getDocumentLinks, f as getFoldingRanges, T as getInlayHints, A as getSemanticTokens, d as getSignatureHelp, S as getWorkspaceSymbols };
