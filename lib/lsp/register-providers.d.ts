import { VirtualFS } from '../fs/virtual-fs';
import { CompletionResolverRegistry } from './completion-registry';
import { ProjectIndex } from './project-index';
import { WorkspaceEditInfo } from './rename-provider';
import * as monaco from 'monaco-editor';
export declare function registerLatexProviders(index: ProjectIndex, fs: VirtualFS, onWorkspaceEdit?: (info: WorkspaceEditInfo) => void, languageId?: string, completionRegistry?: CompletionResolverRegistry): monaco.IDisposable[];
