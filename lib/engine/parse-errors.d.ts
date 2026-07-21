import { Diagnostic, FontGlyphGap, TexError } from '../types';
/** A structured event from the log's parenthesized file open/close markers
 *  (`(./file.tex … )`). `eol` marks the end of source line `lineIndex`. The single
 *  source of truth for the paren scanner — {@link buildFileContext} and the
 *  dependency-graph builder both consume it. */
export type FileScanEvent = {
    type: 'open';
    path: string;
    raw: string;
} | {
    type: 'close';
} | {
    type: 'eol';
    lineIndex: number;
};
/** Scan pdfTeX/XeTeX log lines into ordered file open/close events, handling the
 *  non-file parentheses (via a skip depth) exactly as the engine nests them. */
export declare function scanFileEvents(lines: string[]): FileScanEvent[];
/**
 * Build an array mapping each log line to the current file from pdfTeX's
 * parenthesized file open/close markers: `(./file.tex ... )`
 */
export declare function buildFileContext(lines: string[]): string[];
export declare function parseTexErrors(log: string): TexError[];
/**
 * Every `Missing character:` occurrence in document order (NOT deduped), each as
 * {font, codepoint}. The order matches the `.notdef` boxes in the XDV, so the two can
 * be zipped to attach output positions (#89 L2b).
 */
export declare function parseGlyphOccurrences(log: string): {
    font: string;
    codepoint: number;
}[];
/**
 * Per-font missing-glyph report from `Missing character:` log lines. These mean the
 * font lacks a glyph for a character the document uses, so it renders as a blank
 * .notdef box even though the compile succeeds (#89). Headless: data only.
 */
export declare function parseGlyphGaps(log: string): FontGlyphGap[];
/**
 * Unified, machine-readable diagnostics for a compile (#54). The evolving superset of
 * parseTexErrors + parseGlyphGaps: every entry carries a stable `code` a host can
 * branch on. Missing-glyph entries carry the structured FontGlyphGap in `glyph`.
 */
export declare function buildDiagnostics(log: string, gaps?: FontGlyphGap[]): Diagnostic[];
