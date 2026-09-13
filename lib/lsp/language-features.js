import { CITE_CMDS as e, INPUT_CMDS as t, REF_CMDS as n } from "./latex-patterns.js";
import { tokenize as r } from "./latex-tokenizer.js";
import { buildLineStarts as i, offsetToLineCol as a } from "./source-position.js";
import { maskSpans as o } from "./latex-parser.js";
import { getCommandPackage as s, getCommandSignature as c } from "./package-db.js";
import { analyzeCompletionContext as l } from "./completion-context.js";
import { referenceDisplayValue as u } from "./reference-value.js";
//#region src/lsp/language-features.ts
function d(e) {
	let t = o(e);
	if (t.length === 0) return () => !1;
	let n = new Uint8Array(e.length);
	for (let [e, r] of t) for (let t = e; t < r && t < n.length; t++) n[t] = 1;
	return (e) => n[e] === 1;
}
function f(e, t, n, r) {
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
function p(e) {
	let t = e.split("\n"), n = i(e), r = d(e), a = [], o = [], s = [];
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
	return !i || !S(e, i, r) ? [] : r.findAllOccurrences(i.name, i.type).filter((t) => t.filePath === e).map((e) => ({
		startLine: e.line,
		startColumn: e.column,
		endLine: e.line,
		endColumn: e.column + e.length
	}));
}
function S(e, t, n) {
	if (t.type === "label") return n.getAllLabels(e).filter((e) => e.name === t.name).length <= 1;
	if (t.type === "command") {
		let r = n.getCommandDefs(e).filter((e) => e.name === t.name);
		return r.length === 1 && !r[0].mayRedefine;
	}
	let r = n.getActiveFiles(e).flatMap((e) => (n.getFileSymbols(e)?.bibItems ?? []).filter((e) => e.key === t.name)), i = n.getBibEntries(e).filter((e) => e.key === t.name);
	return r.length + i.length <= 1;
}
function C(e, t) {
	let n = e.toLowerCase(), r = (e) => !n || e.toLowerCase().includes(n), i = [];
	for (let e of t.getAllLabels()) r(e.name) && i.push({
		name: e.name,
		kind: "label",
		...w(e.location)
	});
	for (let e of t.getFiles()) for (let n of t.getFileSymbols(e)?.sections ?? []) r(n.title) && i.push({
		name: n.title,
		kind: "section",
		...w(n.location)
	});
	for (let e of t.getCommandDefs()) r(e.name) && i.push({
		name: e.name,
		kind: "command",
		...w(e.location)
	});
	return i;
}
function w(e) {
	return {
		file: e.file,
		line: e.line,
		column: e.column
	};
}
var T = /\\(ref|eqref|pageref)\{([^{}\\,]+)\}/g;
function E(e, t) {
	if (t.getAuxLabels().size === 0 || !t.hasCompleteAuxData()) return [];
	let n = i(e), o = d(e), s = [], c = new Set(r(e).filter((e) => e.type === "command").map((e) => e.start));
	for (let r of e.matchAll(T)) {
		if (o(r.index) || !c.has(r.index)) continue;
		let e = r[2].trim(), i = u(t, e, r[1]);
		if (!i) continue;
		let { line: l, column: d } = a(n, r.index + r[0].length);
		s.push({
			line: l,
			column: d,
			label: ` (${i})`
		});
	}
	return s;
}
var D = RegExp(`\\\\(?:${t})\\{([^}]+)\\}`, "g"), O = /\\(?:url|href)\{([^}]+)\}/g;
function k(e) {
	let t = i(e), n = d(e), r = [];
	return A(e, D, "file", t, n, r), A(e, O, "url", t, n, r), r;
}
function A(e, t, n, r, i, o) {
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
function j(e) {
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
		let t = M(e.type, i);
		t && n.push({
			line: e.line,
			startColumn: e.column,
			length: e.end - e.start,
			type: t
		});
	}
	return n;
}
function M(e, t) {
	return e === "comment" ? "comment" : e === "verb" ? "verbatim" : e === "command" ? t ? "math" : "command" : null;
}
function N(e, t, n, r) {
	let i = [], a = e.split("\n")[n - 1] ?? "";
	return P(a, t, n, i), F(a, e, t, r, i), L(a, t, n, r, i), i;
}
function P(t, r, i, a) {
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
function F(e, t, n, r, i) {
	let a = r.getLoadedPackages();
	for (let r of e.matchAll(/\\([a-zA-Z@]+)/g)) {
		let e = s(r[1]);
		if (e && !a.has(e)) {
			i.push(I(t, n, e));
			return;
		}
	}
}
function I(e, t, n) {
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
function L(e, t, r, i, a) {
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
export { N as getCodeActions, x as getDocumentHighlights, k as getDocumentLinks, p as getFoldingRanges, E as getInlayHints, j as getSemanticTokens, f as getSignatureHelp, C as getWorkspaceSymbols };
