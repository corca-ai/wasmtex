import { CompileResult, HeapCheckpointArm } from '../types.js';
/** Project text files (path → content), including the main file. */
export type SourceSet = Map<string, string>;
export interface HeapCheckpointEngine {
    readonly supportsHeapCheckpoints: boolean;
    readonly supportsLineCheckpoints?: boolean;
    readonly supportsSharedCheckpoints?: boolean;
    readonly supportsFileCheckpoints?: boolean;
    setCheckpointBudget?(maxCount: number, maxBytes: number): void;
    compile(options?: {
        checkpoints?: Array<{
            id: string;
            line: number;
            path?: string;
        }>;
    }): Promise<CompileResult>;
    compileFromHeapCheckpoint(id: string, checkpoints?: Array<{
        id: string;
        line: number;
        path?: string;
    }>): Promise<CompileResult>;
    dropHeapCheckpoints(ids?: string[]): Promise<void>;
}
export interface HeapCheckpointOptions {
    mainFile?: string;
    /** Checkpoints kept (LRU by use). Default 4. */
    maxCheckpoints?: number;
    /** Total sparse-image bytes kept across checkpoints. Default 320 MiB. */
    maxBytes?: number;
    /** Minimum effective head text, including earlier included files. Default 512. */
    minHeadBytes?: number;
}
export type { HeapCheckpointArm } from '../types.js';
export interface HeapResumeResult {
    result: CompileResult;
    /** False when the edit touched labels/numbering and a full reconcile pass should follow. */
    final: boolean;
    checkpointId: string;
}
/** 0-based offset of the start of 1-based `line` in `text`, or -1 when past the end. */
export declare function lineStartOffset(text: string, line: number): number;
/** 1-based line containing 0-based `offset`. */
export declare function lineOfOffset(text: string, offset: number): number;
/**
 * The line to checkpoint for an edit at `offset`: the start of the paragraph before the
 * one containing the edit (a blank-line boundary), so that further edits in the same
 * paragraph — and typing just above it — still resume from it. Without a blank-line
 * boundary, use the previous source line. Never inside the preamble.
 */
export declare function checkpointLineForEdit(source: string, offset: number, minHeadBytes?: number, lineFallback?: boolean): number | null;
/**
 * Bookkeeping for heap checkpoints of one document on one engine. The headless compiler
 * owns the engine and calls in at three points: when it is about to run a full compile
 * ({@link armsForFullCompile}), when a full compile finished ({@link noteFull}), and when an
 * edit arrives ({@link tryResume}).
 */
export declare class HeapCheckpointCompiler {
    private readonly engine;
    private readonly mainFile;
    private readonly maxCheckpoints;
    private readonly maxBytes;
    private readonly minHeadBytes;
    private readonly checkpoints;
    /** Sources at the last full compile (the diff baseline for edits and placement). */
    private last;
    private lastMain;
    private seq;
    private tick;
    constructor(engine: HeapCheckpointEngine, options?: HeapCheckpointOptions);
    get enabled(): boolean;
    /** Ids and bytes of the checkpoints currently held (for telemetry and tests). */
    get held(): Array<{
        id: string;
        line: number;
        bytes: number;
    }>;
    /** Copy proof and diff baselines; the engine's fork owns the copied heap. */
    cloneForEngine(engine: HeapCheckpointEngine, onlyIds?: readonly (string | undefined)[]): HeapCheckpointCompiler;
    /** A preview must not advance the full-result baseline or arm new checkpoints. */
    previewCheckpoint(source: string, files: SourceSet): string | undefined;
    /** Select a prepared region before an edit, before its bytes are written. */
    previewCheckpointForEdit(source: string, files: SourceSet, path: string, offset: number): string | undefined;
    reset(): void;
    /** Keep a secondary-source edit only when the checkpoint proves it had not
     * read that file, including through a precompiled preamble. Older workers
     * lack this proof and retain their conservative reset behavior. */
    invalidateFile(path: string, content?: string | Uint8Array): void;
    /**
     * Checkpoints to arm on the full compile about to run for `source`: the paragraph before
     * the region the last edit touched (or, with no baseline, before the end of the document),
     * unless a held checkpoint already covers it. `extraOffset` lets a host add the cursor location.
     */
    armsForFullCompile(source: string, files: SourceSet, extraOffset?: number, hint?: {
        path: string;
        offset: number;
    }): HeapCheckpointArm[];
    private armForSecondarySource;
    private fullCompileOffsets;
    private effectiveHeadFloor;
    /** Record a finished full compile (or resume) and the checkpoints it took. */
    noteFull(source: string, files: SourceSet, result: CompileResult): void;
    /**
     * Resume from a checkpoint valid for `source` (bytes before its line unchanged, its inputs
     * unchanged), taking new checkpoints for the edited region on the way. Null when no
     * checkpoint applies, when there is no baseline yet, or when the preamble changed.
     */
    tryResume(source: string, files: SourceSet, acceptInputs?: (paths: readonly string[]) => boolean, extraOffset?: number, hint?: {
        path: string;
        offset: number;
    }): Promise<HeapResumeResult | null>;
    /**
     * Latest held checkpoint whose line starts at or before `editOffset` and whose prefix and
     * inputs still match `source`/`files`. With `atLine`, only that line qualifies.
     */
    private findValid;
    /** True when `cp` sits at or before `editOffset` and its prefix and inputs still match. */
    private covers;
    private inputsMatch;
    private changeTouchesLabels;
    private remember;
    /** Drop least-recently-used checkpoints beyond the count/bytes budget. */
    private enforceBudget;
}
/** Project-relative path of a recorder input (`/work/chapters/a.tex` → `chapters/a.tex`),
 *  or null for TeX Live / system files. */
export declare function projectPath(raw: string): string | null;
