import { Token } from './lsp/latex-tokenizer';
import { LatexDocumentSyntaxSnapshot, LatexMathRoot, LatexNotationNode, LatexSyntaxNodeId, LatexSyntaxRange } from './syntax-contract';
interface NotationDocument {
    fileId: string;
    path: string;
    content: string;
}
interface NotationMathRegion {
    delimiter: string;
    fullRange: LatexSyntaxRange;
    contentRange: LatexSyntaxRange;
    closed: boolean;
}
export declare function buildNotationCst(document: NotationDocument, tokens: readonly Token[], regions: readonly NotationMathRegion[], checkCancelled?: () => void): {
    nodes: readonly LatexNotationNode[];
    mathRoots: readonly LatexMathRoot[];
};
/** Locate the source path without serializing a second interval tree. */
export declare function findLatexNotationPath(snapshot: Pick<LatexDocumentSyntaxSnapshot, 'mathRoots' | 'nodes'>, offset: number): readonly LatexSyntaxNodeId[];
export {};
