import { Token } from './latex-tokenizer';
import { FileSymbols } from './types';
/**
 * Spans of source that are not interpretable LaTeX code: comments, inline
 * `\verb`, verbatim environment bodies, and false conditional branches. Other
 * consumers (e.g. the linter) use these to skip non-code regions.
 */
export declare function maskSpans(content: string): Array<[number, number]>;
/** Like {@link maskSpans} but reuses already-computed tokens — so a caller that already
 *  tokenized (e.g. the linter) doesn't tokenize the same source a second time. */
export declare function maskSpansFromTokens(tokens: Token[]): Array<[number, number]>;
export interface UserMacroExpansion {
    name: string;
    inputStart: number;
    inputEnd: number;
    surface: string;
}
/**
 * Expand every concrete user-macro invocation in a document.
 *
 * This is the structural handoff used by semantic consumers. It deliberately
 * returns source ranges alongside generated text: diagnostics and edits remain
 * anchored to the invocation, never to synthetic expansion text.
 */
export declare function expandUserMacroCalls(source: string): readonly UserMacroExpansion[];
/**
 * Parse a LaTeX file into a flat {@link FileSymbols} record.
 *
 * Tokenizes the source, masks regions that must not be interpreted (comments,
 * inline `\verb`, verbatim environments, false `\iffalse`/`\iftrue` branches),
 * then extracts labels, refs, citations, sections, command/environment
 * definitions, includes, packages, and bib items over the whole (masked) text —
 * so multi-line arguments work and commented/verbatim content is ignored.
 * User macros that wrap `\label`/`\ref`/`\cite` are shallow-expanded so the
 * symbols they generate are indexed at their call sites.
 */
export declare function parseLatexFile(content: string, filePath: string, tokens?: readonly Token[]): FileSymbols;
