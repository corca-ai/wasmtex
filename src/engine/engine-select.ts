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

export type TexEngine = 'pdflatex' | 'xelatex' | 'lualatex'

/** Engine choice plus an override sentinel meaning "decide from the source". */
export type EngineOption = TexEngine | 'auto'

export interface EngineDetection {
  engine: TexEngine
  /** Human-readable explanation of why this engine was chosen. */
  reason: string
  /** True when an explicit magic comment (not a heuristic) forced the engine. */
  forced: boolean
}

/** `% !TEX program = xelatex`, `%!TEX TS-program=lualatex`, `% !TEX engine = xetex`. */
const MAGIC_RE = /%\s*!\s*(?:TEX\s+)?(?:TS-)?(?:program|engine)\s*=\s*([A-Za-z]+)/i

/** Lua-only / lua-intent packages and primitives → lualatex. */
const LUA_PACKAGES = new Set([
  'luacode',
  'luatextra',
  'luatexbase',
  'luatex85',
  'luaotfload',
  'lua-ul',
  'luamplib',
  'luacolor',
  'luatexja',
  'luatexja-fontspec',
  'luatexja-preset',
])

/** CJK packages that require XeTeX specifically → xelatex. */
const XETEX_CJK_PACKAGES = new Set(['xeCJK', 'xetexko', 'xecjk'])

/** Packages that require *a* Unicode engine (XeTeX or LuaTeX). Default xelatex. */
const UNICODE_PACKAGES = new Set([
  'fontspec',
  'unicode-math',
  'xltxtra',
  'xunicode',
  'polyglossia',
  'mathspec',
])

/** Map a program/engine name (from a magic comment) to a TexEngine, or null. */
function normalizeEngineName(raw: string): TexEngine | null {
  const v = raw.toLowerCase()
  if (v === 'xelatex' || v === 'xetex') return 'xelatex'
  if (v === 'lualatex' || v === 'luatex' || v === 'dvilualatex') return 'lualatex'
  if (v === 'pdflatex' || v === 'latex' || v === 'pdftex' || v === 'pdf') return 'pdflatex'
  return null
}

/** Strip LaTeX line comments (a `%` not escaped as `\%`), keeping the prefix char.
 *  A `%` is a comment when preceded by an EVEN backslash run (`\\%` is an escaped
 *  backslash then a comment); only an odd run (`\%`) is a literal percent. Mirrors the
 *  canonical `stripTexComments` — a single-char lookbehind would miss the `\\%` case. */
function stripComments(text: string): string {
  return text.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, '$1$2')
}

/**
 * The preamble used for heuristics: everything before `\begin{document}` (capped,
 * else an 8 KB head), with comments removed so a commented-out `\directlua` or
 * `\usepackage{fontspec}` does not trigger an engine switch.
 */
function preambleOf(source: string): string {
  const idx = source.indexOf('\\begin{document}')
  const head = idx >= 0 ? source.slice(0, idx) : source.slice(0, 8192)
  return stripComments(head)
}

/** Names of all `\usepackage`/`\RequirePackage` arguments in `preamble`. */
function loadedPackages(preamble: string): Set<string> {
  const set = new Set<string>()
  const re = /\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g
  for (const m of preamble.matchAll(re)) {
    for (const name of (m[1] ?? '').split(',')) {
      const n = name.trim()
      if (n) set.add(n)
    }
  }
  return set
}

/** First package in `wanted` that appears in `pkgs`, or null. */
function firstMatch(pkgs: Set<string>, wanted: Set<string>): string | null {
  for (const p of pkgs) if (wanted.has(p)) return p
  return null
}

const FONTSPEC_COMMAND_RE = /\\(?:setmainfont|setsansfont|setmonofont|newfontface|fontspec)\b/

/**
 * Detect the engine a document requires. Precedence:
 *  1. `% !TEX program` magic comment (forced).
 *  2. Lua intent (`\directlua` or a lua-only package) → lualatex.
 *  3. XeTeX-only CJK (`xeCJK`, `xetexko`) → xelatex.
 *  4. Any Unicode-engine package or fontspec command → xelatex.
 *  5. Otherwise → pdflatex.
 */
export function detectEngine(source: string): EngineDetection {
  const magic = source.slice(0, 2048).match(MAGIC_RE)
  if (magic) {
    const engine = normalizeEngineName(magic[1] ?? '')
    if (engine) {
      return { engine, reason: `magic comment "% !TEX program = ${magic[1]}"`, forced: true }
    }
  }

  const preamble = preambleOf(source)
  const pkgs = loadedPackages(preamble)

  if (/\\directlua\b/.test(preamble)) {
    return { engine: 'lualatex', reason: '\\directlua requires LuaTeX', forced: false }
  }
  const luaPkg = firstMatch(pkgs, LUA_PACKAGES)
  if (luaPkg) {
    return { engine: 'lualatex', reason: `package "${luaPkg}" requires LuaTeX`, forced: false }
  }

  const cjkPkg = firstMatch(pkgs, XETEX_CJK_PACKAGES)
  if (cjkPkg) {
    return { engine: 'xelatex', reason: `package "${cjkPkg}" requires XeTeX`, forced: false }
  }

  const uniPkg = firstMatch(pkgs, UNICODE_PACKAGES)
  if (uniPkg) {
    return {
      engine: 'xelatex',
      reason: `package "${uniPkg}" requires a Unicode engine (XeTeX/LuaTeX)`,
      forced: false,
    }
  }
  if (FONTSPEC_COMMAND_RE.test(preamble)) {
    return {
      engine: 'xelatex',
      reason: 'fontspec font command requires a Unicode engine',
      forced: false,
    }
  }

  return { engine: 'pdflatex', reason: 'no Unicode-engine requirement detected', forced: false }
}

/**
 * Resolve the engine to use given an explicit option and the document source.
 * An explicit (non-`auto`) option always wins; `auto`/undefined detects.
 */
export function resolveEngine(source: string, option: EngineOption | undefined): EngineDetection {
  if (option && option !== 'auto') {
    return { engine: option, reason: `engine forced to ${option} by configuration`, forced: true }
  }
  return detectEngine(source)
}
