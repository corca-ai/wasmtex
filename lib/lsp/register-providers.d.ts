import { VirtualFS } from '../fs/virtual-fs';
import { ProjectIndex } from './project-index';
import { WorkspaceEditInfo } from './rename-provider';
import * as monaco from 'monaco-editor';
export declare function registerLatexProviders(index: ProjectIndex, fs: VirtualFS, onWorkspaceEdit?: (info: WorkspaceEditInfo) => void, languageId?: string): monaco.IDisposable[];
