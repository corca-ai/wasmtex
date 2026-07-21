/**
 * Compatibility failure classifier.
 *
 * Turns a raw pdfTeX/LaTeX compile result (status + log) into a single root-cause
 * {@link FailureClass} plus the supporting evidence. It is the analytical core of
 * the compatibility harness (`scripts/compat/run.mjs`): it converts thousands of
 * opaque compile logs into a ranked, actionable backlog ("X% fail because they
 * need XeLaTeX", "Y% are missing a package", …).
 *
 * Pure and dependency-free so it can run in Node (the harness), in the browser,
 * and under Vitest. It is intentionally *not* re-exported from any library entry
 * point, so it never ships in the published bundle.
 */

/** Root-cause buckets, ordered loosely from most specific to most generic. */
export type FailureClass =
  | 'ok'
  | 'needs-xelatex-lualatex'
  | 'needs-biber'
  | 'needs-shell-escape'
  | 'image-format'
  | 'missing-package'
  | 'missing-font'
  | 'missing-file'
  | 'memory-exhausted'
  | 'undefined-control-sequence'
  | 'compile-timeout'
  | 'engine-crash'
  | 'tex-error'
  | 'unknown'

export interface ClassifyInput {
  /** Engine-reported success (pdfTeX status 0 or 1). */
  success: boolean
  /** Whether a PDF was produced (a doc can "succeed" enough to emit a PDF). */
  hasPdf: boolean
  /** Raw compile log. */
  log: string
  /** Runner-level signal: the compile exceeded the wall-clock budget. */
  timedOut?: boolean
  /** Runner-level signal: the worker died / aborted with no usable log. */
  crashed?: boolean
}

export interface ClassifyResult {
  /** The single best root-cause bucket. */
  class: FailureClass
  /** Short human-readable explanation. */
  summary: string
  /** Log fragments / tokens that triggered the classification. */
  evidence: string[]
  /** Every bucket that matched (a document can have several causes). */
  signals: FailureClass[]
  /** For missing-* buckets: the specific package/font/file names involved. */
  missing: string[]
}

interface Rule {
  class: FailureClass
  /** Returns evidence strings when the rule fires, or null when it does not. */
  match: (log: string) => string[] | null
}

/**
 * Buckets that mean "the document compiled to a PDF, but a core feature is
 * silently broken" — worth surfacing even when pdfTeX reports success.
 */
const DEGRADED_ON_SUCCESS = new Set<FailureClass>(['needs-biber', 'needs-shell-escape'])

const FONT_EXTS = /\.(otf|ttf|ttc|pfb|tfm|vf|afm)$/i
const PACKAGE_EXTS = /\.(sty|cls|def|clo|cfg|fd|ldf|cnf|dfu)$/i
const IMAGE_EXTS = /\.(eps|svg|ps|gif|bmp|tiff?|webp)$/i

