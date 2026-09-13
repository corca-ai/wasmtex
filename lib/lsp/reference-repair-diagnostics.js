import { referenceInventory as e } from "./reference-repair-source.js";
//#region src/lsp/reference-repair-diagnostics.ts
function t(t) {
	let r = e(t);
	if (typeof r == "string") return [];
	let i = [];
	for (let e of r.references) r.names.has(e.key) || t.index.getAuxLabels().has(e.key) || t.index.getSemanticTrace()?.labels.has(e.key) || i.push({
		...n(e),
		code: "undefined-ref",
		severity: "warning",
		message: `Undefined reference '${e.key}'`
	});
	let a = /* @__PURE__ */ new Map();
	for (let { definition: e } of r.definitions) {
		let t = a.get(e.key) ?? [];
		t.push(e), a.set(e.key, t);
	}
	for (let [e, t] of a) if (!(t.length < 2 || t.length !== r.names.get(e))) for (let r of t) i.push({
		...n(r),
		code: "duplicate-label",
		severity: "warning",
		message: `Duplicate label '${e}' (${t.length} declarations)`,
		relatedInformation: t.slice(0, 33).filter((e) => e !== r).slice(0, 32).map((t) => ({
			...n(t),
			message: `Conflicting label '${e}'`
		}))
	});
	return i;
}
function n(e) {
	return {
		file: e.file,
		line: e.line,
		column: e.column,
		endColumn: e.column + e.key.length
	};
}
//#endregion
export { t as referenceRepairDiagnostics };
