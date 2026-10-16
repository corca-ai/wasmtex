import { NormalizedVisibleText } from './visible-text-normalize.js';
export interface VisibleTextOccurrence<T> {
    owner: T;
    start: number;
    end: number;
    normalizedStart: number;
    normalizedEnd: number;
    contextBefore: number;
    contextAfter: number;
}
export interface VisibleTextCandidates<T> {
    candidates: VisibleTextOccurrence<T>[];
    /** A clipped search must never be interpreted as proof of uniqueness. */
    truncated: boolean;
}
export interface VisibleTextQueryOptions {
    contextBefore?: string;
    contextAfter?: string;
    maxCandidates?: number;
}
/** Bounded, reusable substring index. Owners carry source or renderer identities. */
export declare class VisibleTextCatalog<T> {
    private readonly maxUnits;
    private readonly maxEntries;
    private readonly entries;
    private readonly grams;
    private postings;
    private units;
    private clipped;
    constructor(maxUnits?: number, maxEntries?: number);
    add(owner: T, normalized: NormalizedVisibleText): boolean;
    private candidateEntries;
    find(text: string, options?: VisibleTextQueryOptions): VisibleTextCandidates<T>;
}
