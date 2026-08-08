import { ProjectIndex } from './lsp/project-index';
export declare const LATEX_SYNTAX_SCHEMA_VERSION: 1;
export interface LatexSyntaxRange {
    startOffset: number;
    endOffset: number;
}
export interface LatexSyntaxSourceRef {
    fileId: string;
    path: string;
    range: LatexSyntaxRange;
}
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
export interface LatexFileSyntax {
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
    reset(snapshot: LatexProjectSyntaxInput): void;
    upsert(document: LatexDocumentInput): LatexFileSyntax;
    move(fileId: string, nextPath: string): void;
    remove(fileId: string): void;
    getFile(fileId: string): LatexFileSyntax | null;
    /** The LSP service can reuse the exact same parsed snapshot. */
    getProjectIndex(): ProjectIndex;
    getStats(): LatexSyntaxStats;
}
export declare function createLatexSyntaxService(snapshot?: LatexProjectSyntaxInput): LatexSyntaxService;
