import { stripTexComments as e } from "./tex-comments.js";
//#region src/engine/secondary-stages.ts
var t = /\\@newglossary\{[^}]*\}\{([^}]*)\}\{([^}]*)\}\{([^}]*)\}/g, n = /\\@istfilename\{([^}]*)\}/, r = /\\@glsorder\{letter\}/, i = /\\newindex\s*\{[^}]*\}\s*\{([^}]+)\}\s*\{([^}]+)\}/g, a = /\\makeindex\s*\[([^\]]*)\]/g, o = /\\makeindex\s*\{([^}]+)\}/g, s = /\\newcites\s*\{([^}]+)\}/g, c = /^\\@input\{([^}]+)\.aux\}/gm;
function l(e, t) {
	return RegExp(`(?:^|,)\\s*${t}\\s*=\\s*(\\{[^}]*\\}|[^,]*)`).exec(e)?.[1]?.replace(/^\{|\}$/g, "").trim();
}
function u(e) {
	let t = l(e, "name");
	if (!t || /^(?:xindy|texindy)$/.test(l(e, "program") ?? "")) return null;
	let n = l(e, "options") ?? "", r = /(?:^|\s)-s\s*(\S+)/.exec(n)?.[1];
	return {
		input: `${t}.idx`,
		output: `${t}.ind`,
		...r ? { style: r } : {},
		.../(?:^|\s)-l(?:\s|$)/.test(n) ? { letterOrder: !0 } : {}
	};
}
function d(e, i) {
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
function f(t, n, r) {
	let s = n.map(e).join("\n"), c = d(t, r);
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
	for (let [, e] of s.matchAll(a)) {
		let t = u(e ?? "");
		t && c.push(t);
	}
	for (let [, e] of s.matchAll(o)) c.push({
		input: `${e}.idx`,
		output: `${e}.ind`
	});
	return [...new Map(c.map((e) => [e.output, e])).values()];
}
function p(t, n) {
	let r = t.map(e).join("\n"), i = [...r.matchAll(s)].flatMap(([, e]) => (e ?? "").split(",").map((e) => e.trim()));
	return /\\usepackage(?:\[[^\]]*\])?\{[^}]*\bchapterbib\b/.test(r) && i.push(...[...n.matchAll(c)].map(([, e]) => e ?? "")), [...new Set(i.filter(Boolean))];
}
function m(t) {
	return t.some((t) => /\\begin\{bibunit\}|\\bibliographyunit\b/.test(e(t)));
}
//#endregion
export { p as secondaryAuxBases, f as secondaryIndexJobs, m as usesBibunits };
