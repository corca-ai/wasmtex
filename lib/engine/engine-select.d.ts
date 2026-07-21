/**
 * Engine auto-detection.
 *
 * Decides which TeX engine a document needs — `pdflatex`, `xelatex`, or
 * `lualatex` — from a `% !TEX program` magic comment or, failing that, from
 * preamble heuristics (fontspec / unicode-math / CJK / lua packages). This is the
 * routing brain for the multi-engine pipeline: a document that uses `fontspec` or
 * `xeCJK` is detected up-front and sent to (or reported as needing) a Unicode
 * engine, instead of failing deep inside pdfTeX with a cryptic error.
 *
 * Pure and dependency-free: unit-tested, and safe to call on every keystroke.
 */
export type TexEngine = 'pdflatex' | 'xelatex' | 'lualatex';
/** Engine choice plus an override sentinel meaning "decide from the source". */
export type EngineOption = TexEngine | 'auto';
export interface EngineDetection {
    engine: TexEngine;
    /** Human-readable explanation of why this engine was chosen. */
    reason: string;
    /** True when an explicit magic comment (not a heuristic) forced the engine. */
    forced: boolean;
}
/**
 * Detect the engine a document requires. Precedence:
 *  1. `% !TEX program` magic comment (forced).
 *  2. Lua intent (`\directlua` or a lua-only package) → lualatex.
 *  3. XeTeX-only CJK (`xeCJK`, `xetexko`) → xelatex.
 *  4. Any Unicode-engine package or fontspec command → xelatex.
 *  5. Otherwise → pdflatex.
 */
export declare function detectEngine(source: string): EngineDetection;
/**
 * Resolve the engine to use given an explicit option and the document source.
 * An explicit (non-`auto`) option always wins; `auto`/undefined detects.
 */
export declare function resolveEngine(source: string, option: EngineOption | undefined): EngineDetection;
