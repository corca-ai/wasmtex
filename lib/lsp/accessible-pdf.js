import { CLASS_SUPPORT as e } from "../engine/accessible-export.js";
import { buildLineStarts as t, offsetToLineCol as n } from "./source-position.js";
import { maskSpans as r } from "./latex-parser.js";
//#region src/lsp/accessible-pdf.ts
function i(e) {
	return `a11y-${e}`;
}
var a = "\\DocumentMetadata", o = "\\begin{tabular", s = /* @__PURE__ */ new Set([
	"click here",
	"here",
	"link",
	"more",
	"read more"
]), c = {
	chapter: 0,
	paragraph: 4,
	part: -1,
	section: 1,
	subsection: 2,
	subparagraph: 5,
	subsubsection: 3
};
function l(e) {
	let t = e.split("");
	for (let [n, i] of r(e)) for (let e = n; e < i; e++) t[e] !== "\n" && t[e] !== "\r" && (t[e] = " ");
	return t.join("");
}
function u(e, t, n, r) {
	if (e[t] !== n) return null;
	let i = 1;
	for (let a = t + 1; a < e.length; a += 1) {
		let o = e[a - 1] === "\\";
		if (!o && e[a] === n && (i += 1), !o && e[a] === r && --i, i === 0) return {
			content: e.slice(t + 1, a),
			end: a + 1
		};
	}
	return null;
}
function d(e, t) {
	for (; t < e.length && /\s/.test(e[t]);) t++;
	return t;
}
function f(e, t, n) {
	t = d(e, t);
	let r = u(e, t, "[", "]");
	r && (t = d(e, r.end));
	let i = [];
	for (let r = 0; r < n; r++) {
		let n = u(e, t, "{", "}");
		if (!n) return null;
		i.push(n.content), t = d(e, n.end);
	}
	return {
		arguments: i,
		options: r?.content ?? null
	};
}
function p(e, t, n) {
	let r = RegExp(`\\\\${t}(?:\\*)?(?![A-Za-z@*])`, "g");
	return [...e.matchAll(r)].flatMap((t) => {
		let r = f(e, (t.index ?? 0) + t[0].length, n);
		return r ? [{
			...r,
			offset: t.index ?? 0
		}] : [];
	});
}
function m(e) {
	let t = [], n = 0, r = 0;
	for (let i = 0; i <= e.length; i += 1) {
		let a = e[i];
		a === "{" && (n += 1), a === "}" && (n = Math.max(0, n - 1)), (a === "," && n === 0 || i === e.length) && (t.push(e.slice(r, i).trim()), r = i + 1);
	}
	return t;
}
function h(e) {
	return e ? m(e).some((e) => {
		let t = e.indexOf("="), n = (t < 0 ? e : e.slice(0, t)).trim();
		return n === "artifact" ? t < 0 || /^(?:true|\{true\})$/.test(e.slice(t + 1).trim()) : t < 0 || n !== "alt" && n !== "actualtext" ? !1 : e.slice(t + 1).trim().replace(/^\{([\s\S]*)\}$/, "$1").trim().length > 0;
	}) : !1;
}
function g(e) {
	return e.replace(/\\[A-Za-z@]+\*?/g, "").replace(/[{}~]/g, " ").replace(/\s+/g, " ").trim().replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase();
}
function _(e, n = "wasmtex-ignore") {
	let i = /* @__PURE__ */ new Set();
	if (!/^[a-z][a-z0-9-]*$/.test(n)) return i;
	let a = l(e).split(/\r\n|\r|\n/), o = r(e), s = e.split(/\r\n|\r|\n/), c = t(e);
	for (let e = 0; e < s.length; e++) {
		let t = s[e] ?? "", r = c[e], l = RegExp(`^[ \t]*%[ \t]*${n}[ \t]+(a11y-[a-z0-9-]+)[ \t\r]*$`).exec(t), u = o.some(([e, n]) => e < r && n > r + t.length);
		if (l && !u) {
			for (let t = e + 1; t < s.length; t++) if ((a[t] ?? "").trim()) {
				i.add(`${l[1]}:${t + 1}`);
				break;
			}
		}
	}
	return i;
}
function v(e, t, n) {
	let r = [], a = Object.keys(c).flatMap((e) => p(n, e, 1).map((t) => ({
		level: c[e],
		offset: t.offset
	})));
	a.sort((e, t) => e.offset - t.offset);
	for (let o = 1; o < a.length; o += 1) {
		let s = a[o - 1], l = a[o];
		!s || !l || l.level <= s.level + 1 || s.level === c.part && l.level <= 1 || r.push({
			offset: l.offset,
			length: /^\\[A-Za-z]+\*?/.exec(n.slice(l.offset))[0].length,
			code: "heading-order-review",
			file: e,
			kind: "review",
			line: b(t, l.offset),
			ruleId: i("heading-order-review")
		});
	}
	for (let a of p(n, "includegraphics", 1)) h(a.options) || r.push({
		offset: a.offset,
		length: 16,
		code: "figure-alt-review",
		file: e,
		kind: "review",
		line: b(t, a.offset),
		ruleId: i("figure-alt-review")
	});
	for (let a of p(n, "href", 2)) s.has(g(a.arguments[1] ?? "")) && r.push({
		offset: a.offset,
		length: 5,
		code: "link-purpose-review",
		file: e,
		kind: "review",
		line: b(t, a.offset),
		ruleId: i("link-purpose-review")
	});
	return r;
}
function y(e, t) {
	let n = e.indexOf(t);
	if (n < 0) return null;
	let r = n + t.length;
	for (; /\s/.test(e[r] ?? "");) r += 1;
	if (e[r] !== "{") return null;
	let i = r + 1, a = 1;
	for (r = i; r < e.length; r += 1) if (e[r] === "{" && (a += 1), e[r] === "}" && --a, a === 0) return {
		commandOffset: n,
		content: e.slice(i, r)
	};
	return {
		commandOffset: n,
		content: e.slice(i)
	};
}
function b(e, r) {
	return n(t(e), r).line;
}
function x(e, t, n) {
	let r = y(n, a);
	if (!r) return null;
	let o = [
		["language", /\blang\s*=/],
		["PDF 2.0", /\bpdfversion\s*=\s*2(?:\.0)?\b/],
		["PDF/UA-2", /\bpdfstandard\s*=\s*ua-2\b/i],
		["tagging", /\btagging\s*=\s*on\b/i]
	].filter(([, e]) => !e.test(r.content)).map(([e]) => e);
	return o.length === 0 ? null : {
		code: "incomplete-metadata",
		file: e,
		kind: "fix",
		line: b(t, r.commandOffset),
		missing: o,
		ruleId: i("incomplete-metadata")
	};
}
function S(e) {
	return /\$(?!\$)[^\r\n$]+\$/.test(e) || e.includes("\\(") || e.includes("\\[") || /\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|math|displaymath)\}/.test(e);
}
function C(e) {
	return /\\documentclass(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(e)?.[1]?.trim() ?? null;
}
function w(e, t) {
	if (e !== "auto") return e;
	let n = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i.exec(t.slice(0, 2048))?.[1]?.toLowerCase();
	if (n?.includes("lua")) return "lualatex";
	if (n?.includes("xe")) return "xelatex";
	if (n && /^(?:pdf)?latex$|^pdftex$/.test(n)) return "pdflatex";
	let r = l(t), i = r.indexOf("\\begin{document}"), a = r.slice(0, i >= 0 ? i : Math.min(r.length, 8192));
	return /\\directlua\b|\{(?:luacode|luatexja|luamplib|lua-ul)\}/.test(a) ? "lualatex" : /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\s*\{[^}]*(?:fontspec|unicode-math|polyglossia|xeCJK|xetexko)[^}]*\}|\\(?:setmainfont|fontspec)\b/.test(a) ? "xelatex" : "pdflatex";
}
function T(t, n, r) {
	let a = C(r), o = a ? e[a] : null, s = o === "partial" || o === "unsupported" ? o : null;
	return !a || !s ? null : {
		code: "document-class-compatibility",
		documentClass: a,
		file: t,
		kind: "compatibility",
		line: b(n, r.indexOf("\\documentclass")),
		ruleId: i("document-class-compatibility"),
		support: s
	};
}
function E(e, t = {}) {
	let n = Object.entries(e).filter((e) => e[0].endsWith(".tex") && typeof e[1] == "string"), r = n.map(([e, t]) => [
		e,
		t,
		l(t)
	]), i = r.filter(([, , e]) => e.includes("\\documentclass")), a = r.find(([e]) => e === t.mainFile) ?? (i.length === 1 ? i[0] : void 0), o = a?.[2] ?? "", s = w(t.engine ?? "auto", a?.[1] ?? ""), c = i.length === 1 && D(o, s), u = i.length === 1 && /table\/header-rows\s*=/.test(o), d = [];
	for (let [e, n, i] of r) {
		let r = !t.mainFile || e === t.mainFile ? T(e, n, i) : null;
		r && d.push(r);
		let a = x(e, n, i);
		a && d.push(a), d.push(...O(e, n, i, s, c, u));
	}
	let f = new Map(n.map(([e, n]) => [e, _(n, t.ignoreDirective)]));
	return d.filter((e) => !f.get(e.file)?.has(`${e.ruleId}:${e.line}`));
}
function D(e, t) {
	return /math\/setup\s*=\s*\{?[^},]*(?:mathml-SE|mathml-AF)/i.test(e) || t === "lualatex" && /\\usepackage(?:\[[^\]]*\])?\{unicode-math\}/.test(e);
}
function O(e, t, n, r, a, s) {
	let c = [];
	if (!(a || D(n, r)) && S(n)) {
		let r = Math.max(0, n.search(/\$|\\\(|\\\[|\\begin\{(?:equation|align|gather|multline|math|displaymath)/));
		c.push({
			code: "math-structure-review",
			file: e,
			kind: "review",
			line: b(t, r),
			ruleId: i("math-structure-review")
		});
	}
	return !(s || /table\/header-rows\s*=/.test(n)) && n.includes(o) && c.push({
		code: "table-headers-review",
		file: e,
		kind: "review",
		line: b(t, n.indexOf(o)),
		ruleId: i("table-headers-review")
	}), c.push(...v(e, t, n).map(({ offset: e, length: t, ...n }) => n)), c;
}
function k(e) {
	switch (e.code) {
		case "document-class-compatibility": return `Document class '${e.documentClass}' has ${e.support} tagged-PDF support. Review the exported structure carefully.`;
		case "figure-alt-review": return "This image has no alt, actualtext, or artifact option. Describe its purpose or mark it as decorative.";
		case "heading-order-review": return "This heading skips a structural level. Confirm that the heading hierarchy matches the document outline.";
		case "incomplete-metadata": return `Accessible PDF metadata is incomplete: add ${e.missing?.join(", ")}. The exporter leaves an existing \\DocumentMetadata declaration unchanged.`;
		case "math-structure-review": return "Math is present, but a MathML tagging path was not found. Confirm Formula and MathML structure after export.";
		case "link-purpose-review": return "This link text is generic. Confirm its purpose is clear in context or use a more descriptive label.";
		case "table-headers-review": return "This document has a table but no table/header-rows setting. If it contains data, identify its header rows for assistive technology.";
		case "xelatex-compatibility": return "XeLaTeX is not in the current LaTeX Tagged PDF Project recommended engine path. Prefer LuaLaTeX when the document permits it.";
	}
}
function A(e, t = {}) {
	return E(e, t).map((e) => ({
		code: e.ruleId,
		column: 1,
		endColumn: 2,
		file: e.file,
		line: e.line,
		message: k(e),
		severity: e.kind === "fix" ? "warning" : "info"
	}));
}
function j(e) {
	let t = E(e.snapshot.files, {
		engine: e.engine,
		mainFile: e.snapshot.mainFile,
		...e.ignoreDirective ? { ignoreDirective: e.ignoreDirective } : {}
	}), n = e.snapshot.files[e.snapshot.mainFile];
	return w(e.engine, typeof n == "string" ? n : "") === "xelatex" && t.push({
		code: "xelatex-compatibility",
		file: e.snapshot.mainFile,
		kind: "compatibility",
		line: 1,
		ruleId: i("xelatex-compatibility")
	}), {
		issues: t,
		summary: {
			compatibility: t.filter((e) => e.kind === "compatibility").length,
			fix: t.filter((e) => e.kind === "fix").length,
			review: t.filter((e) => e.kind === "review").length
		}
	};
}
//#endregion
export { v as accessibilityReviewIssues, A as accessiblePdfSourceDiagnostics, j as buildAccessiblePdfPreflight };
