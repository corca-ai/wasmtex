import { MathCommandArgumentRole, TexMathClass } from './math-command-spec';
/**
 * Transport-neutral document syntax contract shared by WasmTex consumers.
 *
 * The contract describes observable TeX structure. Mathematical meaning is
 * deliberately left to downstream semantic engines.
 */
export declare const LATEX_SYNTAX_SCHEMA_VERSION: 8;
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
/** Neutral lexical category from the authoritative TeX token stream. */
export type LatexLexicalClass = 'identifier' | 'number' | 'operator' | 'punctuation' | 'other';
/** Revision-local node index. It is never stable across document updates. */
export type LatexSyntaxNodeId = number;
export interface LatexNotationNodeRanges {
    full: LatexSyntaxRange;
    command?: LatexSyntaxRange;
    name?: LatexSyntaxRange;
    nucleus?: LatexSyntaxRange;
    /** Override for explicit provenance; implicit direct-source nodes edit `full`. */
    editable?: LatexSyntaxRange;
}
export interface LatexSyntaxProvenance {
    origin: 'source' | 'call-site' | 'definition' | 'expansion' | 'generated';
    source: LatexSyntaxSourceRef;
    callSite?: LatexSyntaxSourceRef;
    definitions?: readonly LatexSyntaxSourceRef[];
    editable: boolean;
}
export interface LatexNotationArgument {
    node: LatexSyntaxNodeId;
    role: MathCommandArgumentRole;
    syntax: 'required' | 'optional';
    range: LatexSyntaxRange;
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
    arguments?: readonly LatexNotationArgument[];
    lexicalClass?: LatexLexicalClass;
    mathClass?: TexMathClass;
    /**
     * Omitted for an editable node copied directly from this snapshot's file.
     * In that canonical case the source and editable range are
     * `(fileId, path, ranges.full)`.
     */
    provenance?: LatexSyntaxProvenance;
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
/** Observable source annotation adjacent to visible prose. */
export type LatexProseAnnotation = {
    kind: 'citation';
    /** Bare control-sequence name, without the leading backslash. */
    name: string;
    range: LatexSyntaxRange;
    state: 'complete' | 'incomplete';
} | {
    /** Neutral document metadata. Downstream consumers decide whether it is relevant. */
    kind: 'document-field';
    name: 'title' | 'author' | 'keywords';
    range: LatexSyntaxRange;
    valueRange?: LatexSyntaxRange;
    state: 'complete' | 'incomplete';
};
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
/**
 * One neutral source-order content block. Array order is document order, so
 * consumers can inspect adjacency without reconstructing source lines.
 */
export interface LatexSyntaxBlock {
    kind: 'heading' | 'paragraph' | 'display-math' | 'list-item' | 'caption' | 'table-row' | 'resource-entry';
    /** Revision-local index into `scopes`. */
    parentScope: number;
    range: LatexSyntaxRange;
    state: 'complete' | 'incomplete';
    /** Content after a neutral marker or delimiter, when structurally known. */
    contentRange?: LatexSyntaxRange;
    /** Neutral source spelling such as a heading level or declaration kind. */
    name?: string;
}
export type LatexStructuralDeclaration = {
    kind: 'class' | 'package';
    name: string;
    options: string;
    source: LatexSyntaxSourceRef;
} | {
    kind: 'environment';
    name: string;
    source: LatexSyntaxSourceRef;
} | {
    kind: 'macro';
    name: string;
    parameters?: number;
    optionalDefault?: string;
    body?: string;
    bodySource?: LatexSyntaxSourceRef;
    source: LatexSyntaxSourceRef;
    state?: 'complete' | 'incomplete';
} | {
    kind: 'operator';
    name: string;
    surface: string;
    limits: boolean;
    source: LatexSyntaxSourceRef;
    nameSource: LatexSyntaxSourceRef;
    surfaceSource: LatexSyntaxSourceRef;
    state: 'complete' | 'incomplete';
} | {
    kind: 'paired-delimiter';
    name: string;
    left: string;
    right: string;
    source: LatexSyntaxSourceRef;
    nameSource: LatexSyntaxSourceRef;
    state: 'complete' | 'incomplete';
} | {
    kind: 'glossary';
    key: string;
    options: readonly LatexStructuralField[];
    fields: readonly LatexStructuralField[];
    source: LatexSyntaxSourceRef;
    keySource: LatexSyntaxSourceRef;
    state: 'complete' | 'incomplete';
} | {
    kind: 'acronym';
    key: string;
    short: string;
    long: string;
    options: readonly LatexStructuralField[];
    source: LatexSyntaxSourceRef;
    keySource: LatexSyntaxSourceRef;
    shortSource: LatexSyntaxSourceRef;
    longSource: LatexSyntaxSourceRef;
    state: 'complete' | 'incomplete';
};
export interface LatexStructuralField {
    name: string;
    value: string;
    source: LatexSyntaxSourceRef;
}
export interface LatexDocumentSyntaxSnapshot {
    /** Arena nodes; array position is the revision-local node ID. */
    nodes: readonly LatexNotationNode[];
    mathRoots: readonly LatexMathRoot[];
    visibleProse: readonly LatexVisibleProseSpan[];
    proseAnnotations: readonly LatexProseAnnotation[];
    scopes: readonly LatexSyntaxScope[];
    /** Non-overlapping leaf blocks ordered by source range. */
    blocks: readonly LatexSyntaxBlock[];
    declarations: readonly LatexStructuralDeclaration[];
}
export declare function assertLatexSyntaxSchemaVersion(value: unknown): asserts value is {
    schemaVersion: typeof LATEX_SYNTAX_SCHEMA_VERSION;
};
