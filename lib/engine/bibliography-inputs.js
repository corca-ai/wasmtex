import { auxPath as e, readAuxFiles as t } from "../lsp/aux-files.js";
import { normalizeProjectDependencyPath as n } from "./dependency-manifest.js";
//#region src/engine/bibliography-inputs.ts
async function r(e, t, n) {
	let r = { ...t }, a = i(e), o = !1;
	for (let e of a) {
		if (Object.hasOwn(r, e)) continue;
		let t = await n(e);
		t !== null && (r[e] = t, o = !0);
	}
	return {
		bibFiles: r,
		hasGenerated: o
	};
}
function i(e) {
	let t = /* @__PURE__ */ new Set();
	for (let r of e.matchAll(/\\bibdata\{([^}]+)\}/g)) for (let e of r[1].split(",")) {
		let r = e.trim();
		if (!r) continue;
		let i = n(r.endsWith(".bib") ? r : `${r}.bib`);
		i && t.add(i);
	}
	return t;
}
async function a(n, r) {
	let { files: i } = await t(n, r), a = /* @__PURE__ */ new Set(), o = (t) => {
		let n = t === null ? void 0 : i[t];
		return t === null || n === void 0 || a.has(t) ? "" : (a.add(t), n.replace(/^\\@input\{([^}]+)\}/gm, (t, n) => o(e(n))));
	}, s = e(n);
	return s === null || i[s] === void 0 ? null : o(s);
}
function o(e) {
	return (e.match(/\\(?:citation|bibdata|bibstyle)\{[^\n]*/g) ?? []).join("\n");
}
function s(e, t) {
	if (e.control !== t.control) return !1;
	let n = Object.keys(e.files);
	return n.length === Object.keys(t.files).length && n.every((n) => {
		let r = e.files[n], i = t.files[n];
		return r === i ? !0 : typeof r == "string" || typeof i == "string" || !r || !i ? !1 : r.length === i.length && r.every((e, t) => e === i[t]);
	});
}
//#endregion
export { o as bibtexControl, r as collectBibliographyInputs, a as flattenAuxInputs, s as sameBibliographyInput };
