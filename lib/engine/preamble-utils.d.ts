export interface PreambleSplit {
    /** Everything before \begin{document} */
    preamble: string;
    /** Everything from \begin{document} onwards (inclusive) */
    body: string;
    /** Number of lines in the preamble portion */
    preambleLineCount: number;
}
/**
 * Split TeX source into preamble and body at the \begin{document} boundary.
 * Returns null if \begin{document} is not found or is inside a comment.
 */
export declare function extractPreamble(texSource: string): PreambleSplit | null;
/**
 * Simple string hash (djb2 variant). Returns a base-36 string.
 * Used to detect preamble changes without comparing full text.
 */
export declare function simpleHash(str: string): string;
