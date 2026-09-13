import { createAsyncCompletionProvider as e } from "./completion-provider.js";
import { createDefinitionProvider as t } from "./definition-provider.js";
import { createHoverProvider as n } from "./hover-provider.js";
import { createCodeActionProvider as r, createDocumentHighlightProvider as i, createFoldingRangeProvider as a, createInlayHintsProvider as o, createLinkProvider as s, createLinkedEditingRangeProvider as c, createSelectionRangeProvider as l, createSemanticTokensProvider as u, createSignatureHelpProvider as d } from "./language-feature-providers.js";
import { createReferenceProvider as f } from "./reference-provider.js";
import { createRenameProvider as p } from "./rename-provider.js";
import { createDocumentSymbolProvider as m } from "./symbol-provider.js";
import * as h from "monaco-editor";
//#region src/lsp/register-providers.ts
function g(g, _, v, y = "latex", b) {
	return [
		h.languages.registerCompletionItemProvider(y, e(g, _, b)),
		h.languages.registerDefinitionProvider(y, t(g)),
		h.languages.registerHoverProvider(y, n(g)),
		h.languages.registerDocumentSymbolProvider(y, m(g)),
		h.languages.registerReferenceProvider(y, f(g)),
		h.languages.registerRenameProvider(y, p(g, v)),
		h.languages.registerLinkedEditingRangeProvider(y, c(g, _)),
		h.languages.registerSelectionRangeProvider(y, l(g, _, b)),
		h.languages.registerSignatureHelpProvider(y, d(g, b)),
		h.languages.registerFoldingRangeProvider(y, a()),
		h.languages.registerDocumentHighlightProvider(y, i(g)),
		h.languages.registerInlayHintsProvider(y, o(g)),
		h.languages.registerLinkProvider(y, s()),
		h.languages.registerDocumentSemanticTokensProvider(y, u()),
		h.languages.registerCodeActionProvider(y, r(g))
	];
}
//#endregion
export { g as registerLatexProviders };
