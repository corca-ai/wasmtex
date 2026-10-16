import { PdfLocation } from './text-mapper.js';
import { VisibleTextQueryOptions } from './visible-text-catalog.js';
import { NormalizedVisibleText } from './visible-text-normalize.js';
import { VisibleTextSourceBlock, VisibleTextSourceProjection } from './visible-text-source.js';
export interface VisibleTextPdfPage {
    page: number;
    text: string;
    /** Original UTF-16 PDF extraction offsets; return separate line/run boxes. */
    rangeRects(start: number, end: number): readonly PdfLocation[];
}
export interface VisibleTextSourceMatch {
    fileId: string;
    file: string;
    documentVersion: number;
    start: number;
    end: number;
    line: number;
    column: number;
    kind: VisibleTextSourceBlock['kind'];
    structuralRange: VisibleTextSourceBlock['structuralRange'];
    contextBefore: number;
    contextAfter: number;
}
export interface VisibleTextPdfMatch {
    page: number;
    start: number;
    end: number;
    method: 'exact' | 'dehyphenated';
    regions: readonly PdfLocation[];
    contextBefore: number;
    contextAfter: number;
}
export interface VisibleTextIndexResult<T> {
    candidates: T[];
    truncated: boolean;
}
/** Opt-in navigation evidence index. The host owns compile identity and selection. */
export declare class VisibleTextIndex {
    private sources;
    private sourceCatalog;
    private pages;
    private pageCatalog;
    private dehyphenatedCatalog;
    private sourceTruncated;
    /** Replaces the inventory: removed or renamed paths cannot leave stale candidates. */
    setSources(sources: readonly VisibleTextSourceProjection[]): void;
    /** Bounded page LRU; call with the visible and neighboring pages, not every PDF page. */
    setPage(page: VisibleTextPdfPage): void;
    clearPages(): void;
    private rebuildPages;
    findSources(text: string, options?: VisibleTextQueryOptions): VisibleTextIndexResult<VisibleTextSourceMatch>;
    findPdf(text: string, options?: VisibleTextQueryOptions & {
        dehyphenate?: boolean;
    }): VisibleTextIndexResult<VisibleTextPdfMatch>;
    /** Small source fragment at a compiled caret. No reparse or project scan on lookup. */
    sourceFragments(fileId: string, offset: number): readonly NormalizedVisibleText[];
}
