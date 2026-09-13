import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionResolverRegistry } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
import { WorkspaceEditInfo } from './rename-provider.js';
import * as monaco from 'monaco-editor';
export declare function registerLatexProviders(index: ProjectIndex, fs: VirtualFS, onWorkspaceEdit?: (info: WorkspaceEditInfo) => void, languageId?: string, completionRegistry?: CompletionResolverRegistry): monaco.IDisposable[];
