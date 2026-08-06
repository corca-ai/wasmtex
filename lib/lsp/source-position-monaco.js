import * as e from "monaco-editor";
//#region src/lsp/source-position-monaco.ts
function t(t) {
	let n = t.file.startsWith("/") ? t.file : `/${t.file}`;
	return {
		uri: e.Uri.file(n),
		range: new e.Range(t.line, t.column, t.line, t.column)
	};
}
function n(t) {
	let n = t.file.startsWith("/") ? t.file : `/${t.file}`;
	return {
		uri: e.Uri.file(n),
		range: new e.Range(t.range.startLine, t.range.startColumn, t.range.endLine, t.range.endColumn)
	};
}
//#endregion
export { n as neutralLocationToMonaco, t as sourceLocationToMonaco };
