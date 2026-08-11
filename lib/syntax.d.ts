import { ProjectIndex } from './lsp/project-index';
import { LATEX_SYNTAX_SCHEMA_VERSION, LatexDocumentSyntaxSnapshot, LatexNotationArgument, LatexNotationNode, LatexSyntaxRange, LatexSyntaxSourceRef } from './syntax-contract';
export * from './math-command-spec';
export { findLatexNotationPath } from './notation-cst';
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
    arguments?: readonly LatexMacroArgument[];
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
        /** Neutral generated syntax for complete composite expansions. */
        notation?: LatexGeneratedNotationTree;
    };
}
export interface LatexGeneratedNotationTree {
    nodes: readonly LatexGeneratedNotationNode[];
    root: number;
}
export interface LatexGeneratedNotationNode {
    kind: LatexNotationNode['kind'];
    children: readonly number[];
    state: LatexNotationNode['state'];
    name?: string;
    text?: string;
    arguments?: readonly {
        node: number;
        role: LatexNotationArgument['role'];
        syntax: LatexNotationArgument['syntax'];
    }[];
    lexicalClass?: LatexNotationNode['lexicalClass'];
    mathClass?: LatexNotationNode['mathClass'];
}
export interface LatexMacroArgument {
    index: number;
    kind: 'required' | 'optional';
    value: string;
    source: LatexSyntaxSourceRef;
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
export interface LatexSyntaxCancellationToken {
    readonly isCancellationRequested: boolean;
}
export declare class LatexSyntaxCancelledError extends Error {
    readonly name = "LatexSyntaxCancelledError";
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
    notationNodes: number;
    recoveredNodes: number;
    snapshotBytes: number;
    lastInvalidatedDocuments: number;
    lastTransferBytes: number;
}
/**
 * Stable, versioned syntax boundary for consumers such as Semath.
 * Offsets are UTF-16, zero-based and half-open, matching JavaScript and Monaco.
 */
export declare class LatexSyntaxService {
    private readonly files;
    private readonly index;
    private macroCatalog;
    private parseCount;
    private relinkDeferred;
    private lastTransferFileIds;
    reset(snapshot: LatexProjectSyntaxInput): void;
    upsert(document: LatexDocumentInput, cancellationToken?: LatexSyntaxCancellationToken): LatexFileSyntax;
    move(fileId: string, nextPath: string): void;
    remove(fileId: string): void;
    getFile(fileId: string): LatexFileSyntax | null;
    /** Snapshots whose syntax/provenance changed in the latest inventory mutation. */
    getInvalidatedFiles(): readonly LatexFileSyntax[];
    /** The LSP service can reuse the exact same parsed snapshot. */
    getProjectIndex(): ProjectIndex;
    getStats(): LatexSyntaxStats;
    /** Re-link calls after any inventory change without reparsing unchanged files. */
    private refreshMacroDefinitions;
}
export declare function createLatexSyntaxService(snapshot?: LatexProjectSyntaxInput): LatexSyntaxService;
