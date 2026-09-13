export type GroupEndIndex = ReadonlyMap<number, number>;
/** Index required groups and legacy optional delimiters once. A brace-protected
 * closing bracket cannot end an optional group at an outer brace depth. */
export declare function indexGroupEnds(text: string, balancedOptional?: boolean): GroupEndIndex;
