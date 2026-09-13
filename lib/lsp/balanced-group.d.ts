/** Read brace/bracket groups, preserving escaped and brace-protected delimiters. */
export declare function readBalancedGroup(text: string, open: number, balancedOptional?: boolean): {
    closed: boolean;
    contentEnd: number;
    end: number;
};
