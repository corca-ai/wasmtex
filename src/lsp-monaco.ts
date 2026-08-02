import type * as Monaco from 'monaco-editor'
import { ensureLanguagesRegistered } from './editor/setup'
import { registerLatexProviders } from './lsp/register-providers'
import type { WorkspaceEditInfo } from './lsp/rename-provider'
import type { LatexLanguageService } from './lsp-service'

export interface LatexMonacoProviderOptions {
  /** Monaco language id to register providers for. Defaults to `latex`. */
  languageId?: string
  /** Called when a rename spans one or more files. */
  onWorkspaceEdit?: (info: WorkspaceEditInfo) => void
}

export function registerLatexMonacoProviders(
  service: LatexLanguageService,
  options: LatexMonacoProviderOptions = {},
): Monaco.IDisposable[] {
  ensureLanguagesRegistered()
  return registerLatexProviders(
    service.getProjectIndex(),
    service.getVirtualFileSystem(),
    options.onWorkspaceEdit,
    options.languageId ?? 'latex',
    service.getCompletionRegistry(),
  )
}

export { ensureLanguagesRegistered }
export type { WorkspaceEditInfo }
