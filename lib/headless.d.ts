import { BackendRegistry } from './engine/backend-registry';
import { EngineOption } from './engine/engine-select';
import { ProjectIndex } from './lsp/project-index';
import { CompileResult, TexliveVersion, WarmupCache } from './types';
export type { BackendStageContract, ToolBackend, WasmTexBackendStages } from './backend-api';
export * from './backend-api';
export { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, INDEX_STAGE } from './backend-api';
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
    /** Per-stage backend registry (execution-model principle 3). The default for every
     *  stage is client/local, so nothing leaves the device. Register a **server** backend
     *  for a stage — e.g. a remote BibTeX/Biber for the `bibliography` stage — to offload
     *  that stage to an endpoint running the same deterministic engine; the client-first
     *  default stays intact for any stage left unregistered. */
    backends?: BackendRegistry;
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
    private fs;
    private projectIndex;
    private mainFile;
    private assetBaseUrl;
    private opts;
    private initialized;
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
    readOutput(path: string): Promise<string | null>;
    flushCache(): Promise<void>;
    /**
     * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
     * active TeX Live version. No-op when the persistent cache is unavailable.
     */
    clearCache(): Promise<void>;
    dispose(): void;
    private syncAllFilesToEngine;
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
