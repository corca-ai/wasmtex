import { NormalizedVisibleText } from './visible-text-normalize.js';
export interface VisiblePdfTextVariant {
    method: 'exact' | 'dehyphenated';
    normalized: NormalizedVisibleText;
}
/** Renderer offsets remain those of the original extracted PDF string. */
export declare function projectVisiblePdfText(text: string, dehyphenate?: boolean): VisiblePdfTextVariant[];
