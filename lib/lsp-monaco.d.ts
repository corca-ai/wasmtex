import { ensureLanguagesRegistered } from './editor/setup.js';
import { WorkspaceEditInfo } from './lsp/rename-provider.js';
import { LatexLanguageService } from './lsp-service.js';
import type * as Monaco from 'monaco-editor';
export interface LatexMonacoProviderOptions {
    /** Monaco language id to register providers for. Defaults to `latex`. */
    languageId?: string;
    /** Called when a rename spans one or more files. */
    onWorkspaceEdit?: (info: WorkspaceEditInfo) => void;
}
export declare function registerLatexMonacoProviders(service: LatexLanguageService, options?: LatexMonacoProviderOptions): Monaco.IDisposable[];
export { ensureLanguagesRegistered };
export type { WorkspaceEditInfo };
