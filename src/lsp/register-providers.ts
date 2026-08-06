import * as monaco from 'monaco-editor'
import type { VirtualFS } from '../fs/virtual-fs'
import { createAsyncCompletionProvider } from './completion-provider'
import type { CompletionResolverRegistry } from './completion-registry'
import { createDefinitionProvider } from './definition-provider'
import { createHoverProvider } from './hover-provider'
import {
  createCodeActionProvider,
  createDocumentHighlightProvider,
  createFoldingRangeProvider,
  createInlayHintsProvider,
  createLinkProvider,
  createSemanticTokensProvider,
  createSignatureHelpProvider,
} from './language-feature-providers'
import type { ProjectIndex } from './project-index'
import { createReferenceProvider } from './reference-provider'
import { createRenameProvider, type WorkspaceEditInfo } from './rename-provider'
import { createDocumentSymbolProvider } from './symbol-provider'

export function registerLatexProviders(
  index: ProjectIndex,
  fs: VirtualFS,
  onWorkspaceEdit?: (info: WorkspaceEditInfo) => void,
  languageId = 'latex',
  completionRegistry?: CompletionResolverRegistry,
): monaco.IDisposable[] {
  return [
    monaco.languages.registerCompletionItemProvider(
      languageId,
      createAsyncCompletionProvider(index, fs, completionRegistry),
    ),
    monaco.languages.registerDefinitionProvider(languageId, createDefinitionProvider(index)),
    monaco.languages.registerHoverProvider(languageId, createHoverProvider(index)),
    monaco.languages.registerDocumentSymbolProvider(
      languageId,
      createDocumentSymbolProvider(index),
    ),
    monaco.languages.registerReferenceProvider(languageId, createReferenceProvider(index)),
    monaco.languages.registerRenameProvider(
      languageId,
      createRenameProvider(index, onWorkspaceEdit),
    ),
    // Iteration 11 — rounded-out language features.
    monaco.languages.registerSignatureHelpProvider(languageId, createSignatureHelpProvider()),
    monaco.languages.registerFoldingRangeProvider(languageId, createFoldingRangeProvider()),
    monaco.languages.registerDocumentHighlightProvider(
      languageId,
      createDocumentHighlightProvider(index),
    ),
    monaco.languages.registerInlayHintsProvider(languageId, createInlayHintsProvider(index)),
    monaco.languages.registerLinkProvider(languageId, createLinkProvider()),
    monaco.languages.registerDocumentSemanticTokensProvider(
      languageId,
      createSemanticTokensProvider(),
    ),
    monaco.languages.registerCodeActionProvider(languageId, createCodeActionProvider(index)),
  ]
}
