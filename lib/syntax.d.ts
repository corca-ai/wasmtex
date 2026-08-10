import { ProjectIndex } from './lsp/project-index';
import { LATEX_SYNTAX_SCHEMA_VERSION, LatexDocumentSyntaxSnapshot, LatexSyntaxRange, LatexSyntaxSourceRef } from './syntax-contract';
export * from './syntax-contract';
export interface LatexMathRegion {
    delimiter: string;
    fullRange: LatexSyntaxRange;
    contentRange: LatexSyntaxRange;
    closed: boolean;
}
export interface LatexMacroEvent {
    kind: 'definition' | 'call';
    name: string;
    source: LatexSyntaxSourceRef;
    definitions: readonly LatexSyntaxSourceRef[];
    expansion: {
        /** Bounded static expansion outcome for this source occurrence. */
        status: 'not-applicable' | 'unresolved' | 'expanded' | 'cycle' | 'truncated';
        depth: number;
        /** False when meaning is generated and an editor must not edit a synthetic occurrence. */
        editable: boolean;
        /** Expanded TeX surface. Present only for a complete, bounded call expansion. */
        surface?: string;
        /** Full invocation replaced by `surface`, including consumed arguments. */
        inputRange?: LatexSyntaxRange;
    };
}
export interface LatexInclude {
    path: string;
    type: 'input' | 'include' | 'subfile';
    source: LatexSyntaxSourceRef;
}
export interface LatexSyntaxDiagnostic {
    code: 'unclosed-math';
    message: string;
    severity: 'warning';
    range: LatexSyntaxRange;
}
export interface LatexDocumentInput {
    fileId: string;
    path: string;
    content: string;
    documentVersion: number;
    language?: 'latex' | 'markdown';
}
export interface LatexProjectSyntaxInput {
    documents: readonly LatexDocumentInput[];
}
export interface LatexFileSyntax extends LatexDocumentSyntaxSnapshot {
    schemaVersion: typeof LATEX_SYNTAX_SCHEMA_VERSION;
    fileId: string;
    path: string;
    documentVersion: number;
    mathRegions: readonly LatexMathRegion[];
    macros: readonly LatexMacroEvent[];
    includes: readonly LatexInclude[];
    diagnostics: readonly LatexSyntaxDiagnostic[];
}
export interface LatexSyntaxStats {
    documents: number;
    /** Number of source tokenization/parsing passes performed by this service. */
    parseCount: number;
}
/**
 * Stable, versioned syntax boundary for consumers such as Semath.
 * Offsets are UTF-16, zero-based and half-open, matching JavaScript and Monaco.
 */
export declare class LatexSyntaxService {
    private readonly files;
    private readonly index;
    private parseCount;
    private relinkDeferred;
    reset(snapshot: LatexProjectSyntaxInput): void;
    upsert(document: LatexDocumentInput): LatexFileSyntax;
    move(fileId: string, nextPath: string): void;
    remove(fileId: string): void;
    getFile(fileId: string): LatexFileSyntax | null;
    /** The LSP service can reuse the exact same parsed snapshot. */
    getProjectIndex(): ProjectIndex;
    getStats(): LatexSyntaxStats;
    /** Re-link calls after any inventory change without reparsing unchanged files. */
    private refreshMacroDefinitions;
}
export declare function createLatexSyntaxService(snapshot?: LatexProjectSyntaxInput): LatexSyntaxService;
