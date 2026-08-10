import { Token } from './lsp/latex-tokenizer';
import { LatexStructuralDeclaration } from './syntax-contract';
interface DeclarationDocument {
    fileId: string;
    path: string;
    content: string;
}
export declare function collectRichStructuralDeclarations(document: DeclarationDocument, tokens: readonly Token[]): LatexStructuralDeclaration[];
export {};
