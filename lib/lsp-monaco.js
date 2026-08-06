import { ensureLanguagesRegistered as e } from "./editor/setup.js";
import { registerLatexProviders as t } from "./lsp/register-providers.js";
//#region src/lsp-monaco.ts
function n(n, r = {}) {
	return e(), t(n.getProjectIndex(), n.getVirtualFileSystem(), r.onWorkspaceEdit, r.languageId ?? "latex", n.getCompletionRegistry());
}
//#endregion
export { e as ensureLanguagesRegistered, n as registerLatexMonacoProviders };
