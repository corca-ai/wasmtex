import { WasmTexPdftexEngine } from './wasmtex-engine';
export interface IncrementalResult {
    pdf: Uint8Array | null;
    log: string;
    success: boolean;
    /** True when served from a checkpoint (fast path) rather than a full compile. */
    incremental: boolean;
    /** True when a new checkpoint had to be built this call (one-time cost). */
    checkpointBuilt: boolean;
    /** False when the result may have stale cross-references and a full reconcile pass
     *  is advisable (the edit touched labels / sectioning). */
    final: boolean;
    /** Why the full path was taken, when `incremental` is false. */
    reason?: string;
    /** SyncTeX for the isolated tail compile (`incremental` only) — tail-relative pages/lines.
     *  Mergeable onto the last full compile's head SyncTeX via `mergeTailSynctex` (#99 P2). */
    tailSynctex?: Uint8Array | null;
    /** Pages the head occupies (1..headPageCount) — the tail splices after them. */
    headPageCount?: number;
    /** Add to the tail's tail-relative source lines to get document lines (= head line count). */
    tailLineOffset?: number;
    /** True when the head is byte-for-byte unchanged since the last full compile, so its head
     *  SyncTeX (pages 1..headPageCount) is still valid to merge the tail onto. */
    headUnchangedSinceFull?: boolean;
}
export interface IncrementalOptions {
    /** Max checkpoints kept (LRU). Default 4. */
    maxCheckpoints?: number;
    /** Don't checkpoint when the head would be smaller than this (bytes). Default 2000. */
    minHeadBytes?: number;
    /** Main file name written for full compiles. Default 'main.tex'. */
    mainFile?: string;
}
/** A project file map: path → text content (includes the main file). */
export type FileSet = Map<string, string>;
/** Did the edit add/remove label- or numbering-affecting markup between `prev` and
 *  `next`? Examines the changed span (between the common prefix and suffix), widened just
 *  enough to reconstitute a `\command` token the edit boundary cut through — so a command
 *  completed/split at the boundary (`\r` → `\ref{x}`, `\section` → `\subsection`) is still
 *  seen, while an unchanged label merely *near* the edit does not force a needless full
 *  reconcile. */
export declare function editTouchesLabels(prev: string, next: string): boolean;
export declare class IncrementalCompiler {
    private readonly engine;
    private readonly maxCheckpoints;
    private readonly minHeadBytes;
    private mainFile;
    /** Last fully-compiled project files (path → content), including the main file. */
    private last;
    /** Main source at the last FULL compile (distinct from `last`, which advances on fast paints
     *  too). The head-unchanged test for the SyncTeX merge diffs against this. (#99 P2) */
    private lastFullSource;
    private readonly checkpoints;
    private readonly lru;
    constructor(engine: WasmTexPdftexEngine, opts?: IncrementalOptions);
    /** Forget all incremental state (call when the document/engine is swapped). */
    reset(): void;
    /** Re-point the compiler at a new main file (and reset state). Without this the old
     *  main-file name stays wired into snapshot()/editOffset()/changeTouchesLabels(),
     *  corrupting the diff baseline after the host switches the active main file. */
    setMainFile(path: string): void;
    /** Standalone convenience: fast path if possible, else a raw full compile. Hosts
     *  that own a richer compile pipeline (bibtex/rerun) should instead call
     *  {@link tryIncremental} and {@link noteFull}. */
    compile(source: string, files?: FileSet): Promise<IncrementalResult>;
    private syncProjectFiles;
    /**
     * Record that the host performed a full compile (updating `main.aux`), so the next
     * edit diffs against it. Drops cached checkpoints when the preamble changed.
     */
    noteFull(source: string, files?: FileSet): void;
    /** Cheap pre-flight for a servable tail edit: the head/tail split at the boundary before
     *  the edit, or null when a full compile is required (no baseline, preamble changed, no
     *  page break before the edit, or too-small head). No compile — pure string work. Shared
     *  by {@link tryIncremental} and {@link canFastServe}. Head size measures EFFECTIVE content:
     *  with \include the main-source prefix is tiny but the included chapters are the real head,
     *  so their bytes count too. */
    private planFast;
    /** Attempt the checkpoint fast path; return null to signal "fall back to full". */
    tryIncremental(source: string, files?: FileSet): Promise<IncrementalResult | null>;
    /** True iff a fast, `final` incremental paint is servable for this edit — the cheap
     *  pre-flight ({@link planFast}) succeeds AND the change touches no labels/numbering. Lets
     *  an interactive host skip the tail compile entirely for edits that must go full (preamble,
     *  pre-first-page-break, or label/citation edits), so those never pay a wasted tail compile
     *  on the way to the full one. (#99) */
    canFastServe(source: string, files?: FileSet): boolean;
    /**
     * Speculatively build (and cache) the checkpoint for the boundary before `editOffset`
     * (default: end of document) so a subsequent tail edit there is served from cache
     * instead of paying the ~one-full-compile build cost on the first edit (#99, option A).
     *
     * Returns `true` iff it built a new checkpoint; `false` when there's no baseline yet
     * (a full compile must have seeded `main.aux` first), the preamble differs from the
     * baseline, no page-break boundary qualifies, the head is too small, or the checkpoint
     * is already cached (already-warm → nothing to do).
     *
     * The caller MUST ensure the engine is idle: `buildCheckpoint` drives the worker, and
     * unlike `compile()` it does not flip the engine's ready status, so overlapping it with
     * a compile is the caller's responsibility to serialize.
     */
    prebuild(source: string, files?: FileSet, editOffset?: number): Promise<boolean>;
    /** First changed position in the main source, pulled earlier to the `\include`/`\input`
     *  command of any included file whose content changed since the last full compile. */
    private editOffset;
    /** The `\include`/`\input` offset that loads `path`. Matches the include name exactly
     *  (`ch1.tex` ↔ `\include{ch1}`), else by bare basename so a subdirectory chapter loaded
     *  via TeX's search path (`\input{intro}` ↔ `chapters/intro.tex`) is still found. */
    private includePosFor;
    /** Content of the file an include name refers to: the exact `${n}.tex`/`n` key, else a
     *  unique basename match (so `\input{intro}` resolves `chapters/intro.tex`). '' if none
     *  or ambiguous (two files sharing a basename → don't guess). */
    private includedContent;
    /** True if the main edit OR any changed included file touched labels/numbering. */
    private changeTouchesLabels;
    private ensureCheckpoint;
    /** Effective head content size: the main-source prefix plus the bytes of the files it
     *  includes (so an \include-only main file isn't mistaken for a tiny head). */
    private headSize;
    /** Key a checkpoint by its head text AND the content of the files the head can bake in —
     *  so an early-chapter or head-asset edit invalidates exactly the checkpoints after it.
     *  Folds in: (1) `\include`/`\input`/`\subfile` targets the head loads (basename-aware),
     *  and (2) every non-.tex project file (images/data the head may `\includegraphics`), which
     *  an include-name lookup can't see — without (2) a changed head asset reuses a stale head. */
    private checkpointKey;
    private snapshot;
    private touch;
    private evict;
    private full;
}
