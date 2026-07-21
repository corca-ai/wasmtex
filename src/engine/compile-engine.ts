/**
 * The compile-engine abstraction: a small interface every TeX engine implements,
 * plus a factory that maps a detected {@link TexEngine} to a concrete engine.
 *
 * pdfTeX is the default, fully-shipped engine. XeLaTeX/LuaLaTeX load the
 * corresponding Unicode engine workers.
 * Until a given WASM artifact is built and deployed, routing a document to it
 * fails to init; callers turn that into the actionable {@link unavailableEngineResult}
 * ("this document requires XeLaTeX …") rather than a cryptic pdfTeX error.
 */
import type { CompileResult, EngineStatus } from '../types'
import type { EngineDetection, TexEngine } from './engine-select'
import { WasmTexLuatexEngine } from './luatex-engine'
import { type WasmTexEngineOptions, WasmTexPdftexEngine } from './wasmtex-engine'
import { WasmTexXetexEngine } from './xetex-engine'

/** The engine surface used by `WasmTex` (browser) and `WasmTexCompiler` (headless). */
export interface CompileEngine {
  init(): Promise<void>
  compile(): Promise<CompileResult>
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  mkdir(path: string): Promise<void>
  setMainFile(path: string): void
  readFile(path: string): Promise<string | null>
  flushCache(): Promise<void>
  clearCache(): Promise<void>
  terminate(): void
  getStatus(): EngineStatus
  /** Toggle the precompiled-preamble snapshot at runtime (pdfTeX only; Unicode engines
   *  don't snapshot, so they omit this). Used to disable the snapshot for `\makeindex`
   *  documents, whose preamble `\openout` can't survive a dumped format. */
  setPreambleSnapshot?(enabled: boolean): void
  onProgress?: (progress: number) => void
  onFileDownload?: (filename: string) => void
}

/** Human-facing engine name. */
export function engineDisplayName(engine: TexEngine): string {
  if (engine === 'xelatex') return 'XeLaTeX'
  if (engine === 'lualatex') return 'LuaLaTeX'
  return 'pdfLaTeX'
}

/** WASM binary basename for an engine. */
export function engineBinaryFor(engine: TexEngine): 'pdftex' | 'xetex' | 'luatex' {
  if (engine === 'xelatex') return 'xetex'
  if (engine === 'lualatex') return 'luatex'
  return 'pdftex'
}

/**
 * Construct the engine for a detected {@link TexEngine}. The Unicode engines have
 * no prebuilt base `.fmt` and do not support the pdfTeX preamble-snapshot dump, so
 * both are disabled for them.
 */
export function createCompileEngine(
  engine: TexEngine,
  options: WasmTexEngineOptions = {},
): CompileEngine {
  // XeLaTeX is a two-worker pipeline (xetex -> XDV -> dvipdfmx -> PDF).
  if (engine === 'xelatex') return new WasmTexXetexEngine(options)
  // LuaLaTeX emits PDF directly (single worker). Its artifact may not be deployed
  // yet, in which case init fails into the actionable "unavailable" path.
  if (engine === 'lualatex') return new WasmTexLuatexEngine(options)
  return new WasmTexPdftexEngine(options)
}

/**
 * Build an actionable failure result for a document that needs an engine which is
 * not available in this build. The log is phrased so the compatibility classifier
 * buckets it as `needs-xelatex-lualatex`, and so the user sees a clear next step
 * instead of a downstream pdfTeX error.
 */
export function unavailableEngineResult(
  detection: EngineDetection,
  cause?: unknown,
): CompileResult {
  const name = engineDisplayName(detection.engine)
  const detail = cause instanceof Error ? ` (${cause.message})` : ''
  const log = [
    `! WasmTex engine error: this document requires ${name} (${detection.reason}).`,
    `The ${name} engine is not available in this build${detail}.`,
    'Install the Unicode engine artifact, or change the document to compile with pdfLaTeX.',
    'See docs/engine.md (Multi-engine support).',
  ].join('\n')
  return {
    success: false,
    pdf: null,
    log,
    errors: [
      {
        line: 0,
        severity: 'error',
        message: `Document requires ${name}, which is not available in this build.`,
      },
    ],
    compileTime: 0,
    synctex: null,
  }
}
