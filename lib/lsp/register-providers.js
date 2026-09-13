import { createAsyncCompletionProvider as e } from "./completion-provider.js";
import { createDefinitionProvider as t } from "./definition-provider.js";
import { createHoverProvider as n } from "./hover-provider.js";
import { createCodeActionProvider as r, createDocumentHighlightProvider as i, createFoldingRangeProvider as a, createInlayHintsProvider as o, createLinkProvider as s, createLinkedEditingRangeProvider as c, createSemanticTokensProvider as l, createSignatureHelpProvider as u } from "./language-feature-providers.js";
import { createReferenceProvider as d } from "./reference-provider.js";
import { createRenameProvider as f } from "./rename-provider.js";
import { createDocumentSymbolProvider as p } from "./symbol-provider.js";
import * as m from "monaco-editor";
//#region src/lsp/register-providers.ts
function h(h, g, _, v = "latex", y) {
	return [
		m.languages.registerCompletionItemProvider(v, e(h, g, y)),
		m.languages.registerDefinitionProvider(v, t(h)),
		m.languages.registerHoverProvider(v, n(h)),
		m.languages.registerDocumentSymbolProvider(v, p(h)),
		m.languages.registerReferenceProvider(v, d(h)),
		m.languages.registerRenameProvider(v, f(h, _)),
		m.languages.registerLinkedEditingRangeProvider(v, c(h, g)),
		m.languages.registerSignatureHelpProvider(v, u(h, y)),
		m.languages.registerFoldingRangeProvider(v, a()),
		m.languages.registerDocumentHighlightProvider(v, i(h)),
		m.languages.registerInlayHintsProvider(v, o(h)),
		m.languages.registerLinkProvider(v, s()),
		m.languages.registerDocumentSemanticTokensProvider(v, l()),
		m.languages.registerCodeActionProvider(v, r(h))
	];
}
//#endregion
export { h as registerLatexProviders };
