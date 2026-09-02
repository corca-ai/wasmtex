/**
 * TikZ/pgfplots figure externalization on top of the upstream `external` library (#82).
 *
 * Nothing here patches the engine or reimplements TikZ. The document's own
 * `\tikzexternalize` is honoured exactly the way `pdflatex -shell-escape` would honour it
 * on a desktop, except that the per-figure jobs run on a pool of sibling compilers instead
 * of being spawned through `system()` (which the WASM engine has no shell for):
 *
 * 1. The **main job** runs in `mode=list and make`. The library writes `<realjob>.figlist`
 *    (every figure name), includes the figures whose PDF already exists, and keeps an
 *    MD5 of each picture's source in `<figure>.md5` (its own up-to-date check).
 * 2. For every figure whose MD5 changed (or that has no PDF yet), a **figure job** compiles
 *    the same document with the same preamble and the library's grab mode selecting just
 *    that picture — the library's `optimize` path skips every other picture. Because the
 *    preamble is identical across figures, a sibling compiler reuses its preamble snapshot
 *    for all of them, so a figure job costs about the picture alone.
 * 3. The figure PDFs are written into the main engine and the main job runs once more.
 *
 * A text-only edit therefore recompiles no picture at all, and a single-picture edit
 * recompiles just that one. Measured on a 15-figure document: 1108 ms → 137 ms warm.
 */
export type TikzExternalizationMode = 'document' | 'auto' | 'off';
export interface TikzExternalizationOptions {
    /** `'document'` (default): externalize only when the document itself calls
     *  `\tikzexternalize` (such documents otherwise fail every figure with a shell-escape
     *  error and fall back to inline typesetting). `'auto'`: additionally externalize
     *  documents that load TikZ/pgfplots but never call `\tikzexternalize`, by activating
     *  the library at the end of the preamble. `'off'`: never. */
    mode?: TikzExternalizationMode;
    /** Maximum number of sibling compilers rendering figures concurrently. Each one is a
     *  full engine worker with its own preamble snapshot. Defaults to
     *  `min(3, hardwareConcurrency - 1)`, at least 1. */
    workers?: number;
}
/** How externalization is switched on for a given main source. */
export type TikzExternalizationKind = 'document' | 'inject';
/** `\jobname` the figure jobs run under; must differ from the real job's name so the
 *  library enters figure (grab) mode. Never a file the project could own. */
export declare const FIGURE_JOBNAME = "wasmtex-figure";
/** Jobname of the pdfLaTeX preamble snapshot: `\tikzexternalize` executed inside the
 *  snapshot records it as the real job, so figure names derive from it. */
export declare const PREAMBLE_SNAPSHOT_JOBNAME = "_preamble";
/** Offset of the first uncommented `\begin{document}`, or -1. */
export declare function findBeginDocument(source: string): number;
/** True when the preamble calls `\tikzexternalize` outside a comment. */
export declare function documentExternalizes(source: string): boolean;
/** True when the preamble loads tikz or pgfplots (directly). */
export declare function loadsTikz(source: string): boolean;
/** Decide whether (and how) a main source gets externalized under `mode`. */
export declare function detectTikzExternalization(source: string, mode?: TikzExternalizationMode): TikzExternalizationKind | null;
/** Main-job source: the document as written, with the library switched to
 *  `list and make` (and, for `'inject'`, activated) on the `\begin{document}` line so
 *  no line number moves. */
export declare function mainJobSource(source: string, kind: TikzExternalizationKind): string;
/** Figure-job source for `figure`: the main-job source with the real job name pinned
 *  (so figure names match), `\jobname` redefined so the library enters grab mode
 *  (decided at `\tikzexternalize` time, inside the shared preamble), and the picture to
 *  grab selected right after `\begin{document}` (outside the preamble, so the sibling
 *  compiler's preamble snapshot is reused across figures). No line number moves. */
export declare function figureJobSource(source: string, kind: TikzExternalizationKind, realJob: string, figure: string): string;
/** Figure names listed in a `.figlist` (one per line, in document order, deduplicated). */
export declare function parseFigureList(text: string | null | undefined): string[];
/** The picture hash recorded in a `<figure>.md5` file (`\tikzexternallastkey{…}%`). */
export declare function parseFigureMd5(text: string | null | undefined): string | null;
/** Default figure-worker count: leave a core for the main engine, cap at three. */
export declare function defaultFigureWorkers(hardwareConcurrency: number | undefined): number;
/** A figure rendered by a figure job, keyed by the library's own MD5. */
export interface RenderedFigure {
    md5: string | null;
    pdf: Uint8Array;
    /** `<figure>.dpth` (baseline depth + smuggled aux data) when the library wrote one. */
    dpth: string | null;
}
export interface FigureJobRequest {
    name: string;
    md5: string | null;
}
export interface FigureJobFailure {
    name: string;
    log: string;
}
/** Minimal sibling-compiler surface the pool drives (satisfied by `WasmTexCompiler`). */
export interface FigureCompiler {
    init(): Promise<void>;
    setFile(path: string, content: string | Uint8Array): void;
    compile(): Promise<{
        success: boolean;
        pdf: Uint8Array | null;
        log: string;
    }>;
    readOutput(path: string): Promise<string | null>;
    dispose(): void;
}
export interface FigurePoolRun {
    rendered: Map<string, RenderedFigure>;
    failures: FigureJobFailure[];
    /** Wall-clock milliseconds spent rendering (all workers, overlapped). */
    elapsedMs: number;
}
/**
 * Lazily created pool of sibling compilers that render figure jobs concurrently and keep
 * the rendered figures (by name + MD5) so unchanged pictures never recompile.
 */
export declare class TikzFigurePool {
    private readonly factory;
    private readonly size;
    private readonly mainFile;
    private readonly workers;
    readonly cache: Map<string, RenderedFigure>;
    constructor(factory: () => FigureCompiler, size: number, mainFile: string);
    /** Figures whose cached render is still current for the listed MD5. */
    isCurrent(name: string, md5: string | null): boolean;
    /** Drop cached figures the document no longer lists. */
    retain(names: Iterable<string>): void;
    render(jobs: FigureJobRequest[], sourceFor: (figure: string) => string, projectFiles: () => Iterable<[string, string | Uint8Array]>): Promise<FigurePoolRun>;
    dispose(): void;
    private spawn;
    private syncProject;
}
