import { CompileResult } from '../types.js';
import { BaseTexFmtEngine } from './tex-fmt-engine.js';
import { WasmTexEngineOptions } from './wasmtex-engine.js';
/** Suffix of the separate job a page preview runs as. */
export declare const LUATEX_PREVIEW_JOB_SUFFIX = "-wasmtex-preview";
/** Directory receiving every `\\openout` file a preview writes. */
export declare const LUATEX_PREVIEW_OUTPUT_DIR = "wasmtex-preview-out";
/**
 * Stop after `pageLimit` shipped pages. LuaTeX's `tex.finish()` runs the normal
 * final cleanup, closes files and finalizes the PDF, so the prefix is a complete
 * standalone document. Every `\\openout` stream is redirected into
 * {@link LUATEX_PREVIEW_OUTPUT_DIR}, so a stopped prefix cannot truncate a file
 * the next full pass reads. The hook precedes the author's first line on that
 * same line, so diagnostics keep their source line numbers.
 */
export declare function luatexPreviewHook(pageLimit: number): string;
/** Job-named inputs a full pass read, e.g. `./main.aux` -> `aux`. */
export declare function luatexJobInputExtensions(inputFiles: readonly string[] | undefined, job: string): string[];
export declare class WasmTexLuatexEngine extends BaseTexFmtEngine {
    /** Extensions of job-named inputs (`.aux`, `.toc`, `.bbl`, …) the last full pass read. */
    private jobInputs;
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    /**
     * Typeset only pages 1..`pageLimit` of the current main source. The prefix runs
     * as a separate job that starts from copies of the last full pass's job-named
     * inputs, so its references match that pass while the full pass's own
     * auxiliary files stay untouched for the next canonical compile. Null means no
     * main source is known: run {@link compile} instead.
     */
    compilePagePreview(pageLimit: number): Promise<CompileResult | null>;
    flushCache(): Promise<void>;
    terminate(): void;
    private jobName;
}
