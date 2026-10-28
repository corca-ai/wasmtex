import { TexError } from '../types.js';
/** A disposable prefix may retain errors already visible in its complete PDF.
 * Positive source locations remain exact; line-zero file context is unverified.
 * New kinds, locations or additional occurrences still require a full compile.
 */
export declare function previewErrorsCovered(baseline: readonly TexError[], preview: readonly TexError[]): boolean;
