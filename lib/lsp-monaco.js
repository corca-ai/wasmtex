import { ensureLanguagesRegistered as t } from "./editor/setup.js";
import { registerLatexProviders as o } from "./lsp/register-providers.js";
function i(e, r = {}) {
  return t(), o(
    e.getProjectIndex(),
    e.getVirtualFileSystem(),
    r.onWorkspaceEdit,
    r.languageId ?? "latex",
    e.getCompletionRegistry()
  );
}
export {
  t as ensureLanguagesRegistered,
  i as registerLatexMonacoProviders
};
