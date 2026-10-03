import { CLASS_SUPPORT as e } from "../engine/accessible-export.js";
import { maskSpans as t } from "./latex-parser.js";
//#region src/lsp/accessible-pdf.ts
function n(e) {
	return `a11y-${e}`;
}
var r = "\\DocumentMetadata", i = "\\begin{tabular", a = /* @__PURE__ */ new Set([
	"click here",
	"here",
	"link",
	"more",
	"read more"
]), o = {
	chapter: 0,
	paragraph: 4,
	part: -1,
	section: 1,
	subsection: 2,
	subparagraph: 5,
	subsubsection: 3
};
function s(e) {
	let n = e.split("");
	for (let [r, i] of t(e)) for (let e = r; e < i; e++) n[e] !== "\n" && (n[e] = " ");
	return n.join("");
}
function c(e, t, n, r) {
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
function l(e, t) {
	for (; t < e.length && /\s/.test(e[t]);) t++;
	return t;
}
function u(e, t, n) {
	t = l(e, t);
	let r = c(e, t, "[", "]");
	r && (t = l(e, r.end));
	let i = [];
	for (let r = 0; r < n; r++) {
		let n = c(e, t, "{", "}");
		if (!n) return null;
		i.push(n.content), t = l(e, n.end);
	}
	return {
		arguments: i,
		options: r?.content ?? null
	};
}
function d(e, t, n) {
	let r = RegExp(`\\\\${t}(?:\\*)?(?![A-Za-z@*])`, "g");
	return [...e.matchAll(r)].flatMap((t) => {
		let r = u(e, (t.index ?? 0) + t[0].length, n);
		return r ? [{
			...r,
			offset: t.index ?? 0
		}] : [];
	});
}
function f(e) {
	let t = [], n = 0, r = 0;
	for (let i = 0; i <= e.length; i += 1) {
		let a = e[i];
		a === "{" && (n += 1), a === "}" && (n = Math.max(0, n - 1)), (a === "," && n === 0 || i === e.length) && (t.push(e.slice(r, i).trim()), r = i + 1);
	}
	return t;
}
function p(e) {
	return e ? f(e).some((e) => {
		let t = e.indexOf("="), n = (t < 0 ? e : e.slice(0, t)).trim();
		return n === "artifact" ? t < 0 || /^(?:true|\{true\})$/.test(e.slice(t + 1).trim()) : t < 0 || n !== "alt" && n !== "actualtext" ? !1 : e.slice(t + 1).trim().replace(/^\{([\s\S]*)\}$/, "$1").trim().length > 0;
	}) : !1;
}
function m(e) {
	return e.replace(/\\[A-Za-z@]+\*?/g, "").replace(/[{}~]/g, " ").replace(/\s+/g, " ").trim().replace(/^\p{P}+|\p{P}+$/gu, "").toLowerCase();
}
function h(e, n = "wasmtex-ignore") {
	let r = /* @__PURE__ */ new Set();
	if (!/^[a-z][a-z0-9-]*$/.test(n)) return r;
	let i = s(e).split("\n"), a = t(e), o = e.split("\n"), c = 0;
	for (let e = 0; e < o.length; e++) {
		let t = o[e] ?? "", s = RegExp(`^[ \t]*%[ \t]*${n}[ \t]+(a11y-[a-z0-9-]+)[ \t\r]*$`).exec(t), l = a.some(([e, n]) => e < c && n > c + t.length);
		if (s && !l) {
			for (let t = e + 1; t < o.length; t++) if ((i[t] ?? "").trim()) {
				r.add(`${s[1]}:${t + 1}`);
				break;
			}
		}
		c += t.length + 1;
	}
	return r;
}
function g(e, t, r) {
	let i = [], s = Object.keys(o).flatMap((e) => d(r, e, 1).map((t) => ({
		level: o[e],
		offset: t.offset
	})));
	s.sort((e, t) => e.offset - t.offset);
	for (let a = 1; a < s.length; a += 1) {
		let c = s[a - 1], l = s[a];
		!c || !l || l.level <= c.level + 1 || c.level === o.part && l.level <= 1 || i.push({
			offset: l.offset,
			length: /^\\[A-Za-z]+\*?/.exec(r.slice(l.offset))[0].length,
			code: "heading-order-review",
			file: e,
			kind: "review",
			line: v(t, l.offset),
			ruleId: n("heading-order-review")
		});
	}
	for (let a of d(r, "includegraphics", 1)) p(a.options) || i.push({
		offset: a.offset,
		length: 16,
		code: "figure-alt-review",
		file: e,
		kind: "review",
		line: v(t, a.offset),
		ruleId: n("figure-alt-review")
	});
	for (let o of d(r, "href", 2)) a.has(m(o.arguments[1] ?? "")) && i.push({
		offset: o.offset,
		length: 5,
		code: "link-purpose-review",
		file: e,
		kind: "review",
		line: v(t, o.offset),
		ruleId: n("link-purpose-review")
	});
	return i;
}
function _(e, t) {
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
function v(e, t) {
	let n = 1;
	for (let r = 0; r < t; r += 1) e[r] === "\n" && (n += 1);
	return n;
}
function y(e, t, i) {
	let a = _(i, r);
	if (!a) return null;
	let o = [
		["language", /\blang\s*=/],
		["PDF 2.0", /\bpdfversion\s*=\s*2(?:\.0)?\b/],
		["PDF/UA-2", /\bpdfstandard\s*=\s*ua-2\b/i],
		["tagging", /\btagging\s*=\s*on\b/i]
	].filter(([, e]) => !e.test(a.content)).map(([e]) => e);
	return o.length === 0 ? null : {
		code: "incomplete-metadata",
		file: e,
		kind: "fix",
		line: v(t, a.commandOffset),
		missing: o,
		ruleId: n("incomplete-metadata")
	};
}
function b(e) {
	return /\$(?!\$)[^\n$]+\$/.test(e) || e.includes("\\(") || e.includes("\\[") || /\\begin\{(?:equation\*?|align\*?|gather\*?|multline\*?|math|displaymath)\}/.test(e);
}
function x(e) {
	return /\\documentclass(?:\[[^\]]*\])?\s*\{([^}]+)\}/.exec(e)?.[1]?.trim() ?? null;
}
function S(e, t) {
	if (e !== "auto") return e;
	let n = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i.exec(t.slice(0, 2048))?.[1]?.toLowerCase();
	if (n?.includes("lua")) return "lualatex";
	if (n?.includes("xe")) return "xelatex";
	if (n && /^(?:pdf)?latex$|^pdftex$/.test(n)) return "pdflatex";
	let r = s(t), i = r.indexOf("\\begin{document}"), a = r.slice(0, i >= 0 ? i : Math.min(r.length, 8192));
	return /\\directlua\b|\{(?:luacode|luatexja|luamplib|lua-ul)\}/.test(a) ? "lualatex" : /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\s*\{[^}]*(?:fontspec|unicode-math|polyglossia|xeCJK|xetexko)[^}]*\}|\\(?:setmainfont|fontspec)\b/.test(a) ? "xelatex" : "pdflatex";
}
function C(t, r, i) {
	let a = x(i), o = a ? e[a] : null, s = o === "partial" || o === "unsupported" ? o : null;
	return !a || !s ? null : {
		code: "document-class-compatibility",
		documentClass: a,
		file: t,
		kind: "compatibility",
		line: v(r, i.indexOf("\\documentclass")),
		ruleId: n("document-class-compatibility"),
		support: s
	};
}
function w(e, t = {}) {
	let n = Object.entries(e).filter((e) => e[0].endsWith(".tex") && typeof e[1] == "string"), r = n.map(([e, t]) => [
		e,
		t,
		s(t)
	]), i = r.filter(([, , e]) => e.includes("\\documentclass")), a = r.find(([e]) => e === t.mainFile) ?? (i.length === 1 ? i[0] : void 0), o = a?.[2] ?? "", c = S(t.engine ?? "auto", a?.[1] ?? ""), l = i.length === 1 && T(o, c), u = i.length === 1 && /table\/header-rows\s*=/.test(o), d = [];
	for (let [e, n, i] of r) {
		let r = !t.mainFile || e === t.mainFile ? C(e, n, i) : null;
		r && d.push(r);
		let a = y(e, n, i);
		a && d.push(a), d.push(...E(e, n, i, c, l, u));
	}
	let f = new Map(n.map(([e, n]) => [e, h(n, t.ignoreDirective)]));
	return d.filter((e) => !f.get(e.file)?.has(`${e.ruleId}:${e.line}`));
}
function T(e, t) {
	return /math\/setup\s*=\s*\{?[^},]*(?:mathml-SE|mathml-AF)/i.test(e) || t === "lualatex" && /\\usepackage(?:\[[^\]]*\])?\{unicode-math\}/.test(e);
}
function E(e, t, r, a, o, s) {
	let c = [];
	if (!(o || T(r, a)) && b(r)) {
		let i = Math.max(0, r.search(/\$|\\\(|\\\[|\\begin\{(?:equation|align|gather|multline|math|displaymath)/));
		c.push({
			code: "math-structure-review",
			file: e,
			kind: "review",
			line: v(t, i),
			ruleId: n("math-structure-review")
		});
	}
	return !(s || /table\/header-rows\s*=/.test(r)) && r.includes(i) && c.push({
		code: "table-headers-review",
		file: e,
		kind: "review",
		line: v(t, r.indexOf(i)),
		ruleId: n("table-headers-review")
	}), c.push(...g(e, t, r).map(({ offset: e, length: t, ...n }) => n)), c;
}
function D(e) {
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
function O(e, t = {}) {
	return w(e, t).map((e) => ({
		code: e.ruleId,
		column: 1,
		endColumn: 2,
		file: e.file,
		line: e.line,
		message: D(e),
		severity: e.kind === "fix" ? "warning" : "info"
	}));
}
function k(e) {
	let t = w(e.snapshot.files, {
		engine: e.engine,
		mainFile: e.snapshot.mainFile,
		...e.ignoreDirective ? { ignoreDirective: e.ignoreDirective } : {}
	}), r = e.snapshot.files[e.snapshot.mainFile];
	return S(e.engine, typeof r == "string" ? r : "") === "xelatex" && t.push({
		code: "xelatex-compatibility",
		file: e.snapshot.mainFile,
		kind: "compatibility",
		line: 1,
		ruleId: n("xelatex-compatibility")
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
export { g as accessibilityReviewIssues, O as accessiblePdfSourceDiagnostics, k as buildAccessiblePdfPreflight };
