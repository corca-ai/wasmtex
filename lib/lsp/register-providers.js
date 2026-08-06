import { createAsyncCompletionProvider as e } from "./completion-provider.js";
import { createDefinitionProvider as t } from "./definition-provider.js";
import { createHoverProvider as n } from "./hover-provider.js";
import { createCodeActionProvider as r, createDocumentHighlightProvider as i, createFoldingRangeProvider as a, createInlayHintsProvider as o, createLinkProvider as s, createSemanticTokensProvider as c, createSignatureHelpProvider as l } from "./language-feature-providers.js";
import { createReferenceProvider as u } from "./reference-provider.js";
import { createRenameProvider as d } from "./rename-provider.js";
import { createDocumentSymbolProvider as f } from "./symbol-provider.js";
import * as p from "monaco-editor";
//#region src/lsp/register-providers.ts
function m(m, h, g, _ = "latex", v) {
	return [
		p.languages.registerCompletionItemProvider(_, e(m, h, v)),
		p.languages.registerDefinitionProvider(_, t(m)),
		p.languages.registerHoverProvider(_, n(m)),
		p.languages.registerDocumentSymbolProvider(_, f(m)),
		p.languages.registerReferenceProvider(_, u(m)),
		p.languages.registerRenameProvider(_, d(m, g)),
		p.languages.registerSignatureHelpProvider(_, l()),
		p.languages.registerFoldingRangeProvider(_, a()),
		p.languages.registerDocumentHighlightProvider(_, i(m)),
		p.languages.registerInlayHintsProvider(_, o(m)),
		p.languages.registerLinkProvider(_, s()),
		p.languages.registerDocumentSemanticTokensProvider(_, c()),
		p.languages.registerCodeActionProvider(_, r(m))
	];
}
//#endregion
export { m as registerLatexProviders };
