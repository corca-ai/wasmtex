import { VirtualFS } from '../fs/virtual-fs';
import { CompletionValueKind } from './package-db';
import { NeutralCompletionItem } from './protocol';
export type ProjectFileCompletionKind = Extract<CompletionValueKind, 'project-tex' | 'project-bib' | 'project-image' | 'project-listing' | 'project-data' | 'project-file'>;
/** Complete compatible host-owned project files while preserving the typed path style. */
export declare function completeProjectFiles(kind: ProjectFileCompletionKind, prefix: string, documentPath: string, fs: VirtualFS): NeutralCompletionItem[];
