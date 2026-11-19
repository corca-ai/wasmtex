import { CompileResult } from '../types.js';
import { TexEngine } from './engine-select.js';
export interface EpsConversionRequest {
    readonly path: string;
    readonly bytes: Uint8Array;
    readonly signal: AbortSignal;
}
/** An optional host tool. Return one cropped PDF page or throw. No shell is involved. */
export type EpsConverter = (request: EpsConversionRequest) => Promise<Uint8Array>;
interface EpsRequest {
    path: string;
    output: string;
}
/** Only act on driver diagnostics, never on a guessed macro, comment or file name. */
export declare function requestedEpsGraphics(log: string, engine: TexEngine): EpsRequest[];
/** XeTeX's graphics driver encodes file names as UTF-8 in quoted PSfile specials. */
export declare function xetexEpsSpecial(special: string): string | null;
export declare function epsSidecar(path: string): string;
/** Bound the artifacts held in an engine filesystem. The host bounds converter execution. */
export declare const MAX_EPS_BYTES: number;
export declare const MAX_CONVERTED_EPS_BYTES: number;
export declare const MAX_EPS_GRAPHICS = 64;
export declare function validConvertedEps(bytes: Uint8Array): boolean;
export declare const EPS_CONVERSION_FAILED = "eps-conversion-failed";
export declare function epsConversionFailure(result: CompileResult, path: string, reason: string): CompileResult;
export {};
