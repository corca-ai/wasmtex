import { NeutralPosition, NeutralRange } from './protocol';
/** Offsets at which each line begins (`lineStarts[0] === 0`). */
export declare function buildLineStarts(text: string): number[];
/** Convert an absolute offset to a 1-based `{line, column}` via binary search. */
export declare function offsetToLineCol(lineStarts: number[], offset: number): {
    line: number;
    column: number;
};
/** Convert a clamped 1-based document position to an absolute offset. */
export declare function positionToOffset(text: string, lineStarts: number[], position: NeutralPosition): number;
/** Convert absolute start/end offsets to a 1-based, end-exclusive neutral range. */
export declare function rangeFromOffsets(lineStarts: number[], start: number, end: number): NeutralRange;
