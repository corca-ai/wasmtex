//#region src/lsp/reference-value.ts
function e(e, t, n) {
	if (!e.hasCompleteAuxData()) return;
	let r = n === "pageref" ? e.resolveLabelPage(t) : n === "ref" || n === "eqref" ? e.resolveLabel(t) : void 0;
	return r && !/[\\{}%$~_^#&]/.test(r) ? r : void 0;
}
//#endregion
export { e as referenceDisplayValue };
