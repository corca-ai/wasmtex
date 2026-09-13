import { Token } from './lsp/latex-tokenizer.js';
import { LatexStructuralDeclaration } from './syntax-contract.js';
interface DeclarationDocument {
    fileId: string;
    path: string;
    content: string;
}
export declare function collectRichStructuralDeclarations(document: DeclarationDocument, tokens: readonly Token[]): LatexStructuralDeclaration[];
export {};
