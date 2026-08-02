import { CompletionValueKind } from './package-db';
import { NeutralDocument, NeutralPosition, NeutralRange } from './protocol';
export type BibCompletionDomain = Extract<CompletionValueKind, 'bib-entry-type' | 'bib-field' | 'bib-entry-key' | 'bib-string'>;
export interface BibCompletionContext {
    type: 'bibtex';
    domain: BibCompletionDomain;
    documentPath: string;
    prefix: string;
    replacementRange: NeutralRange;
    entryType?: string;
    field?: string;
    usedFields: string[];
}
/** Error-tolerant completion context for BibTeX and biblatex database source. */
export declare function analyzeBibCompletionContext(document: NeutralDocument, position: NeutralPosition): BibCompletionContext | null;
