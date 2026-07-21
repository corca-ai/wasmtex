import type * as pdfjsLib from 'pdfjs-dist';
export interface SourceLocation {
    file: string;
    line: number;
}
export interface PdfLocation {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
/**
 * Maps PDF text positions back to source lines using text content matching.
 * Approximate — works for plain text, not for math/tables/figures.
 */
export declare class TextMapper {
    private pageBlocks;
    private sourceLines;
    /** Register source file content for matching */
    setSource(file: string, content: string): void;
    /**
     * Replace the entire set of registered source files. Use this when the project
     * file set may have changed (rename/delete) so stale files are dropped and can
     * no longer be matched by inverse search.
     */
    setSources(sources: Iterable<readonly [string, string]>): void;
    /** Extract text blocks from a PDF page */
    indexPage(page: pdfjsLib.PDFPageProxy, pageNum: number): Promise<void>;
    /** Find the source line for a click at (x, y) on the given page */
    lookup(pageNum: number, x: number, y: number): SourceLocation | null;
    /** Forward search: find PDF position for a source line */
    forwardLookup(file: string, line: number): PdfLocation | null;
    /** Clear all indexed data */
    clear(): void;
    private findClosestBlock;
    private matchTextToSource;
    private stripTexCommands;
    /** Score how well cleanText matches a PDF block's text. Higher = better match. 0 = no match. */
    private matchScore;
    private findInSources;
}
