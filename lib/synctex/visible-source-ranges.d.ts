import { LatexSyntaxRange } from '../syntax-contract.js';
/** Small interval index shared by the source projection's masks and prose. */
export declare class VisibleSourceRanges {
    readonly ranges: readonly LatexSyntaxRange[];
    constructor(ranges: readonly LatexSyntaxRange[]);
    private first;
    intersects(start: number, end: number): boolean;
    clips(start: number, end: number): LatexSyntaxRange[];
}
