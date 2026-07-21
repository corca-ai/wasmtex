import { DocumentGeometry, FontGlyphGap, PageGeometry } from '../types';
export interface NotdefPlacement {
    /** Page number (\count0 from bop). */
    page: number;
    /** Points (bp) from the page's left/top edge. */
    x: number;
    y: number;
    /** The native font's point size (bp), for an approximate box size. */
    size: number;
}
export interface XdvNotdefResult {
    placements: NotdefPlacement[];
    /** False if the cursor could have desynced (traditional TFM text present); the
     *  caller should then not trust positions. */
    reliable: boolean;
}
/** Everything a single XDV walk yields. */
export interface XdvParse {
    pages: PageGeometry[];
    placements: NotdefPlacement[];
    reliable: boolean;
}
/** Walk the XDV once, producing geometry + .notdef placements + a reliability flag. */
export declare function parseXdv(xdv: Uint8Array): XdvParse;
/** Page/box geometry for the document (#54 slice 3). Thin wrapper over {@link parseXdv}. */
export declare function parseXdvGeometry(xdv: Uint8Array): DocumentGeometry;
/** Every `.notdef` box and its position (#89 L2b). Thin wrapper over {@link parseXdv}. */
export declare function parseXdvNotdef(xdv: Uint8Array): XdvNotdefResult;
/**
 * Zip ordered `.notdef` placements onto the log's ordered missing-char occurrences and
 * attach output positions to each glyph gap (#89 L2b). Both follow document order. Only
 * attaches when the parse is reliable AND the counts match exactly — otherwise positions
 * could be misaligned, so we leave them off rather than risk wrong overlay boxes. The
 * .notdef box is approximated as an em square on the baseline (no font metrics).
 */
export declare function attachPlacements(gaps: FontGlyphGap[], placements: NotdefPlacement[], reliable: boolean, log: string): void;
/** Convenience: parse the XDV and attach .notdef overlay positions to `gaps`. */
export declare function attachGlyphOutput(gaps: FontGlyphGap[], xdv: Uint8Array, log: string): void;
