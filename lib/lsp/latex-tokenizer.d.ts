/**
 * Error-tolerant, catcode-aware LaTeX tokenizer.
 *
 * This is the lexical foundation the project index builds on. It never throws
 * on malformed input — it always returns a best-effort token stream covering
 * the whole source. Each token carries an absolute offset plus a 1-based
 * line/column so downstream consumers can report precise locations.
 *
 * It models the catcodes that matter for source intelligence: control
 * sequences, group braces, math toggles, comments, macro parameters, and
 * verbatim regions (`\verb`-style inline spans and verbatim-like environments)
 * whose contents must NOT be interpreted as commands.
 */
export type TokenType = 'command' | 'open' | 'close' | 'math' | 'comment' | 'verb' | 'param' | 'text';
export interface Token {
    type: TokenType;
    value: string;
    /** Absolute start offset (0-based, inclusive). */
    start: number;
    /** Absolute end offset (0-based, exclusive). */
    end: number;
    /** 1-based line of `start`. */
    line: number;
    /** 1-based column of `start`. */
    column: number;
}
/** Environments whose body is verbatim (commands inside are not interpreted). */
export declare const VERBATIM_ENVIRONMENTS: Set<string>;
/** Tokenize a LaTeX source string into a flat token stream. Never throws. */
export declare function tokenize(source: string): Token[];
