/** A rendered spelling and the real UTF-16 source slice producing it. */
export interface VisibleTextUnit {
    text: string;
    start: number;
    end: number;
}
export interface NormalizedVisibleText {
    text: string;
    /** One original range per normalized UTF-16 code unit, including expansions. */
    starts: Uint32Array;
    ends: Uint32Array;
}
/** Normalization is a view; source offsets always name the unchanged input. */
export declare function normalizeVisibleText(units: readonly VisibleTextUnit[]): NormalizedVisibleText;
export declare function normalizeNavigationText(text: string): NormalizedVisibleText;
