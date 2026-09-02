import { AccessibleExportOptions } from './engine/accessible-export';
import { BackendRegistry } from './engine/backend-registry';
import { EngineOption } from './engine/engine-select';
import { TikzExternalizationOptions } from './engine/tikz-externalization';
import { ProjectIndex } from './lsp/project-index';
import { AccessibleExportResult, CompileResult, CompletionSnapshotState, TexliveVersion, WarmupCache } from './types';
export type { BackendStageContract, ToolBackend, WasmTexBackendStages } from './backend-api';
export * from './backend-api';
export { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, INDEX_STAGE } from './backend-api';
export type { AccessibleExportOptions } from './engine/accessible-export';
export { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, COMPLETION_SNAPSHOT_SCHEMA_VERSION, } from './engine/completion-snapshot';
export type { AccessibleExportResult, CompilePhaseTimings, CompletionSnapshot, CompletionSnapshotCollection, CompletionSnapshotCommand, CompletionSnapshotEngine, CompletionSnapshotEvidence, CompletionSnapshotFieldName, CompletionSnapshotFields, CompletionSnapshotIdentity, CompletionSnapshotKey, CompletionSnapshotKeyFamily, CompletionSnapshotProfile, CompletionSnapshotResource, CompletionSnapshotState, CompletionSnapshotValue, DependencyManifest, DependencyManifestCoverage, DependencyManifestIncompleteReason, DependencyManifestSource, DependencyManifestStage, } from './types';
/**
 * One-shot accessible export without an interactive compiler: builds a compiler from
 * `options` (typically the TeX Live 2026 profile, whatever profile the editor uses), compiles
 * the project once with the tagging declaration in the main file, and disposes it. For hosts
 * whose preview profile predates the tagging kernel.
 */
