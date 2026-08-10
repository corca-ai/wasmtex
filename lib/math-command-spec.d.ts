export type TexMathClass = 'ordinary' | 'operator' | 'binary' | 'relation' | 'opening' | 'closing' | 'punctuation' | 'inner';
export type MathCommandBehavior = 'atom' | 'modifier' | 'style' | 'named-surface' | 'fraction' | 'root' | 'delimiter' | 'alignment' | 'spacing' | 'no-op' | 'text' | 'opaque';
export type MathCommandArgumentRole = 'nucleus' | 'body' | 'name' | 'numerator' | 'denominator' | 'degree' | 'radicand' | 'annotation' | 'base' | 'subscript' | 'superscript' | 'index' | 'left' | 'right' | 'choice-display' | 'choice-text' | 'choice-script' | 'choice-scriptscript' | 'content' | 'options' | 'value' | 'unit' | 'delimiter';
export interface MathCommandArgumentSpec {
    readonly syntax: 'required' | 'optional';
    readonly role: MathCommandArgumentRole;
    readonly consumption?: 'atom' | 'token';
}
export interface MathCommandProvenance {
    readonly source: 'tex' | 'latex-kernel' | 'amsmath' | 'mathtools' | 'unicode-math' | 'package';
    readonly package?: string;
    readonly confidence: 'exact' | 'curated';
}
/** Neutral structural metadata. It must not encode mathematical meaning. */
export interface MathCommandSpec {
    readonly name: string;
    readonly behavior: MathCommandBehavior;
    readonly arguments: readonly MathCommandArgumentSpec[];
    readonly mathClass?: TexMathClass;
    readonly acceptsStar?: boolean;
    readonly expansion: 'structural' | 'opaque' | 'ignore';
    readonly provenance: MathCommandProvenance;
}
export declare const MATH_COMMAND_SPECS: readonly MathCommandSpec[];
export declare function getMathCommandSpec(name: string): MathCommandSpec | undefined;
