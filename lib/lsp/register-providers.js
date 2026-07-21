import * as e from "monaco-editor";
import { createCompletionProvider as s } from "./completion-provider.js";
import { createDefinitionProvider as m } from "./definition-provider.js";
import { createHoverProvider as n } from "./hover-provider.js";
import { createSignatureHelpProvider as a, createFoldingRangeProvider as v, createDocumentHighlightProvider as P, createInlayHintsProvider as c, createLinkProvider as g, createSemanticTokensProvider as l, createCodeActionProvider as f } from "./language-feature-providers.js";
import { createReferenceProvider as p } from "./reference-provider.js";
import { createRenameProvider as d } from "./rename-provider.js";
import { createDocumentSymbolProvider as u } from "./symbol-provider.js";
function C(o, i, t, r = "latex") {
  return [
    e.languages.registerCompletionItemProvider(
      r,
      s(o, i)
    ),
    e.languages.registerDefinitionProvider(r, m(o)),
    e.languages.registerHoverProvider(r, n(o)),
    e.languages.registerDocumentSymbolProvider(
      r,
      u(o)
    ),
    e.languages.registerReferenceProvider(r, p(o)),
    e.languages.registerRenameProvider(
      r,
      d(o, t)
    ),
    // Iteration 11 — rounded-out language features.
    e.languages.registerSignatureHelpProvider(r, a()),
    e.languages.registerFoldingRangeProvider(r, v()),
    e.languages.registerDocumentHighlightProvider(
      r,
      P(o)
    ),
    e.languages.registerInlayHintsProvider(r, c(o)),
    e.languages.registerLinkProvider(r, g()),
    e.languages.registerDocumentSemanticTokensProvider(
      r,
      l()
    ),
    e.languages.registerCodeActionProvider(r, f(o))
  ];
}
export {
  C as registerLatexProviders
};
