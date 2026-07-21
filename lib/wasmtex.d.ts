import { WasmTexEventMap, WasmTexOptions } from './component-types';
import { PdfViewer } from './viewer/pdf-viewer';
import type * as Monaco from 'monaco-editor';
type EventHandler<T> = (event: T) => void;
type EditorContainerInput = string | HTMLElement;
export declare class WasmTex {
    private mainFile;
    private opts;
    private assetBaseUrl;
    private editorContainer;
    private previewContainer;
    private engine;
    private fs;
    private synctexParser;
    private pdfViewer?;
    private scheduler;
    private editor;
    private projectIndex;
    private lspDisposables;
    private models;
    private modelDisposables;
    private currentFile;
    private runtimeScopeAttribute;
    private pendingRecompile;
    private rerunController;
    private renderSeq;
    private interactionDisposables;
    private unhandledRejectionHandler;
    /** Disposer for the optional ?perf=1 debug overlay (removes the div + unsubscribes). */
    private perfOverlayDispose;
    private forwardSearchTimer;
    private rerunTimer;
    private lastForwardLine;
    private lastForwardFile;
    private switchingModel;
    private previewEl;
    private preview;
    private openCodeEditorOverride;
    private previewUrl;
    private bibtexEngine;
    private bibtexDone;
    private pendingBibtex;
    private bibtexRunId;
    private incremental;
    private reconcileArmed;
    private prebuildTimer;
    private prebuildInFlight;
    private lastFullSynctexData;
    private pendingFastMerge;
    private externalEditor;
    private disposed;
    private listeners;
    constructor(editorContainer: EditorContainerInput, previewContainer: EditorContainerInput, options?: WasmTexOptions);
    private initComponents;
    private applyContainerBindings;
    private initViewer;
    private initScheduler;
    /** Current main-file content (for engine detection). */
    private mainSource;
    /**
     * The engine a Unicode-only document needs, if that engine is not available in
     * this build (the browser currently ships pdfLaTeX only). Returns null when the
     * document compiles with pdfLaTeX.
     */
    private unavailableEngine;
    /**
     * Compile with the active engine, but first short-circuit documents that require
     * a Unicode engine (XeLaTeX/LuaLaTeX) not yet shipped in the browser build —
     * surfacing a clear "requires XeLaTeX" result instead of a cryptic pdfTeX error.
     *
     * With `incremental` on (#99), a servable *final* body edit is served from a checkpoint
     * (fast paint, SyncTeX reused from the last full compile); `reconcileArmed` then makes the
     * next scheduled compile a full reconcile. All other edits — and the reconcile itself — run
     * a full compile. Serialised against a speculative prebuild (they share the one worker).
     */
    private compileActiveEngine;
    /** All project files with string content (path → content), for the incremental compiler's
     *  diff/checkpoint bookkeeping. Mirrors the headless compiler's file set. */
    private projectStringFiles;
    /** Map an incremental (checkpoint) result to a CompileResult for the fast paint. SyncTeX is
     *  null here — the viewer keeps the last full compile's parsed SyncTeX until the reconcile
     *  refreshes it (handleSuccessfulCompile skips handleSynctex for a fast paint). */
    private fastCompileResult;
    /** Arm a speculative checkpoint prebuild once the loop is idle (#99, option A). The next
     *  edit (onModelChange) or any new compile supersedes it. No-op without `incremental`. */
    private armPrebuild;
    /** Build the checkpoint for the boundary before the cursor, off the critical path. Sets
     *  {@link prebuildInFlight} so compileActiveEngine serialises against it (one worker). */
    private runPrebuild;
    private cancelPrebuild;
    /** The cursor's byte offset in the main source, as the prebuild boundary hint. Falls back
     *  to end-of-document when the cursor isn't in the main file (multi-file) or is unavailable
     *  — end maps to the last page break, the common "writing forward" case. */
    private cursorMainOffset;
    private initProjectModels;
    private initEditorState;
    private initBinaryPreview;
    private initEditorInteraction;
    private initRuntimeServices;
    init(): Promise<void>;
    /** Load a complete project state. */
    loadProject(files: Record<string, string | Uint8Array>): void;
    private updateModels;
    /** Export all project files. */
    saveProject(): Record<string, string | Uint8Array>;
    /** Open a specific file in the editor. */
    openFile(path: string): void;
    /** Update or create a single file. */
    setFile(path: string, content: string | Uint8Array): void;
    /** Read file content. */
    getFile(path: string): string | Uint8Array | null;
    /** Delete a file. */
    deleteFile(path: string): boolean;
    /** Create a folder (represented by a .gitkeep file). */
    createFolder(path: string): void;
    /** List all files in the project. */
    listFiles(): string[];
    /**
     * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
     * active TeX Live version. No-op when the persistent cache is unavailable.
     */
    clearCache(): Promise<void>;
    /** Trigger an immediate compilation. */
    compile(): void;
    /** Get the last rendered PDF as bytes. */
    getPdf(): Uint8Array | null;
    on<K extends keyof WasmTexEventMap>(event: K, handler: EventHandler<WasmTexEventMap[K]>): void;
    off<K extends keyof WasmTexEventMap>(event: K, handler: EventHandler<WasmTexEventMap[K]>): void;
    /** Get the raw Monaco editor instance. */
    getMonacoEditor(): Monaco.editor.IStandaloneCodeEditor;
    /** Get the Monaco model for a project file.
     *  Useful for attaching external bindings (e.g. y-monaco). */
    getModel(path: string): Monaco.editor.ITextModel | undefined;
    /** Get the built-in PDF viewer instance. */
    getViewer(): PdfViewer | undefined;
    /** Get the path of the file currently open in the editor. */
    getActiveFile(): string;
    /** Jump the editor to a specific line. */
    revealLine(line: number, file?: string): void;
    /** Cancel a pending debounced forward search (cursor-move → PDF jump). */
    private cancelForwardSearch;
    dispose(): void;
    private ensureModel;
    private disposeModel;
    private setStatus;
    private syncAndCompile;
    private ensureEngineDirectories;
    private onModelChange;
    private onFileSelect;
    /** Revoke the object URL backing the current binary preview, if any. */
    private revokePreviewUrl;
    private showBinaryPreview;
    private hideBinaryPreview;
    private updateEngineMetadata;
    private onCompileResult;
    private handleSuccessfulCompile;
    private handlePostCompile;
    /** Splice exact SyncTeX for a fast paint (#99 P2): merge the tail's SyncTeX onto the last full
     *  compile's head. On success the fast paint IS the final result (skip the reconcile) — the
     *  head is unchanged, cross-references are stable (a `final` edit), and SyncTeX is now exact.
     *  When it can't be merged (no last-full data, head changed since it, or a multi-file tail),
     *  fall back to Phase 1: keep the last full SyncTeX and arm the debounced full reconcile. */
    private applyFastSynctex;
    private handleSynctex;
    /** Cancel a queued cross-reference rerun (armed by {@link maybeRecompile}). A state
     *  reset — a fresh edit, a new project, or dispose — must cancel it, or the stale
     *  timer fires ~100ms later and runs a redundant, scheduler-bypassing compile of the
     *  now-superseded document (status flicker + wasted work). */
    private cancelPendingRerun;
    private maybeRecompile;
    private maybeRunBibtex;
    private isCurrentBibtexRun;
    private runBibtexChain;
    private ensureBibtexEngine;
    private sendFilesToBibtex;
    private updateBibIndex;
    private updateAuxIndex;
    private runDiagnostics;
    private downloadPdf;
    private downloadFormat;
    private emitOutline;
    private emit;
}
export {};
