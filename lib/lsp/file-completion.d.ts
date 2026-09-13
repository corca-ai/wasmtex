import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionValueKind } from './package-db.js';
import { NeutralCompletionItem } from './protocol.js';
export type ProjectFileCompletionKind = Extract<CompletionValueKind, 'project-tex' | 'project-bib' | 'project-image' | 'project-listing' | 'project-data' | 'project-file'>;
/** Complete compatible host-owned project files while preserving the typed path style. */
export declare function completeProjectFiles(kind: ProjectFileCompletionKind, prefix: string, documentPath: string, fs: VirtualFS): NeutralCompletionItem[];
