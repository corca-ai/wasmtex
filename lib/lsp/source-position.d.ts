/** Shared offset ↔ line/column helpers for source analysis. */
/** Offsets at which each line begins (`lineStarts[0] === 0`). */
export declare function buildLineStarts(text: string): number[];
/** Convert an absolute offset to a 1-based `{line, column}` via binary search. */
export declare function offsetToLineCol(lineStarts: number[], offset: number): {
    line: number;
    column: number;
};
