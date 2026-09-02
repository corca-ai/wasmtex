/**
 * Sibling-compiler pool that renders TikZ figure jobs (#82). Kept in its own module so the
 * headless compiler can load it on first use only — most documents never externalize.
 */
/** A figure rendered by a figure job, keyed by the library's own MD5. */
export interface RenderedFigure {
    md5: string | null;
    pdf: Uint8Array;
    /** `<figure>.dpth` (baseline depth + smuggled aux data) when the library wrote one. */
    dpth: string | null;
    /** The figure job's log: a picture error does not fail the job (TeX keeps going and
     *  still ships the page), so its diagnostics live only here. */
    log: string;
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
    /** Release the engine workers (not the rendered figures) after this much idle time. */
    private readonly idleMs;
    private readonly workers;
    readonly cache: Map<string, RenderedFigure>;
    private idleTimer;
    constructor(factory: () => FigureCompiler, size: number, mainFile: string, 
    /** Release the engine workers (not the rendered figures) after this much idle time. */
    idleMs?: number);
    /** Number of live engine workers (for tests and telemetry). */
    get liveWorkers(): number;
    /** Terminate idle engine workers; rendered figures stay cached. */
    releaseWorkers(): void;
    private scheduleRelease;
    /** Figures whose cached render is still current for the listed MD5. */
    isCurrent(name: string, md5: string | null): boolean;
    /** Drop cached figures the document no longer lists. */
    retain(names: Iterable<string>): void;
    render(jobs: FigureJobRequest[], sourceFor: (figure: string) => string, projectFiles: () => Iterable<[string, string | Uint8Array]>): Promise<FigurePoolRun>;
    dispose(): void;
    private spawn;
    private syncProject;
}
