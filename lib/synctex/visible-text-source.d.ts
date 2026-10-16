import { LatexFileSyntax } from '../syntax.js';
import { LatexSyntaxBlock, LatexSyntaxRange } from '../syntax-contract.js';
import { NormalizedVisibleText } from './visible-text-normalize.js';
export interface VisibleTextSourceBlock extends NormalizedVisibleText {
    kind: LatexSyntaxBlock['kind'] | 'metadata' | 'footnote';
    name?: string;
    /** The containing neutral syntax block, not an automatic-edit range. */
    structuralRange: LatexSyntaxRange;
}
export interface VisibleTextSourceProjection {
    fileId: string;
    file: string;
    documentVersion: number;
    sourceLength: number;
    lineStarts: Uint32Array;
    blocks: readonly VisibleTextSourceBlock[];
    truncated: boolean;
}
/** Consumes an existing syntax snapshot; never executes or expands TeX. */
export declare function projectVisibleTextSource(source: string, syntax: LatexFileSyntax, maxSourceUnits?: number): VisibleTextSourceProjection;
