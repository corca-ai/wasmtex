import { CompileResult } from '../types';
/** Project text files (path → content), including the main file. */
export type SourceSet = Map<string, string>;
export interface HeapCheckpointEngine {
    readonly supportsHeapCheckpoints: boolean;
    compile(options?: {
        checkpoints?: Array<{
            id: string;
            line: number;
        }>;
    }): Promise<CompileResult>;
    compileFromHeapCheckpoint(id: string, checkpoints?: Array<{
        id: string;
        line: number;
    }>): Promise<CompileResult>;
    dropHeapCheckpoints(ids?: string[]): Promise<void>;
}
export interface HeapCheckpointOptions {
    mainFile?: string;
    /** Checkpoints kept (LRU by use). Default 4. */
    maxCheckpoints?: number;
    /** Total sparse-image bytes kept across checkpoints. Default 320 MiB. */
    maxBytes?: number;
    /** Never checkpoint within this many bytes of the start of the body. Default 512. */
    minHeadBytes?: number;
}
export interface HeapCheckpointArm {
    id: string;
    line: number;
}
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
 * paragraph — and typing just above it — still resume from it. Never inside the preamble.
 */
export declare function checkpointLineForEdit(source: string, offset: number, minHeadBytes?: number): number | null;
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
    reset(): void;
    /**
     * Checkpoints to arm on the full compile about to run for `source`: the paragraph before
     * the region the last edit touched (or, with no baseline, before the end of the document),
     * unless a held checkpoint already covers it. `extraLine` lets a host add the cursor line.
     */
    armsForFullCompile(source: string, files: SourceSet, extraOffset?: number): HeapCheckpointArm[];
    /** Record a finished full compile (or resume) and the checkpoints it took. */
    noteFull(source: string, files: SourceSet, result: CompileResult): void;
    /**
     * Resume from a checkpoint valid for `source` (bytes before its line unchanged, its inputs
     * unchanged), taking new checkpoints for the edited region on the way. Null when no
     * checkpoint applies, when there is no baseline yet, or when the preamble changed.
     */
    tryResume(source: string, files: SourceSet): Promise<HeapResumeResult | null>;
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
