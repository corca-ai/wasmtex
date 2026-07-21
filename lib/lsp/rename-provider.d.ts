import { ProjectIndex } from './project-index';
import type * as Monaco from 'monaco-editor';
export interface WorkspaceEditInfo {
    edits: Array<{
        file: string;
        range: {
            startLineNumber: number;
            startColumn: number;
            endLineNumber: number;
            endColumn: number;
        };
        newText: string;
    }>;
}
export declare function createRenameProvider(projectIndex: ProjectIndex, onWorkspaceEdit?: (info: WorkspaceEditInfo) => void): Monaco.languages.RenameProvider;
