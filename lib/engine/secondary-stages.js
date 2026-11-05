import { stripTexComments as e } from "./tex-comments.js";
//#region src/engine/secondary-stages.ts
var t = /\\@newglossary\{[^}]*\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g, n = /\\@istfilename\{([^}]*)\}/, r = /\\@glsorder\{letter\}/, i = /\\newindex\*?\s*(?:\[[^\]]*\]\s*)?\{[^}]*\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g, a = /\\makeindex\s*\[([^\]]*)\]/g, o = /\\makeindex\s*\{([^}]+)\}/g, s = /\\newcites\s*\{([^}]+)\}/g, c = /^\\@input\{([^}]+)\.aux\}/gm, l = /\\usepackage\[[^\]]*\b(?:xindy|texindy|truexindy)\b[^\]]*\]\{imakeidx\}/, u = /\\(?:makenomenclature|makeglossaries|newcites|newindex)\b|\\makeindex\s*[[{]/;
function d(e) {
	return !e.startsWith("/") && !e.split("/").includes("..");
}
function f(t) {
	return t.some((t) => u.test(t) && u.test(e(t)));
}
function p(e, t) {
	return RegExp(`(?:^|,)\\s*${t}\\s*=\\s*(\\{[^}]*\\}|[^,]*)`).exec(e)?.[1]?.replace(/^\{|\}$/g, "").trim();
}
function m(e) {
	let t = p(e, "name");
	if (!t || /^(?:xindy|texindy|truexindy)$/.test(p(e, "program") ?? "")) return null;
	let n = p(e, "options") ?? "", r = /(?:^|\s)-s\s*(\S+)/.exec(n)?.[1], i = r && !/\.\w+$/.test(r) ? `${r}.ist` : r;
	return {
		input: `${t}.idx`,
		output: `${t}.ind`,
		...i ? { style: i } : {},
		.../(?:^|\s)-l(?:\s|$)/.test(n) ? { letterOrder: !0 } : {}
	};
}
function h(e, i) {
	let a = n.exec(i)?.[1];
	if (!a || a.endsWith(".xdy")) return [];
	let o = r.test(i);
	return [...i.matchAll(t)].map(([, t, n, r]) => ({
		input: `${e}.${r}`,
		output: `${e}.${n}`,
		style: a,
		log: `${e}.${t}`,
		...o ? { letterOrder: o } : {}
	}));
}
function g(t, n, r) {
	let s = n.map(e).join("\n"), c = h(t, r);
	/\\makenomenclature\b/.test(s) && c.push({
		input: `${t}.nlo`,
		output: `${t}.nls`,
		style: "nomencl.ist",
		log: `${t}.nlg`
	});
	for (let [, e, n] of s.matchAll(i)) c.push({
		input: `${t}.${e}`,
		output: `${t}.${n}`
	});
	if (!l.test(s)) for (let [, e] of s.matchAll(a)) {
		let t = m(e ?? "");
		t && c.push(t);
	}
	for (let [, e] of s.matchAll(o)) c.push({
		input: `${e}.idx`,
		output: `${e}.ind`
	});
	let u = c.filter((e) => d(e.input) && d(e.output));
	return [...new Map(u.map((e) => [e.output, e])).values()];
}
function _(t, n) {
	let r = t.map(e).join("\n"), i = [...r.matchAll(s)].flatMap(([, e]) => (e ?? "").split(",").map((e) => e.trim()));
	return /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bchapterbib\b/.test(r) && i.push(...[...n.matchAll(c)].map(([, e]) => e ?? "")), [...new Set(i.filter((e) => e && d(e)))];
}
function v(t) {
	return t.some((t) => /\\begin\{bibunit\}|\\bibliographyunit\b/.test(e(t)));
}
//#endregion
export { f as opensListInPreamble, _ as secondaryAuxBases, g as secondaryIndexJobs, v as usesBibunits };
