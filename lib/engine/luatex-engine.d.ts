import { CompileResult, HeapCheckpointArm } from '../types.js';
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
    private checkpointBudget;
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    /** True once the worker reported the checkpoint build (see `luatexHeapCheckpoints`). */
    get supportsHeapCheckpoints(): boolean;
    get supportsLineCheckpoints(): boolean;
    get supportsFileCheckpoints(): boolean;
    get supportsResumeRecorder(): boolean;
    setCheckpointBudget(maxCount: number, maxBytes: number): void;
    /** Compile; on the checkpoint build, `checkpoints` asks the worker to keep a resumable
     *  state before reading each listed line (reported in `result.heapCheckpoints`). */
    compile(options?: {
        checkpoints?: HeapCheckpointArm[];
    }): Promise<CompileResult>;
    /** Resume a compile from a checkpoint taken earlier: the worker restores that state,
     *  reads the rest of the project as the host last wrote it, and finishes the run like a
     *  normal compile. The caller guarantees the checkpoint is still valid. */
    compileFromHeapCheckpoint(id: string, checkpoints?: HeapCheckpointArm[]): Promise<CompileResult>;
    /** A disposable prefix of pages 1..`pageLimit` resumed from heap checkpoint `id`; its
     *  auxiliary files are put back by the worker. Null when this build cannot. */
    compileHeapPreview(pageLimit: number, id: string): Promise<CompileResult | null>;
    /** Free checkpoints in the worker (all when `ids` is omitted). */
    dropHeapCheckpoints(ids?: string[]): Promise<void>;
    private withBudget;
    private finishCompile;
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
