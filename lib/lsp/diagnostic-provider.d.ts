import { ProjectIndex } from './project-index';
export interface Diagnostic {
    file: string;
    line: number;
    column: number;
    endColumn: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
    code: string;
}
/** Compute static analysis diagnostics from project index */
export declare function computeDiagnostics(index: ProjectIndex): Diagnostic[];
