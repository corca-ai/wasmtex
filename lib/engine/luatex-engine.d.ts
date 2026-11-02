import { CompileResult } from '../types.js';
import { BaseTexFmtEngine, ChapterPreviewResult } from './tex-fmt-engine.js';
import { WasmTexEngineOptions } from './wasmtex-engine.js';
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
export declare function luatexPreviewHook(pageLimit: number, chapter?: {
    name: string;
    cap: number;
}): string;
export declare class WasmTexLuatexEngine extends BaseTexFmtEngine {
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    /** Typeset only pages 1..`pageLimit` of the current main source, or only the
     *  `\\include`d `chapter`, as a separate job (see {@link runPreviewJob}); null means
     *  run {@link compile} instead. */
    compilePagePreview(pageLimit: number, { chapter, cold }?: {
        chapter?: string;
        cold?: boolean;
    }): Promise<ChapterPreviewResult | null>;
    flushCache(): Promise<void>;
    terminate(): void;
}
