import { provideReferences as e } from "./neutral-providers.js";
import { modelToDoc as t } from "./monaco-doc.js";
import { neutralLocationToMonaco as n } from "./source-position-monaco.js";
//#region src/lsp/reference-provider.ts
function r(r) {
	return { provideReferences(i, a) {
		return e(t(i), {
			line: a.lineNumber,
			column: a.column
		}, r).map(n);
	} };
}
//#endregion
export { r as createReferenceProvider };
