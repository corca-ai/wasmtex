import { BIBTEX_STAGE as e } from "./backend-registry.js";
import { stripTexComments as t } from "./tex-comments.js";
//#region src/engine/bibliography-backend.ts
function n(e) {
	let n = t(e);
	return /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bbiblatex\b[^}]*\}/.test(n) ? "biblatex" : /\\bibliography\b/.test(n) || /\\bibliographystyle\b/.test(n) || /\\begin\{thebibliography\}/.test(n) ? "bibtex" : "none";
}
var r = e;
function i(e, t) {
	let n = e.match(/\\bibstyle\{([^}]+)\}/);
	if (!n) return null;
	let r = n[1], i = r.endsWith(".bst") ? r : `${r}.bst`, a = t(i);
	return a == null ? null : {
		path: i,
		content: a
	};
}
async function a(t, n) {
	let r = t?.resolve(e);
	return !r || r.location !== "server" ? null : r.run(n);
}
function o(e) {
	let n = t(e).match(/\\usepackage\[([^\]]*)\]\{[^}]*\bbiblatex\b[^}]*\}/);
	return n && /\bbackend\s*=\s*bibtex\b/.test(n[1]) ? "bibtex" : "biber";
}
function s(e) {
	return /\bsorting\s*=\s*none\b/.test(t(e)) ? "none" : "nty";
}
function c(e) {
	return [...e.matchAll(/<bcf:citekey\b[^>]*>([^<]*)<\/bcf:citekey>/g)].map((e) => e[1].trim()).filter(Boolean);
}
function l(e) {
	return `${(e.author ?? "").toLowerCase()} ${(e.title ?? "").toLowerCase()} ${e.year ?? ""}`;
}
function u(e) {
	return e.split(/\s+and\s+/).map((e) => e.trim()).filter(Boolean).map((e) => {
		let t = e.indexOf(",");
		if (t >= 0) return {
			family: e.slice(0, t).trim(),
			given: e.slice(t + 1).trim()
		};
		let n = e.lastIndexOf(" ");
		return n >= 0 ? {
			family: e.slice(n + 1).trim(),
			given: e.slice(0, n).trim()
		} : {
			family: e,
			given: ""
		};
	});
}
function d(e, t) {
	let n = 0;
	for (; t - 1 - n >= 0 && e[t - 1 - n] === "\\";) n++;
	return n % 2 == 1;
}
function f(e) {
	let t = /* @__PURE__ */ new Set(), n = [];
	for (let r = 0; r < e.length; r++) {
		let i = e[r];
		i !== "{" && i !== "}" || d(e, r) || (i === "{" ? n.push(r) : n.length > 0 ? n.pop() : t.add(r));
	}
	for (let e of n) t.add(e);
	if (t.size === 0) return e;
	let r = "";
	for (let n = 0; n < e.length; n++) t.has(n) || (r += e[n]);
	return r;
}
function p(e) {
	return f(e).replace(/(\\*)([&%#])/g, (e, t, n) => t.length % 2 == 0 ? `${t}\\${n}` : `${t}${n}`);
}
function m(e) {
	let t = u(e), n = t.map((e) => `    {{family={${p(e.family)}},given={${p(e.given)}}}}%`).join("\n");
	return `  \\name{author}{${t.length}}{}{%\n${n}\n  }`;
}
function h(e) {
	let t = [`\\entry{${p(e.key)}}{${p(e.type)}}{}{}`];
	e.author && t.push(m(e.author));
	for (let n of [
		"title",
		"year",
		"journal"
	]) {
		let r = e[n];
		r && t.push(`  \\field{${n}}{${p(r)}}`);
	}
	return t.push("\\endentry"), t.join("\n");
}
function g(e) {
	let t = new Map(e.entries.map((e) => [e.key, e])), n = [...new Set(e.citedKeys)].map((e) => t.get(e)).filter((e) => !!e);
	e.sort !== "none" && n.sort((e, t) => {
		let n = l(e), r = l(t);
		return n < r ? -1 : +(n > r);
	});
	let r = e.sort === "none" ? "none/global//global/global" : "nty/global//global/global", i = n.map(h).join("\n");
	return [
		"\\begin{refsection}",
		`\\datalist[entry]{${r}}`,
		i,
		"\\enddatalist",
		"\\end{refsection}",
		""
	].join("\n");
}
var _ = {
	id: "biblatex-lite",
	generateBbl: g
};
function v(e = [], t) {
	return e.find((e) => e.id === t) ?? e[0] ?? _;
}
//#endregion
export { r as BIBLIOGRAPHY_STAGE, e as BIBTEX_STAGE, _ as biblatexLiteBackend, o as detectBiblatexBackend, s as detectBiblatexSort, n as detectBibliographyMode, g as generateBiblatexBbl, c as parseBcfCitedKeys, i as resolveBstFile, a as runRemoteBibliography, v as selectBiblatexBackend };
