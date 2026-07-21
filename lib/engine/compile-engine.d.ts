import { CompileResult, EngineStatus } from '../types';
import { EngineDetection, TexEngine } from './engine-select';
import { WasmTexEngineOptions } from './wasmtex-engine';
/** The engine surface used by `WasmTex` (browser) and `WasmTexCompiler` (headless). */
export interface CompileEngine {
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    mkdir(path: string): Promise<void>;
    setMainFile(path: string): void;
    readFile(path: string): Promise<string | null>;
    flushCache(): Promise<void>;
    clearCache(): Promise<void>;
    terminate(): void;
    getStatus(): EngineStatus;
    /** Toggle the precompiled-preamble snapshot at runtime (pdfTeX only; Unicode engines
     *  don't snapshot, so they omit this). Used to disable the snapshot for `\makeindex`
     *  documents, whose preamble `\openout` can't survive a dumped format. */
    setPreambleSnapshot?(enabled: boolean): void;
    onProgress?: (progress: number) => void;
    onFileDownload?: (filename: string) => void;
}
/** Human-facing engine name. */
export declare function engineDisplayName(engine: TexEngine): string;
/** WASM binary basename for an engine. */
export declare function engineBinaryFor(engine: TexEngine): 'pdftex' | 'xetex' | 'luatex';
/**
 * Construct the engine for a detected {@link TexEngine}. The Unicode engines have
 * no prebuilt base `.fmt` and do not support the pdfTeX preamble-snapshot dump, so
 * both are disabled for them.
 */
export declare function createCompileEngine(engine: TexEngine, options?: WasmTexEngineOptions): CompileEngine;
/**
 * Build an actionable failure result for a document that needs an engine which is
 * not available in this build. The log is phrased so the compatibility classifier
 * buckets it as `needs-xelatex-lualatex`, and so the user sees a clear next step
 * instead of a downstream pdfTeX error.
 */
export declare function unavailableEngineResult(detection: EngineDetection, cause?: unknown): CompileResult;
