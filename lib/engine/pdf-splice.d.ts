/**
 * Concatenate PDF parts (head pages, then tail pages) into one document for
 * incremental compilation (#55). The engine emits PDF 1.7 with object/xref streams,
 * so a robust merge needs a real PDF library — we use `pdf-lib`, an OPTIONAL peer
 * dependency loaded via dynamic import. It has zero impact unless incremental
 * compilation is actually used; if the host hasn't installed it, {@link splicePdfs}
 * throws {@link PdfLibUnavailableError} and the caller falls back to a full compile.
 *
 * Note: cross-part links/outline destinations (e.g. a hyperref dest spanning the
 * checkpoint boundary) are not preserved by page copy; a full compile reconciles them.
 */
export declare class PdfLibUnavailableError extends Error {
    constructor();
}
/** Merge PDF byte arrays into one (pages in order). Needs ≥1 part. */
export declare function splicePdfs(parts: Uint8Array[]): Promise<Uint8Array>;
/** Page count of a PDF (via pdf-lib). */
export declare function pdfPageCount(pdf: Uint8Array): Promise<number>;
