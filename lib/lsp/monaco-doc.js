//#region src/lsp/monaco-doc.ts
function e(e) {
	return {
		path: e.uri ? e.uri.path.replace(/^\//, "") : "",
		getText: () => e.getValue(),
		lineAt: (t) => e.getLineContent(t)
	};
}
//#endregion
export { e as modelToDoc };