export declare function compileAccessiblePdf(options: WasmTexCompilerOptions, exportOptions?: AccessibleExportOptions): Promise<AccessibleExportResult>;
export interface WasmTexCompilerOptions {
    /** TeX Live version to use. Defaults to '2025'. */
    texliveVersion?: TexliveVersion;
    /** TexLive server endpoint. Defaults to the public CDN. */
    texliveUrl?: string;
    /** Base URL for WASM/static assets. */
    assetBaseUrl?: string;
    /** Main TeX file name. Defaults to 'main.tex'. */
    mainFile?: string;
    /** Initial project files. Keys are file paths, values are content. */
    files?: Record<string, string | Uint8Array>;
    /** If true, do not attempt to preload the base .fmt file from the server. */
    skipFormatPreload?: boolean;
    /** If true, disable precompiled preamble snapshots and always run a full
     *  compile. An escape hatch for documents incompatible with preamble
     *  precompilation. Defaults to false (snapshots enabled). */
    disablePreambleSnapshot?: boolean;
    /** Enable the built-in persistent (IndexedDB) cache of fetched TeX Live assets.
     *  Silently no-ops where IndexedDB is unavailable. Defaults to false. */
    persistentCache?: boolean;
    /** Persist pdfLaTeX's document-specific preamble format in IndexedDB across
     *  compiler sessions. Requires `completionProfile.mirrorRevision`; otherwise
     *  it fails closed to the normal in-worker snapshot. Defaults to false. */
    persistentPreambleCache?: boolean;
    /** Pre-fetched TeX Live files from `warmup()`. */
    warmupCache?: WarmupCache;
    /** Which TeX engine to use. `'auto'` (default) detects the engine from the main
     *  file (a `% !TEX program` comment, or fontspec/unicode-math/CJK/lua packages),
     *  falling back to pdfLaTeX. Set an explicit engine to override detection. */
    engine?: EngineOption;
    /** Enable incremental compilation via mid-document checkpoints (#55, pdfLaTeX only):
     *  body edits after a page break re-typeset just the tail and splice it onto a cached
     *  head PDF — much faster on long documents. Needs the optional `pdf-lib` peer for
     *  splicing; falls back to a full compile when unavailable or unsafe (preamble or
     *  cross-reference changes). Defaults to false. */
    incremental?: boolean;
    /** TikZ/pgfplots figure externalization (#82). By default (`mode: 'document'`) a document
     *  that calls `\tikzexternalize` gets its figures rendered by a pool of sibling compilers
     *  and cached by the library's own MD5, so a text edit recompiles no picture — instead of
     *  today's per-figure shell-escape error and inline fallback. `mode: 'auto'` extends this to
     *  documents that load TikZ but never call `\tikzexternalize`; `mode: 'off'` disables it. */
    tikzExternalization?: TikzExternalizationOptions;
    /** Per-stage backend registry (execution-model principle 3). The default for every
     *  stage is client/local, so nothing leaves the device. Register a **server** backend
     *  for a stage — e.g. a remote BibTeX/Biber for the `bibliography` stage — to offload
     *  that stage to an endpoint running the same deterministic engine; the client-first
     *  default stays intact for any stage left unregistered. */
    backends?: BackendRegistry;
    /** Stable identity for the compile profile that produced runtime completion evidence.
     *  Bind `mirrorRevision` when the TeX Live endpoint is immutable/catalog-backed. */
    completionProfile?: {
        id: string;
        mirrorRevision: string | null;
    };
}
type FileContent = string | Uint8Array;
export declare class WasmTexCompiler {
    private engine;
    private engineKind;
    private detection;
    /** Set when the document needs an engine whose artifact is not available. */
    private unavailable;
    private bibtexEngine;
    private makeindexEngine;
    /** Incremental (checkpoint) compiler, set when `incremental` is on and the active
     *  engine is pdfLaTeX. Null otherwise (XeLaTeX/LuaLaTeX always do a full compile). */
    private incremental;
    /** Checkpoint preparation shares the one pdfTeX worker with compile(). */
    private prebuildInFlight;
    private compileInFlight;
    private fs;
    private projectIndex;
    private completionDigests;
    private mainFile;
    private assetBaseUrl;
    private opts;
    private initialized;
    /** Outputs generated by auxiliary stages. They live in the VFS so LaTeX can read
     *  them, but are derived artifacts rather than host-editable project inputs. */
    private generatedFiles;
    /** Provenance is keyed by generated output so switching main files cannot attach
     *  one root's bibliography/index request to another root's derived artifact. */
    private generatedDependencyObservations;
    /** Stages attempted in the current compile, including failures with no output. */
    private currentAuxiliaryDependencies;
    /** The last successful full result's manifest seeds only the informational input
     *  list on an incremental result; the incremental manifest remains incomplete. */
    private lastFullDependencyManifest;
    /** Union of every compile's resolver evidence since init — a preamble-snapshot compile
     *  resolves only body files, so the per-compile set alone would shrink after the first
     *  compile and a host persisting it would lose the preamble's files. */
    private sessionDependencies;
    /** Sibling compilers rendering externalized TikZ figures (#82); created on first use. */
    private tikzPool;
    /** `mode: 'auto'` switched itself off for this session after a figure job failed. */
    private tikzAutoDisabled;
    /** Why `mode: 'auto'` left the current document inline (for telemetry). */
    private tikzAutoBlocker;
    /** Sibling compiler for accessible (tagged PDF) exports (#84); created on first export so
     *  the interactive engine and its snapshot are never disturbed. */
    private exportCompiler;
    private exportSynced;
    constructor(options?: WasmTexCompilerOptions);
    /** Engine options shared by every engine kind (binary-specific bits are set
     *  by the factory). */
    private engineBaseOpts;
    /** Current main-file content as a string (for engine detection). */
    private mainSource;
    /** All project `.tex` sources (path → content), for multi-file incremental compile. */
    private projectTexFiles;
    /**
     * Ensure `this.engine` matches the engine the current main source requires.
     * On a kind change (or first call) it (re)creates and initializes the engine and
     * does a full resync. If a Unicode engine's artifact is unavailable, it records
     * `this.unavailable` instead of throwing (pdfLaTeX failures still throw).
     */
    private ensureEngine;
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    private compileIdle;
    /**
     * Build the incremental checkpoint nearest an expected edit while the compiler is idle.
     * Calling this after a successful full compile moves the one-time checkpoint build out of
     * the next interactive compile. `offset` is a UTF-16 offset in `path`; included-file paths
     * warm the checkpoint before their `\include`/`\input` command.
     *
     * Returns false when incremental mode is disabled/ineligible, project writes are pending,
     * a compile owns the worker, or the checkpoint is already warm. A compile started while a
     * preparation is running waits for it before using the worker.
     */
    prepareIncrementalCompile(path?: string, offset?: number): Promise<boolean>;
    /** Map an incremental (checkpoint) result to a CompileResult. The tail log carries this pass's
     *  diagnostics; head errors can't recur (the head is unchanged), and metadata/cross-refs are
     *  unchanged for a `final` result, so the last full compile's project index still holds. The raw
     *  `synctex` is null (the tail compiled in isolation), but `synctexData` carries the tail SyncTeX
     *  spliced onto the last full compile's head — exact for the spliced PDF (#99 P2). */
    private toCompileResult;
    setFile(path: string, content: FileContent): void;
    loadProject(files: Record<string, FileContent>): Promise<void>;
    getFile(path: string): FileContent | null;
    listFiles(): string[];
    getMainFile(): string;
    setMainFile(path: string): void;
    getProjectIndex(): ProjectIndex;
    getCompletionSnapshotState(): CompletionSnapshotState;
    readOutput(path: string): Promise<string | null>;
    flushCache(): Promise<void>;
    /**
     * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
     * active TeX Live version. No-op when the persistent cache is unavailable.
     */
    clearCache(): Promise<void>;
    dispose(): void;
    private dropGeneratedFile;
    private auxiliaryDependencyObservations;
    /** Attach the manifest only here, above every engine and auxiliary backend. The
     * engine layer alone cannot distinguish host project files from generated VFS
     * artifacts or account for server/client stage requests. */
    /** Union the TeX passes' resolver evidence into the exact prefetch manifest a host
     *  can replay through `warmup({ dependencies })` next session (#80). */
    private attachTexliveDependencies;
    private attachDependencyManifest;
    private completionProfile;
    private attachCompletionSnapshot;
    private syncAllFilesToEngine;
    /** Content the engine sees for `path`: the main file may carry the TikZ externalization
     *  switches (same line count as the project source, so SyncTeX and diagnostics line up). */
    private engineContent;
    private tikzExternalizationKind;
    /**
     * Incremental fast path (pdfLaTeX): serve a safe body edit from a checkpoint — re-typeset
     * only the tail and splice onto the cached head PDF. Only when the result is `final` (no
     * cross-reference changes); otherwise the caller falls through to a full compile, which also
     * reconciles labels and refreshes metadata. Externalized figures live in the engine FS and
     * are included by the main job; the checkpoint path compiles tails in isolation, so it is
     * skipped for them.
     */
    private tryIncrementalFastPath;
    /** Run figure jobs for `result` and, when any rendered, run the main job again so it
     *  includes them (the figure telemetry carries over to the final result). */
    /** Externalize after the first pass when switched on; otherwise record why auto left the
     *  document inline. */
    private applyTikzExternalization;
    private externalizeTikzFigures;
    /**
     * Render the figures the main job listed as missing or stale (#82). Figure jobs are ordinary
     * compiles of the same document on sibling compilers, selected through the `external`
     * library's own grab mode; see `engine/tikz-externalization.ts`. Returns null when the
     * document lists no figures.
     */
    private runTikzFigureJobs;
    /** The figure pool, loaded on first use (most documents never externalize). */
    private ensureTikzPool;
    /** The figure list the main job wrote, under whichever real job name it ran as: the
     *  preamble snapshot's, or the main file's when snapshots are off. */
    private readTikzFigureList;
    private projectFileEntries;
    /**
     * Compile the project as a tagged, PDF/UA-declared PDF (#84) on a sibling compiler: the
     * main file gets `\DocumentMetadata{lang=…, pdfstandard=ua-2, tagging=on}` in front of
     * `\documentclass` (unless it declares its own), everything else is the project as written.
     * The interactive `compile()` path is untouched. Needs the TeX Live 2026 profile (the 2025
     * kernel predates `tagging=on`); the result says so instead of failing silently.
     */
    exportAccessiblePdf(options?: AccessibleExportOptions): Promise<AccessibleExportResult>;
    /** Compile `mainSource` with the project's other files on the export sibling. */
    private compileForExport;
    /** The export compiler: same profile, plain compile (no checkpoints, no externalization —
     *  the tagging kernel wants the pictures in the document). */
    private spawnExportCompiler;
    /** A sibling compiler for figure jobs: same profile, no externalization of its own. */
    private spawnFigureCompiler;
    private syncModifiedFilesToEngine;
    private ensureEngineDirectories;
    private updateIndexForFile;
    private updateBibIndex;
    private updateMetadata;
    /** Run the auto aux stages (bibliography, then index) after a LaTeX pass. Returns whether
     *  any stage injected a new artifact this pass — if so the caller runs another LaTeX pass
     *  so the engine reads it (a `\printindex`-only document emits no rerun marker). A document
     *  is classic-BibTeX *or* biblatex (never both), so the two bibliography paths gate on
     *  mutually exclusive triggers and at most one fires. */
    private runAuxStages;
    /** @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass). */
    private maybeRunBibtex;
    /**
     * The biblatex counterpart of {@link maybeRunBibtex}. A biblatex document does **not** write
     * the classic `\bibdata{}`/`\citation{}` markers to the `.aux` (it uses `\abx@aux@cite` and a
     * `.bcf` control file), so {@link maybeRunBibtex}'s gate never fires for it. Here we route the
     * `.bcf` the first LaTeX pass emitted: when `backend=biber` and a **server** Biber backend is
     * registered, run it on `{ bcf, bibFiles }` (full fidelity); otherwise fall back to the bundled
     * biblatex-lite (cite keys parsed from the `.bcf`, entries from the project `.bib`s). Inject the
     * `.bbl` so the next pass resolves `\cite`s.
     * @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass).
     */
    private maybeRunBiblatex;
    /** Bundled biblatex-lite for the bibliography stage → `.bbl`: parse the cited keys from the
     *  `.bcf` and the entries from the project `.bib`s, then generate the documented-subset `.bbl`.
     *  The client default when no server Biber backend is registered (so a biblatex document still
     *  gets a bibliography fully on-device). */
    private runClientBiblatexLite;
    /**
     * Auto-run the index stage for `\printindex` (analogous to {@link maybeRunBibtex}): when
     * the LaTeX pass emitted a non-empty `.idx` and no `.ind` exists yet, turn it into `.ind`
     * — via a registered **server** backend for the `index` stage (makeindex/xindy), else the
     * bundled makeindex WASM (client-first, fully on-device) — and inject it so `\printindex`
     * resolves on the next pass. Gated on the source actually using `\makeindex`+`\printindex`
     * so a stale `.idx` in a reused engine can't add a phantom index.
     * @returns whether a fresh `.ind` was injected this pass (forces one more LaTeX pass).
     */
    private maybeRunMakeindex;
    /** Resolve the project-local custom `.bst` named by `\bibliographystyle` (read from the
     *  VFS), or null when the style is bundled / absent. Shared by the client + server paths. */
    private resolveProjectBst;
    /** Gather the project's `.bib` databases (path → content) for the bibliography stage. */
    private collectBibFiles;
    /** Run the bundled client BibTeX (WASM) engine for the bibliography stage → `.bbl`, or
     *  null if it produced none. The default when no server backend is registered. */
    private runClientBibtex;
    /** Shared constructor options for the bundled aux-stage engines (BibTeX, makeindex):
     *  same asset base / TeX Live version / endpoint as the main engine. */
    private auxEngineOpts;
    private ensureBibtexEngine;
    /** Run the bundled client makeindex (WASM) engine for the index stage → `.ind`, or null
     *  if it produced none. The default when no server backend is registered for `index`. */
    private runClientMakeindex;
    private ensureMakeindexEngine;
    private ensureInitialized;
}
