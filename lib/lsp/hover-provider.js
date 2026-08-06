import { provideHover as e } from "./neutral-providers.js";
import { modelToDoc as t } from "./monaco-doc.js";
import * as n from "monaco-editor";
//#region src/lsp/hover-provider.ts
function r(r) {
	return { provideHover(i, a) {
		let o = e(t(i), {
			line: a.lineNumber,
			column: a.column
		}, r);
		return o ? {
			contents: o.contents.map((e) => ({ value: e })),
			range: new n.Range(o.range.startLine, o.range.startColumn, o.range.endLine, o.range.endColumn)
		} : null;
	} };
}
//#endregion
export { r as createHoverProvider };
