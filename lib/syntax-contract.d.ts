/**
 * Transport-neutral document syntax contract shared by WasmTex consumers.
 *
 * The contract describes observable TeX structure. Mathematical meaning is
 * deliberately left to downstream semantic engines.
 */
export declare const LATEX_SYNTAX_SCHEMA_VERSION: 4;
export interface LatexSyntaxRange {
    startOffset: number;
    endOffset: number;
}
export interface LatexSyntaxSourceRef {
    fileId: string;
    path: string;
    range: LatexSyntaxRange;
}
export type LatexSyntaxState = 'complete' | 'incomplete' | 'ambiguous' | 'opaque' | 'cyclic' | 'truncated';
export type LatexNotationNodeKind = 'token' | 'sequence' | 'group' | 'command' | 'script' | 'delimiter' | 'alignment' | 'environment' | 'modifier' | 'style' | 'named-operator' | 'opaque' | 'error';
/** Revision-local node index. It is never stable across document updates. */
export type LatexSyntaxNodeId = number;
export interface LatexNotationNodeRanges {
    full: LatexSyntaxRange;
    command?: LatexSyntaxRange;
    name?: LatexSyntaxRange;
    nucleus?: LatexSyntaxRange;
    editable?: LatexSyntaxRange;
}
export interface LatexSyntaxProvenance {
    origin: 'source' | 'call-site' | 'definition' | 'expansion' | 'generated';
    source: LatexSyntaxSourceRef;
    callSite?: LatexSyntaxSourceRef;
    definitions?: readonly LatexSyntaxSourceRef[];
    editable: boolean;
}
/**
 * One source-preserving node in a compact revision-local arena.
 *
 * Names and text remain optional because unknown and malformed TeX must stay
 * representable without inventing structure. Array position is the node ID.
 */
export interface LatexNotationNode {
    kind: LatexNotationNodeKind;
    parent: LatexSyntaxNodeId | null;
    children: readonly LatexSyntaxNodeId[];
    ranges: LatexNotationNodeRanges;
    state: LatexSyntaxState;
    name?: string;
    text?: string;
    provenance: LatexSyntaxProvenance;
}
export interface LatexMathRoot {
    node: LatexSyntaxNodeId;
    delimiter: string;
    fullRange: LatexSyntaxRange;
    contentRange: LatexSyntaxRange;
    state: 'complete' | 'incomplete';
}
export interface LatexVisibleProseSpan {
    range: LatexSyntaxRange;
    state: 'complete';
}
export type LatexScopeKind = 'document' | 'section' | 'environment';
export interface LatexSyntaxScope {
    kind: LatexScopeKind;
    parent: number | null;
    range: LatexSyntaxRange;
    state: 'complete' | 'incomplete';
    name?: string;
    level?: 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph';
    source?: LatexSyntaxSourceRef;
}
export type LatexStructuralDeclaration = {
    kind: 'class' | 'package';
    name: string;
    options: string;
    source: LatexSyntaxSourceRef;
} | {
    kind: 'macro' | 'environment' | 'operator' | 'paired-delimiter';
    name: string;
    source: LatexSyntaxSourceRef;
} | {
    kind: 'glossary' | 'acronym';
    key: string;
    source: LatexSyntaxSourceRef;
};
export interface LatexDocumentSyntaxSnapshot {
    /** Arena nodes; array position is the revision-local node ID. */
    nodes: readonly LatexNotationNode[];
    mathRoots: readonly LatexMathRoot[];
    visibleProse: readonly LatexVisibleProseSpan[];
    scopes: readonly LatexSyntaxScope[];
    declarations: readonly LatexStructuralDeclaration[];
}
export declare function assertLatexSyntaxSchemaVersion(value: unknown): asserts value is {
    schemaVersion: typeof LATEX_SYNTAX_SCHEMA_VERSION;
};
