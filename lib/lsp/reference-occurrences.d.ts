/** Literal source occurrences only. The host supplies compile-bound display
 * values; syntax never estimates counters or interprets citation styles. */
export interface ReferenceOccurrence {
    command: 'label' | 'ref' | 'eqref' | 'pageref' | 'cite';
    from: number;
    to: number;
    keys: string[];
}
export declare function getReferenceOccurrences(content: string): ReferenceOccurrence[];
