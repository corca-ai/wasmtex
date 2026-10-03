import { tokenize as e } from "./latex-tokenizer.js";
import { buildLineStarts as t, offsetToLineCol as n } from "./source-position.js";
import { maskSpansFromTokens as r } from "./latex-parser.js";
import { accessibilityReviewIssues as i } from "./accessible-pdf.js";
//#region src/lsp/linter.ts
var a = {
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
}, o = /* @__PURE__ */ new Set([
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
function s(e, t) {
	let n = t + 1;
	for (; n < e.length && e[n].type === "text" && e[n].value.trim() === "";) n++;
	if (e[n]?.type !== "open") return null;
	let r = e[n + 1];
	return r?.type !== "text" || e[n + 2]?.type !== "close" ? null : r.value.trim();
}
function c(e, t) {
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
		t(s.start) || (s.type === "math" ? a(s.value === "$$" ? "ddollar" : "dollar", s.end, s.start) : s.type === "command" && l(s, e, o, r, i, n));
	}
	return n;
}
function l(e, t, n, r, i, a) {
	if (e.value === "(") r.paren = e.end;
	else if (e.value === ")" && r.paren >= 0) a.push([r.paren, e.start]), r.paren = -1;
	else if (e.value === "[") r.bracket = e.end;
	else if (e.value === "]" && r.bracket >= 0) a.push([r.bracket, e.start]), r.bracket = -1;
	else if (e.value === "begin" && u(t, n)) i.push(e.end);
	else if (e.value === "end" && u(t, n)) {
		let t = i.pop();
		t !== void 0 && a.push([t, e.start]);
	}
}
function u(e, t) {
	let n = s(e, t);
	return n !== null && o.has(n);
}
function d(e, t) {
	let n = new Uint8Array(e);
	for (let [r, i] of t) for (let t = r; t < i && t < e; t++) n[t] = 1;
	return n;
}
var f = String.raw`\\(?:ref|eqref|pageref|cref|Cref|autoref|vref|cite|citep|citet|parencite|textcite|autocite)\b`, p = "sin|cos|tan|cot|sec|csc|sinh|cosh|tanh|log|ln|exp|lim|max|min|sup|inf|det|gcd|arg|dim|deg|ker|hom", m = () => 1, h = (e) => e[1].length, g = [
	{
		id: "nbsp-before-ref",
		re: new RegExp(String.raw`(?<=\S)( )${f}`, "g"),
		length: m,
		message: () => "Use a non-breaking space (~) before \\ref/\\cite to avoid a line break."
	},
	{
		id: "space-before-punctuation",
		re: /(?<=\w)( +)([,;:!?])/g,
		length: h,
		message: (e) => `Remove the space before '${e[2]}'.`
	},
	{
		id: "doubled-space",
		re: /(?<=\S)( {2,})/g,
		length: h,
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
		length: m,
		message: () => "Use LaTeX quotes (`` and '') instead of a straight double quote."
	},
	{
		id: "en-dash-range",
		re: /(?<=(?<![\d-])\d{1,4})-(?=\d{1,4}(?![\d-]))/g,
		length: m,
		message: () => "Use an en-dash (--) for number ranges."
	},
	{
		id: "footnote-spacing",
		re: /(?<=\w)( +)(\\footnote\b)/g,
		length: h,
		message: () => "Remove the space before \\footnote so it attaches to the word."
	},
	{
		id: "abbreviation-spacing",
		re: /(e\.g\.|i\.e\.)(?= )/g,
		length: h,
		message: (e) => `Follow '${e[1]}' with '\\ ' or '~' to avoid an inter-sentence space.`
	},
	{
		id: "math-operator-as-text",
		re: new RegExp(String.raw`(?<![\\a-zA-Z])(${p})(?![a-zA-Z])`, "g"),
		length: h,
		message: (e) => `Use \\${e[1]} instead of '${e[1]}' in math mode.`,
		inMath: "only"
	}
];
function _(e, t) {
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
function v(e) {
	let t = [], n = !0;
	for (let r of e.tokens) r.type !== "math" || r.value !== "$$" || e.isMasked(r.start) || (n && t.push({
		offset: r.start,
		length: 2,
		message: "Use \\[ … \\] instead of $$ … $$ for display math."
	}), n = !n);
	return t;
}
function y(e) {
	return b(e, "figure-alt-review");
}
function b(e, t) {
	let n = e.content.split("").map((t, n) => e.isMasked(n) && t !== "\n" ? " " : t).join("");
	return i("", e.content, n).filter((e) => e.code === t).map((e) => ({
		offset: e.offset,
		length: e.length,
		message: t === "figure-alt-review" ? "Image has no text alternative; add alt={…}, actualtext={…}, or mark it as artifact." : "Heading level skipped; use the next structural level down."
	}));
}
function x(e) {
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
function S(e) {
	return b(e, "heading-order-review");
}
function C(e) {
	let t = e.content, n = /\\documentclass\b/.exec(t);
	if (!n || e.isMasked(n.index)) return [];
	let r = [], i = t.includes("\\title") || t.includes("pdftitle"), a = t.indexOf("\\DocumentMetadata{"), o = a < 0 ? "" : t.slice(a, t.indexOf("}", a) + 1 || void 0), s = t.includes("pdflang") || /\blang ?=/.test(o);
	return i || r.push({
		offset: n.index,
		length: 14,
		message: "The PDF will carry no title: add \\title{…} or \\hypersetup{pdftitle={…}}."
	}), s || r.push({
		offset: n.index,
		length: 14,
		message: "The PDF will carry no language: add \\DocumentMetadata{lang=en-US} before \\documentclass or \\hypersetup{pdflang={en-US}}."
	}), r;
}
function w(e, t) {
	if (t === "display-math-dollars") return v(e);
	if (t === "a11y-graphics-alt") return y(e);
	if (t === "a11y-float-caption") return x(e);
	if (t === "a11y-heading-skip") return S(e);
	if (t === "a11y-pdf-metadata") return C(e);
	let n = g.find((e) => e.id === t);
	return n ? _(e, n) : [];
}
function T(i, o, s) {
	let l = { ...a };
	if (s) for (let e of Object.keys(s)) {
		let t = s[e];
		t && (l[e] = {
			...a[e],
			...t
		});
	}
	let u = e(i), f = d(i.length, r(u)), p = (e) => f[e] === 1, m = d(i.length, c(u, p)), h = {
		content: i,
		tokens: u,
		isMasked: p,
		inMath: (e) => m[e] === 1
	}, g = t(i), _ = [];
	for (let e of Object.keys(l)) {
		let t = l[e];
		if (t?.enabled) for (let r of w(h, e)) {
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
export { a as DEFAULT_LINT_CONFIG, T as lintSource };
