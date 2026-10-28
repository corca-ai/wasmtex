import { normalizeProjectDependencyPath as e } from "./dependency-manifest.js";
//#region src/engine/bibliography-inputs.ts
async function t(e, t, r) {
	let i = { ...t }, a = n(e), o = !1;
	for (let e of a) {
		if (Object.hasOwn(i, e)) continue;
		let t = await r(e);
		t !== null && (i[e] = t, o = !0);
	}
	return {
		bibFiles: i,
		hasGenerated: o
	};
}
function n(t) {
	let n = /* @__PURE__ */ new Set();
	for (let r of t.matchAll(/\\bibdata\{([^}]+)\}/g)) for (let t of r[1].split(",")) {
		let r = t.trim();
		if (!r) continue;
		let i = e(r.endsWith(".bib") ? r : `${r}.bib`);
		i && n.add(i);
	}
	return n;
}
//#endregion
export { t as collectBibliographyInputs };