/** Collect up to `limit` unique non-empty matches of `re` (group 1) in `log`. */
function collect(log: string, re: RegExp, limit = 8): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of log.matchAll(re)) {
    const value = (m[1] ?? m[0]).trim()
    if (!value || seen.has(value)) continue
    seen.add(value)
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

/** All `File `X' not found` / `I can't find file `X'` names in the log. */
function notFoundFiles(log: string): string[] {
  // Dedup across the three patterns: the same file can be reported by more than one form
  // (kernel "File ... not found" + loader "Could not open file ..."), and `missing` feeds a
  // per-document name count, so duplicates would inflate the missing-backlog tally.
  return [
    ...new Set([
      ...collect(log, /File `([^']+)' not found/g),
      ...collect(log, /I can't find file `([^']+)'/g),
      // Greedy up to the closing quote/whitespace, ending in the real extension — the path
      // may contain dots (`figures/v1.2/plot.svg`), so the capture must span them.
      ...collect(log, /Could not open (?:file|include) `?([^'\s]+\.[a-z0-9]+)/gi),
    ]),
  ]
}

const RULES: Rule[] = [
  {
    class: 'needs-xelatex-lualatex',
    match: (log) => {
      const ev = collect(
        log,
        /requires (?:either )?(?:Xe(?:La)?TeX|Lua(?:La)?TeX)(?: or (?:Xe(?:La)?TeX|Lua(?:La)?TeX))?/gi,
      )
      if (/Package (fontspec|unicode-math|xeCJK|polyglossia|fontconfig) Error/i.test(log)) {
        ev.push('Package fontspec/unicode-math/xeCJK/polyglossia Error')
      }
      if (/fontspec.*(requires|only works with).*(XeTeX|LuaTeX)/i.test(log)) {
        ev.push('fontspec requires XeTeX/LuaTeX')
      }
      return ev.length ? ev : null
    },
  },
  {
    class: 'needs-biber',
    match: (log) => {
      const ev: string[] = []
      if (/\(?re\)?run Biber|Please run Biber|run Biber on the file|biblatex.*Biber/i.test(log)) {
        ev.push('biblatex asks to run Biber')
      }
      return ev.length ? ev : null
    },
  },
  {
    class: 'needs-shell-escape',
    match: (log) => {
      const ev: string[] = []
      if (/-shell-escape|--shell-escape/i.test(log)) ev.push('document expects -shell-escape')
      if (/Package minted Error/i.test(log)) ev.push('Package minted Error')
      if (/runsystem\([^)]*\)[^\n]*disabled/i.test(log)) ev.push('runsystem(...) disabled')
      if (/shell escape is disabled|System commands are disabled/i.test(log)) {
        ev.push('shell escape disabled')
      }
      return ev.length ? ev : null
    },
  },
  {
    class: 'image-format',
    match: (log) => {
      const ev = collect(log, /Unknown graphics extension: (\.[a-z0-9]+)/gi)
      if (/Cannot determine size of graphic/i.test(log)) ev.push('Cannot determine size of graphic')
      const imgNotFound = notFoundFiles(log).filter((f) => IMAGE_EXTS.test(f))
      ev.push(...imgNotFound)
      return ev.length ? ev : null
    },
  },
  {
    class: 'memory-exhausted',
    match: (log) => {
      const ev = collect(log, /TeX capacity exceeded[^\n]*/gi)
      if (
        /out of memory|Cannot enlarge memory|memory access out of bounds|RangeError|Aborted\(OOM\)/i.test(
          log,
        )
      ) {
        ev.push('WASM out of memory')
      }
      return ev.length ? ev : null
    },
  },
  {
    class: 'missing-package',
    match: (log) => {
      const files = notFoundFiles(log).filter((f) => PACKAGE_EXTS.test(f))
      return files.length ? files : null
    },
  },
  {
    class: 'missing-font',
    match: (log) => {
      const ev: string[] = []
      if (/Metric \(TFM\) file not found|not loadable: Metric/i.test(log)) {
        ev.push('TFM metric not found')
      }
      ev.push(...collect(log, /Font [^\n]*? not (?:loadable|found)[^\n]*/gi))
      ev.push(...notFoundFiles(log).filter((f) => FONT_EXTS.test(f)))
      // NB: `kpathsea: Running mktextfm <font>` + `fork()` is NOT used as a signal — it is
      // benign noise (the real-kpse search misses MEMFS, the CDN fetch backstops it) that
      // appears on every CM/AMS document, successful or not (repro #167). A genuinely
      // unavailable font surfaces as the TeX-level "not loadable / not found" above.
      return ev.length ? ev : null
    },
  },
  {
    class: 'missing-file',
    match: (log) => {
      const files = notFoundFiles(log).filter((f) => !PACKAGE_EXTS.test(f) && !FONT_EXTS.test(f))
      return files.length ? files : null
    },
  },
  {
    class: 'undefined-control-sequence',
    match: (log) => {
      const ev = collect(log, /Undefined control sequence[^\n]*/gi, 3)
      return ev.length ? ev : null
    },
  },
  {
    class: 'tex-error',
    match: (log) => {
      // Any remaining `! ...` error line (LaTeX or TeX), first few.
      const ev = collect(log, /^! (?:LaTeX |Package |Class )?[^\n]*/gim, 3)
      return ev.length ? ev : null
    },
  },
]

const SUMMARIES: Record<FailureClass, string> = {
  ok: 'Compiled successfully',
  'needs-xelatex-lualatex': 'Requires the XeLaTeX or LuaLaTeX engine (fontspec/unicode-math/CJK)',
  'needs-biber': 'Bibliography requires Biber (not BibTeX)',
  'needs-shell-escape': 'Requires shell-escape / an external tool (e.g. minted)',
  'image-format': 'Uses an image format pdfTeX cannot embed (EPS/SVG/…)',
  'missing-package': 'A required package/class file is not on the CDN mirror',
  'missing-font': 'A required font file is not on the CDN mirror',
  'missing-file': 'A referenced file (image/input) is missing from the project',
  'memory-exhausted': 'Exhausted TeX/WASM memory',
  'undefined-control-sequence': 'Undefined control sequence (often a missing/unloaded package)',
  'compile-timeout': 'Compile exceeded the time budget',
  'engine-crash': 'The engine worker crashed or produced no log',
  'tex-error': 'A LaTeX/TeX error not attributable to a more specific cause',
  unknown: 'Failed for an unrecognized reason',
}

/**
 * Classify a compile result into a single root cause plus evidence.
 *
 * Precedence: runner signals (timeout/crash) → success → the ordered {@link RULES}
 * (most specific first). The first matching rule is the primary class; every rule
 * that matched is reported in `signals` so multi-cause documents stay visible.
 */
export function classifyCompile(input: ClassifyInput): ClassifyResult {
  if (input.timedOut) {
    return result('compile-timeout', ['wall-clock budget exceeded'], ['compile-timeout'], [])
  }
  if (input.crashed || (!input.log.trim() && !input.hasPdf)) {
    return result('engine-crash', ['no usable log / worker aborted'], ['engine-crash'], [])
  }

  const matched = runRules(input.log)
  const signals = matched.map((m) => m.class)

  // A "successful" compile can still be silently wrong: biblatex emits a PDF with
  // unresolved citations and asks to run Biber; minted emits a PDF with un-highlighted
  // (or dropped) code because shell-escape was refused. Surface these "degraded
  // success" cases rather than hiding them behind a green checkmark. Other rules only
  // matter on an actual failure — pdfTeX recovers from many warnings, and flagging
  // every stray missing figure as a failure would be far too noisy.
  if (input.success && input.hasPdf) {
    const degraded = matched.find((m) => DEGRADED_ON_SUCCESS.has(m.class))
    if (degraded) return result(degraded.class, degraded.evidence, ['ok', ...signals], [])
    return result('ok', [], ['ok', ...signals], [])
  }

  const primary = matched[0]
  if (!primary) {
    // Produced no PDF and matched nothing recognizable.
    const cls: FailureClass = input.hasPdf ? 'ok' : 'unknown'
    return result(cls, [], [cls], [])
  }

  const missing = isMissingClass(primary.class) ? primary.evidence.slice() : []
  return result(primary.class, primary.evidence, signals, missing)
}

/** Run every rule against the log, preserving RULES (most-specific-first) order. */
function runRules(log: string): Array<{ class: FailureClass; evidence: string[] }> {
  const matched: Array<{ class: FailureClass; evidence: string[] }> = []
  for (const rule of RULES) {
    const evidence = rule.match(log)
    if (evidence && evidence.length > 0) matched.push({ class: rule.class, evidence })
  }
  return matched
}

function isMissingClass(c: FailureClass): boolean {
  return c === 'missing-package' || c === 'missing-font' || c === 'missing-file'
}

function result(
  cls: FailureClass,
  evidence: string[],
  signals: FailureClass[],
  missing: string[],
): ClassifyResult {
  return { class: cls, summary: SUMMARIES[cls], evidence, signals, missing }
}

/** Stable ordering for report rendering (most actionable first). */
export const FAILURE_CLASS_ORDER: FailureClass[] = [
  'ok',
  'needs-xelatex-lualatex',
  'needs-biber',
  'needs-shell-escape',
  'image-format',
  'missing-package',
  'missing-font',
  'missing-file',
  'memory-exhausted',
  'undefined-control-sequence',
  'tex-error',
  'compile-timeout',
  'engine-crash',
  'unknown',
]
