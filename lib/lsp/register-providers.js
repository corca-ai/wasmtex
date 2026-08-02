import * as e from "monaco-editor";
import { createAsyncCompletionProvider as m } from "./completion-provider.js";
import { createDefinitionProvider as n } from "./definition-provider.js";
import { createHoverProvider as a } from "./hover-provider.js";
import { createSignatureHelpProvider as v, createFoldingRangeProvider as c, createDocumentHighlightProvider as P, createInlayHintsProvider as g, createLinkProvider as l, createSemanticTokensProvider as f, createCodeActionProvider as p } from "./language-feature-providers.js";
import { createReferenceProvider as d } from "./reference-provider.js";
import { createRenameProvider as u } from "./rename-provider.js";
import { createDocumentSymbolProvider as H } from "./symbol-provider.js";
function A(o, i, t, r = "latex", s) {
  return [
    e.languages.registerCompletionItemProvider(
      r,
      m(o, i, s)
    ),
    e.languages.registerDefinitionProvider(r, n(o)),
    e.languages.registerHoverProvider(r, a(o)),
    e.languages.registerDocumentSymbolProvider(
      r,
      H(o)
    ),
    e.languages.registerReferenceProvider(r, d(o)),
    e.languages.registerRenameProvider(
      r,
      u(o, t)
    ),
    // Iteration 11 — rounded-out language features.
    e.languages.registerSignatureHelpProvider(r, v()),
    e.languages.registerFoldingRangeProvider(r, c()),
    e.languages.registerDocumentHighlightProvider(
      r,
      P(o)
    ),
    e.languages.registerInlayHintsProvider(r, g(o)),
    e.languages.registerLinkProvider(r, l()),
    e.languages.registerDocumentSemanticTokensProvider(
      r,
      f()
    ),
    e.languages.registerCodeActionProvider(r, p(o))
  ];
}
export {
  A as registerLatexProviders
};
