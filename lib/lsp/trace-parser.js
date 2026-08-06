//#region src/lsp/trace-parser.ts
function e(e) {
	let t = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Set();
	for (let r of e.split(/\r?\n/)) r.startsWith("L:") ? t.add(r.slice(2).trim()) : r.startsWith("R:") && n.add(r.slice(2).trim());
	return {
		labels: t,
		refs: n
	};
}
//#endregion
export { e as parseTraceFile };
