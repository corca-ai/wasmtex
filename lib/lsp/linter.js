import { tokenize as e } from "./latex-tokenizer.js";
import { buildLineStarts as t, offsetToLineCol as n } from "./source-position.js";
import { maskSpansFromTokens as r } from "./latex-parser.js";
//#region src/lsp/linter.ts
var i = {
	"nbsp-before-ref": {
		enabled: !0,
		severity: "info"
	},
	"space-before-punctuation": {
		enabled: !0,
		severity: "warning"
	},
	"doubled-space": {
		enabled: !0,
		severity: "info"
	},
	ellipsis: {
		enabled: !0,
		severity: "info"
	},
	"straight-double-quotes": {
		enabled: !0,
		severity: "info"
	},
	"display-math-dollars": {
		enabled: !0,
		severity: "warning"
	},
	"en-dash-range": {
		enabled: !0,
		severity: "info"
	},
	"math-operator-as-text": {
		enabled: !0,
		severity: "warning"
	},
	"footnote-spacing": {
		enabled: !0,
		severity: "info"
	},
	"abbreviation-spacing": {
		enabled: !1,
		severity: "info"
	},
	"a11y-graphics-alt": {
		enabled: !0,
		severity: "info"
	},
	"a11y-float-caption": {
		enabled: !0,
		severity: "info"
	},
	"a11y-heading-skip": {
		enabled: !0,
		severity: "info"
	},
	"a11y-pdf-metadata": {
		enabled: !0,
		severity: "info"
	}
}, a = /* @__PURE__ */ new Set([
	"math",
	"displaymath",
	"equation",
	"equation*",
	"align",
	"align*",
	"gather",
	"gather*",
	"multline",
	"multline*",
	"eqnarray",
	"eqnarray*",
	"flalign",
	"flalign*",
	"alignat",
	"alignat*"
]);
function o(e, t) {
	let n = t + 1;
	for (; n < e.length && e[n].type === "text" && e[n].value.trim() === "";) n++;
	if (e[n]?.type !== "open") return null;
	let r = e[n + 1];
	return r?.type !== "text" || e[n + 2]?.type !== "close" ? null : r.value.trim();
}
function s(e, t) {
	let n = [], r = {
		dollar: -1,
		ddollar: -1,
		paren: -1,
		bracket: -1
	}, i = [], a = (e, t, i) => {
		r[e] < 0 ? r[e] = t : (n.push([r[e], i]), r[e] = -1);
	};
	for (let o = 0; o < e.length; o++) {
		let s = e[o];
		t(s.start) || (s.type === "math" ? a(s.value === "$$" ? "ddollar" : "dollar", s.end, s.start) : s.type === "command" && c(s, e, o, r, i, n));
	}
	return n;
}
function c(e, t, n, r, i, a) {
	if (e.value === "(") r.paren = e.end;
	else if (e.value === ")" && r.paren >= 0) a.push([r.paren, e.start]), r.paren = -1;
	else if (e.value === "[") r.bracket = e.end;
	else if (e.value === "]" && r.bracket >= 0) a.push([r.bracket, e.start]), r.bracket = -1;
	else if (e.value === "begin" && l(t, n)) i.push(e.end);
	else if (e.value === "end" && l(t, n)) {
		let t = i.pop();
		t !== void 0 && a.push([t, e.start]);
	}
}
function l(e, t) {
	let n = o(e, t);
	return n !== null && a.has(n);
}
function u(e, t) {
	let n = new Uint8Array(e);
	for (let [r, i] of t) for (let t = r; t < i && t < e; t++) n[t] = 1;
	return n;
}
var d = String.raw`\\(?:ref|eqref|pageref|cref|Cref|autoref|vref|cite|citep|citet|parencite|textcite|autocite)\b`, f = "sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|max|min|sup|inf|det|gcd|arg|dim|deg|ker|hom", p = () => 1, m = (e) => e[1].length, h = [
	{
		id: "nbsp-before-ref",
		re: new RegExp(String.raw`(?<=\S)( )${d}`, "g"),
		length: p,
		message: () => "Use a non-breaking space (~) before \\ref/\\cite to avoid a line break."
	},
	{
		id: "space-before-punctuation",
		re: /(?<=\w)( +)([,;:!?])/g,
		length: m,
		message: (e) => `Remove the space before '${e[2]}'.`
	},
	{
		id: "doubled-space",
		re: /(?<=\S)( {2,})/g,
		length: m,
		message: () => "Multiple consecutive spaces collapse to one; remove the extras."
	},
	{
		id: "ellipsis",
		re: /\.\.\./g,
		length: () => 3,
		message: () => "Use \\dots (or \\ldots) instead of '...'."
	},
	{
		id: "straight-double-quotes",
		re: /(?<!(?<!\\)(?:\\\\)*\\)"/g,
		length: p,
		message: () => "Use LaTeX quotes (`` and '') instead of a straight double quote."
	},
	{
		id: "en-dash-range",
		re: /(?<=(?<![\d-])\d{1,4})-(?=\d{1,4}(?![\d-]))/g,
		length: p,
		message: () => "Use an en-dash (--) for number ranges."
	},
	{
		id: "footnote-spacing",
		re: /(?<=\w)( +)(\\footnote\b)/g,
		length: m,
		message: () => "Remove the space before \\footnote so it attaches to the word."
	},
	{
		id: "abbreviation-spacing",
		re: /(e\.g\.|i\.e\.)(?= )/g,
		length: m,
		message: (e) => `Follow '${e[1]}' with '\\ ' or '~' to avoid an inter-sentence space.`
	},
	{
		id: "math-operator-as-text",
		re: new RegExp(String.raw`(?<![\\a-zA-Z])(${f})(?![a-zA-Z])`, "g"),
		length: m,
		message: (e) => `Use \\${e[1]} instead of '${e[1]}' in math mode.`,
		inMath: "only"
	}
];
function g(e, t) {
	let n = t.inMath ?? "exclude", r = [];
	for (let i of e.content.matchAll(t.re)) {
		let a = i.index ?? 0;
		if (e.isMasked(a)) continue;
		let o = e.inMath(a);
		n === "exclude" && o || n === "only" && !o || r.push({
			offset: a,
			length: t.length(i),
			message: t.message(i)
		});
	}
	return r;
}
function _(e) {
	let t = [], n = !0;
	for (let r of e.tokens) r.type !== "math" || r.value !== "$$" || e.isMasked(r.start) || (n && t.push({
		offset: r.start,
		length: 2,
		message: "Use \\[ … \\] instead of $$ … $$ for display math."
	}), n = !n);
	return t;
}
function v(e) {
	let t = [];
	for (let n of e.content.matchAll(/\\includegraphics\*?(?:\s*\[([^\]]*)\])?/g)) {
		let r = n.index ?? 0;
		e.isMasked(r) || n[1] !== void 0 && /(?:^|,)\s*alt\s*=/.test(n[1]) || t.push({
			offset: r,
			length: 16,
			message: "Image has no text alternative; add alt={…} to \\includegraphics so screen readers can describe it."
		});
	}
	return t;
}
function y(e) {
	let t = [];
	for (let n of e.content.matchAll(/\\begin\{(figure|table)\*?\}/g)) {
		let r = n.index ?? 0;
		if (e.isMasked(r)) continue;
		let i = n[1], a = new RegExp(String.raw`\\end\{${i}\*?\}`, "g");
		a.lastIndex = r;
		let o = a.exec(e.content), s = e.content.slice(r, o ? o.index : void 0);
		/\\caption(?:of)?\b/.test(s) || t.push({
			offset: r,
			length: n[0].length,
			message: `This ${i} has no \\caption; tagged PDF readers announce floats by their caption.`
		});
	}
	return t;
}
var b = {
	part: -1,
	chapter: 0,
	section: 1,
	subsection: 2,
	subsubsection: 3,
	paragraph: 4,
	subparagraph: 5
};
function x(e) {
	let t = [], n = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?=[[{])/g, r = null;
	for (let i of e.content.matchAll(n)) {
		let n = i.index ?? 0;
		if (e.isMasked(n)) continue;
		let a = b[i[1]];
		r !== null && a > r + 1 && t.push({
			offset: n,
			length: i[0].trimEnd().length,
			message: `Heading level skipped: \\${i[1]} follows a level-${r} heading; use the next level down so the document outline stays navigable.`
		}), r = a;
	}
	return t;
}
function S(e) {
	let t = e.content, n = /\\documentclass\b/.exec(t);
	if (!n || e.isMasked(n.index)) return [];
	let r = [], i = /\\title\s*(?:\[[^\]]*\])?\s*\{|pdftitle\s*=/.test(t), a = /\\DocumentMetadata\s*\{[^}]*\blang\s*=|pdflang\s*=/.test(t);
	return i || r.push({
		offset: n.index,
		length: 14,
		message: "The PDF will carry no title: add \\title{…} or \\hypersetup{pdftitle={…}}."
	}), a || r.push({
		offset: n.index,
		length: 14,
		message: "The PDF will carry no language: add \\DocumentMetadata{lang=en-US} before \\documentclass or \\hypersetup{pdflang={en-US}}."
	}), r;
}
function C(e, t) {
	if (t === "display-math-dollars") return _(e);
	if (t === "a11y-graphics-alt") return v(e);
	if (t === "a11y-float-caption") return y(e);
	if (t === "a11y-heading-skip") return x(e);
	if (t === "a11y-pdf-metadata") return S(e);
	let n = h.find((e) => e.id === t);
	return n ? g(e, n) : [];
}
function w(a, o, c) {
	let l = { ...i };
	if (c) for (let e of Object.keys(c)) {
		let t = c[e];
		t && (l[e] = {
			...i[e],
			...t
		});
	}
	let d = e(a), f = u(a.length, r(d)), p = (e) => f[e] === 1, m = u(a.length, s(d, p)), h = {
		content: a,
		tokens: d,
		isMasked: p,
		inMath: (e) => m[e] === 1
	}, g = t(a), _ = [];
	for (let e of Object.keys(l)) {
		let t = l[e];
		if (t?.enabled) for (let r of C(h, e)) {
			let { line: i, column: a } = n(g, r.offset);
			_.push({
				file: o,
				line: i,
				column: a,
				endColumn: a + r.length,
				message: r.message,
				severity: t.severity,
				code: e
			});
		}
	}
	return _;
}
//#endregion
export { i as DEFAULT_LINT_CONFIG, w as lintSource };
