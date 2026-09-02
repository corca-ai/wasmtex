/**
 * Accessible (tagged, PDF/UA) export on top of the LaTeX tagging kernel (#84).
 *
 * The LaTeX kernel (2025-06 and later, TeX Live 2026) produces tagged PDF when the document
 * starts with `\DocumentMetadata{tagging=on}`. Nothing here reimplements tagging: the export
 * is an ordinary compile of the same project whose main file carries that declaration —
 * on a sibling compiler, so the interactive preview keeps its own engine and snapshot.
 * `inspectPdfTagging` reads the result back (structure tree, mark info, language, figure
 * alt-text coverage) so hosts can show a report without a PDF library.
 */
export type PdfStandard = 'ua-2' | 'ua-1';
export interface AccessibleExportOptions {
    /** BCP 47 language of the document; detected from babel/polyglossia/hyperref when omitted. */
    lang?: string;
    /** PDF/UA part to declare. UA-2 (PDF 2.0) is what the tagging kernel targets. */
    standard?: PdfStandard;
}
/** How well a document class is known to work with the tagging kernel:
 *  `supported` — compiles cleanly, structure tree, only the kernel's own veraPDF gaps;
 *  `partial` — produces a structure tree but logs tagging errors (check the output);
 *  `unsupported` — broken structure or a failed compile; `unknown` — not in the matrix. */
export type ClassSupport = 'supported' | 'partial' | 'unsupported' | 'unknown';
/** Class matrix, TeX Live 2026 (`\DocumentMetadata{tagging=on}` + a title, sections, a list, a
 *  table, two figures, a footnote and a bibliography), checked with veraPDF PDF/UA-2.
 *  Every standard/KOMA class fails only clause 8.2.2 (a few rules the kernel does not yet
 *  mark as artifacts) — the baseline the kernel itself sets. */
export declare const CLASS_SUPPORT: Readonly<Record<string, ClassSupport>>;
/** The `\documentclass` name, or null. */
export declare function documentClassOf(source: string): string | null;
/** Language the document declares (hyperref `pdflang`, `\DocumentMetadata{lang=…}`,
 *  babel/polyglossia main language, kotex/CJK packages), as BCP 47; null when none. */
export declare function detectDocumentLanguage(source: string): string | null;
/** True when the main file already declares `\DocumentMetadata`. */
export declare function hasDocumentMetadata(source: string): boolean;
export interface DocumentMetadataInjection {
    source: string;
    /** False when the document already carried its own `\DocumentMetadata` (left untouched). */
    injected: boolean;
    lang: string;
    standard: PdfStandard;
}
/**
 * Main-file source for the accessible export: `\DocumentMetadata{…}` prepended on the first
 * line (it must precede `\documentclass`; no line number moves). A document that already
 * declares its own metadata is trusted as written.
 */
export declare function injectDocumentMetadata(source: string, options?: AccessibleExportOptions): DocumentMetadataInjection;
/** Error text the kernel emits when it predates `tagging=on` (TeX Live 2025's 2024-11 kernel). */
export declare function kernelLacksTagging(log: string): boolean;
export interface PdfTaggingReport {
    /** A structure tree root exists and the document is marked as tagged. */
    tagged: boolean;
    /** `/Lang` of the document catalog, when declared. */
    lang: string | null;
    /** PDF/UA part declared in XMP (`pdfuaid:part`), when any. */
    uaPart: number | null;
    /** `/Figure` structure elements, and how many of them carry `/Alt`. */
    figures: number;
    figuresWithAlt: number;
    /** Heading (`/H`, `/H1`…`/H6`) and table structure elements. */
    headings: number;
    tables: number;
    /** Document title from the catalog/XMP, when any. */
    title: string | null;
}
/** Read back what an exported PDF declares, without a PDF library. */
export declare function inspectPdfTagging(pdf: Uint8Array): Promise<PdfTaggingReport>;
