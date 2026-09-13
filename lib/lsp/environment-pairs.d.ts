import { Token } from './latex-tokenizer.js';
import { NeutralRange } from './protocol.js';
/** Literal, source-owned names. Control sequences and parameter templates are excluded. */
export declare const ENVIRONMENT_NAME_PATTERN = "[A-Za-z0-9@:_*\\-]+";
export interface LinkedEditingRanges {
    ranges: NeutralRange[];
    wordPattern: string;
}
export interface EnvironmentNamePair {
    begin: NeutralRange;
    end: NeutralRange;
}
/** Consume the parser's existing token stream and source-preserving template mask. */
export declare function environmentNamePairs(source: string, masked: string, tokens: readonly Token[], lineStarts: number[]): EnvironmentNamePair[];
export declare function linkedEnvironmentRanges(pairs: readonly EnvironmentNamePair[], line: number, column: number): NeutralRange[] | null;
