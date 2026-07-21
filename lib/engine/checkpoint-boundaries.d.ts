/**
 * Pure helpers for choosing where to place a mid-document checkpoint (#55).
 *
 * A checkpoint may only sit at an EXISTING page break (`\clearpage` / `\newpage` /
 * `\cleardoublepage`): those are the points where dumping mid-document keeps the head's
 * pagination byte-identical to a full compile. (Dumping mid-page would force a spurious
 * page break.) On an edit we reuse the latest such boundary that lies before the first
 * changed character — so the head text is provably unchanged and its checkpoint valid.
 */
/** Byte offsets just AFTER each explicit page-break command (so the head includes the
 *  command and thus ships its pages). Matches inside `%` comments are skipped. */
export declare function findPageBreaks(source: string): number[];
/** Map each `\include`/`\input`/`\subfile` target name (without `.tex`) to the byte
 *  offset of its command in `source` — first occurrence wins. Used to translate "which
 *  included file changed" into an edit position for boundary selection. */
export declare function includePositions(source: string): Map<string, number>;
/** First index at which `a` and `b` differ; if one is a prefix of the other, the
 *  shorter length. Equal strings return their length. */
export declare function firstDifference(a: string, b: string): number;
/**
 * Pick the best checkpoint boundary for an edit: the latest page break at or before
 * `editOffset`, but no earlier than `minHead` bytes in (too-early checkpoints save
 * little). Returns null when no boundary qualifies (→ caller does a full compile).
 */
export declare function chooseBoundary(boundaries: number[], editOffset: number, minHead?: number): number | null;
/** Split `source` at `offset` into the checkpoint head (ending at the page break) and
 *  the tail to typeset from the checkpoint. */
export declare function splitAtBoundary(source: string, offset: number): {
    headText: string;
    tailText: string;
};
/** djb2 hash (base-36), matching the worker's preamble-hash, for keying checkpoints
 *  by head content. */
export declare function hashString(str: string): string;
