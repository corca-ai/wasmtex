import type { Diagnostic, DiagnosticCode, FontGlyphGap, TexError } from '../types'

const FILE_EXT_RE = /\.(tex|sty|cls|aux|fd|def|cfg|clo|bbl|bst|ltx|dtx|ldf|map|enc|tfm|fmt)$/

/** Check if a string extracted after '(' looks like a file path */
function looksLikeFile(s: string): boolean {
  if (s.startsWith('./') || s.startsWith('/')) return true
  return FILE_EXT_RE.test(s)
}

/** Normalize a pdfTeX log path to a project-relative path. Classify origin from the RAW
 *  path BEFORE touching `/./`: only the project prefixes (`./`, `/work/`) are stripped;
 *  any other absolute path stays absolute (so a system file with an internal `/./`, e.g.
 *  `…/texmf-dist/./tex/…`, is NOT truncated to a project-relative-looking tail and
 *  mis-attributed). Internal `/./` segments are collapsed in place either way. Mirrors the
 *  origin ordering in dependency-graph.ts which consumes the same raw paths. */
function normalizePath(p: string): string {
  if (p.startsWith('./')) return p.slice(2).replace(/\/\.\//g, '/')
  if (p.startsWith('/work/'))
    return p
      .slice(6)
      .replace(/\/\.\//g, '/')
      .replace(/^\.\//, '') // `/work/./main.tex` → `main.tex`
  return p.replace(/\/\.\//g, '/')
}

/** If position i in `line` begins a file-open `(path`, return the path (raw + project-
 *  normalized) and the chars consumed; else null. */
function matchFileOpen(
  line: string,
  i: number,
): { raw: string; path: string; consumed: number } | null {
  const rest = line.slice(i + 1)
  const m = rest.match(/^([^()\s]+)/)
  if (m && looksLikeFile(m[1]!)) {
    return { raw: m[1]!, path: normalizePath(m[1]!), consumed: 1 + m[1]!.length }
  }
  return null
}

/** A structured event from the log's parenthesized file open/close markers
 *  (`(./file.tex … )`). `eol` marks the end of source line `lineIndex`. The single
 *  source of truth for the paren scanner — {@link buildFileContext} and the
 *  dependency-graph builder both consume it. */
export type FileScanEvent =
  | { type: 'open'; path: string; raw: string }
  | { type: 'close' }
  | { type: 'eol'; lineIndex: number }

/** Scan pdfTeX/XeTeX log lines into ordered file open/close events, handling the
 *  non-file parentheses (via a skip depth) exactly as the engine nests them. */
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: paren-matching scanner has inherent nesting
export function scanFileEvents(lines: string[]): FileScanEvent[] {
  const events: FileScanEvent[] = []
  let skipDepth = 0
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]!
    let i = 0
    while (i < line.length) {
      if (line[i] === '(') {
        const open = matchFileOpen(line, i)
        if (open) {
          events.push({ type: 'open', path: open.path, raw: open.raw })
          i += open.consumed
          continue
        }
        skipDepth++
      } else if (line[i] === ')') {
        if (skipDepth > 0) skipDepth--
        else events.push({ type: 'close' })
      }
      i++
    }
    events.push({ type: 'eol', lineIndex: li })
  }
  return events
}

/**
 * Build an array mapping each log line to the current file from pdfTeX's
 * parenthesized file open/close markers: `(./file.tex ... )`
 */
export function buildFileContext(lines: string[]): string[] {
  const stack: string[] = []
  const fileAtLine: string[] = []
  for (const ev of scanFileEvents(lines)) {
    if (ev.type === 'open') stack.push(ev.path)
    else if (ev.type === 'close') {
      if (stack.length > 0) stack.pop()
    } else fileAtLine[ev.lineIndex] = stack.length > 0 ? stack[stack.length - 1]! : ''
  }
  return fileAtLine
}

/** Search up to 5 lines ahead for "l.42 ..." pattern */
function findLineNumber(lines: string[], start: number): number {
  const end = Math.min(start + 5, lines.length)
  for (let j = start; j < end; j++) {
    const m = lines[j]!.match(/^l\.(\d+)\s/)
    if (m) return parseInt(m[1]!, 10)
  }
  return 0
}

/** Extract line number from "at lines? N" on current or next line */
function findBoxLineNumber(line: string, nextLine: string): number {
  const m = line.match(/at lines? (\d+)/) ?? nextLine.match(/at lines? (\d+)/)
  return m ? parseInt(m[1]!, 10) : 0
}

/** Extract "on input line N" from a log line, or 0 */
function extractInputLine(line: string): number {
  const m = line.match(/on input line (\d+)/)
  return m ? parseInt(m[1]!, 10) : 0
}

/** A missing `.sty`/`.cls` — almost always a package/class absent from the
 *  bundled TeX Live mirror (or a misspelled name), not a generic document error. */
const MISSING_PACKAGE_RE = /File `([^']+\.(?:sty|cls))' not found/

/** Tag a "File `X.sty' not found" error with an actionable message + a
 *  `missing-package` code so a host can distinguish a mirror gap from a user error. */
function annotateMissingPackage(err: TexError): void {
  const m = err.message.match(MISSING_PACKAGE_RE)
  if (!m) return
  const file = m[1]!
  const kind = file.endsWith('.cls') ? 'class' : 'package'
  const name = file.replace(/\.(?:sty|cls)$/, '')
  err.code = 'missing-package'
  err.message = `${err.message} — ${kind} \`${name}\` is not on the bundled TeX Live mirror (or the name is misspelled).`
}

/** fontspec's "font cannot be found" is reported as a bare `! Package fontspec
 *  Error:` line followed by an indented `(fontspec) The font "X" cannot be found`.
 *  Catch it and give actionable guidance — the silent footgun here is LuaLaTeX,
 *  where a *human* font name doesn't resolve (no luaotfload names DB under the
 *  on-demand WASM model) and fontspec falls back to Computer Modern. By filename
 *  (e.g. `lmroman10-regular.otf`) works; XeLaTeX resolves by name. */
function annotateFontNotFound(err: TexError, lines: string[], i: number): void {
  if (!/^Package fontspec Error:/.test(err.message)) return
  const FONT_RE = /The font "([^"]+)" cannot be found/
  // The font name may be on the same line or on a following `(fontspec) …` line.
  let m = err.message.match(FONT_RE)
  for (let j = i + 1; !m && j < Math.min(i + 8, lines.length); j++) {
    m = lines[j]!.match(FONT_RE)
  }
  if (!m) return
  const font = m[1]!
  err.code = 'font-not-found'
  err.message =
    `Font "${font}" could not be found — check the name and that the font is on the bundled ` +
    'mirror. In LuaLaTeX, reference fonts by filename (e.g. `lmroman10-regular.otf`) or use XeLaTeX.'
}

function tryTexError(line: string, lines: string[], i: number, out: TexError[]): boolean {
  const m = line.match(/^! (.+)/)
  if (!m) return false
  const err: TexError = { line: findLineNumber(lines, i + 1), message: m[1]!, severity: 'error' }
  annotateMissingPackage(err)
  annotateFontNotFound(err, lines, i)
  out.push(err)
  return true
}

function tryLatexWarning(line: string, out: TexError[]): boolean {
  const m = line.match(/LaTeX Warning:\s*(.+)/)
  if (!m) return false
  out.push({ line: extractInputLine(line), message: m[1]!, severity: 'warning' })
  return true
}

function tryPackageError(line: string, lines: string[], i: number, out: TexError[]): boolean {
  const m = line.match(/^Package (\S+) Error:\s*(.+)/)
  if (!m) return false
  const lineNum = extractInputLine(line) || findLineNumber(lines, i + 1)
  out.push({ line: lineNum, message: `[${m[1]}] ${m[2]}`, severity: 'error' })
  return true
}

function tryPackageWarning(line: string, out: TexError[]): boolean {
  const m = line.match(/^Package (\S+) Warning:\s*(.+)/)
  if (!m) return false
  // Drop epstopdf's load-time "Shell escape feature is not enabled" warning: it fires on
  // every acmart/graphicx document that sets up on-the-fly EPS→PDF conversion, but shell
  // escape is *structurally* unavailable in the WASM engine (no OS shell), so the warning
  // is a tautology carrying no actionable signal. Consumers that surface package warnings
  // read it as a false "needs shell-escape". A genuine EPS insertion still fails visibly
  // via the image-format path ("Cannot determine size of graphic"). Scoped to epstopdf so
  // minted's real `-shell-escape` demand keeps surfacing. (#169)
  if (m[1] === 'epstopdf' && /shell escape feature is not enabled/i.test(m[2]!)) return true
  out.push({ line: extractInputLine(line), message: `[${m[1]}] ${m[2]}`, severity: 'warning' })
  return true
}

function tryBoxWarning(line: string, nextLine: string, out: TexError[]): boolean {
  if (!/^Overfull \\[hv]box .+/.test(line)) return false
  out.push({ line: findBoxLineNumber(line, nextLine), message: line, severity: 'warning' })
  return true
}

export function parseTexErrors(log: string): TexError[] {
  const errors: TexError[] = []
  const lines = log.split('\n')
  const fileContext = buildFileContext(lines)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const prevLen = errors.length
    if (tryTexError(line, lines, i, errors)) {
      // matched
    } else if (tryLatexWarning(line, errors)) {
      // matched
    } else if (tryPackageError(line, lines, i, errors)) {
      // matched
    } else if (tryPackageWarning(line, errors)) {
      // matched
    } else {
      tryBoxWarning(line, lines[i + 1] ?? '', errors)
    }
    // Set file on any newly added errors
    const file = fileContext[i]
    if (file) {
      for (let j = prevLen; j < errors.length; j++) {
        errors[j]!.file = file
      }
    }
  }

  // A font with no glyph for characters the document uses still compiles "ok" but
  // renders blank .notdef boxes — invisible unless surfaced. Emit one summary
  // warning per font (the full per-character detail lives in glyphCoverage). #89
  errors.push(...glyphGapWarnings(log))

  return errors
}

/** One summary `missing-glyph` warning per font with absent glyphs (#89). */
function glyphGapWarnings(log: string): TexError[] {
  return parseGlyphGaps(log).map((gap) => {
    const scriptWord = gap.script ? `${gap.script} ` : ''
    return {
      line: 0,
      message:
        `Font [${gap.font}] has no glyph for ${gap.codepoints.length} ${scriptWord}` +
        `character(s) used in the document (e.g. ${gap.sample}); they render as blank boxes.`,
      severity: 'warning' as const,
      code: 'missing-glyph',
    }
  })
}

// XeTeX: "Missing character: There is no 안 (U+C548) in font [HaranoAjiMincho-Regular.otf]!"
// pdfTeX/LuaTeX omit the "(U+XXXX)" and may not bracket the font.
const MISSING_CHAR_RE =
  /^Missing character: There is no (.+?)(?: \(U\+([0-9A-Fa-f]+)\))? in font (.+?)!?\s*$/

const PROBE_SCRIPTS = [
  'Hangul',
  'Hiragana',
  'Katakana',
  'Han',
  'Cyrillic',
  'Greek',
  'Arabic',
  'Hebrew',
  'Thai',
  'Devanagari',
  'Latin',
]

/** Dominant Unicode script of a set of codepoints (best-effort; undefined if none match). */
function detectScript(codepoints: number[]): string | undefined {
  const counts = new Map<string, number>()
  for (const cp of codepoints) {
    const ch = String.fromCodePoint(cp)
    for (const s of PROBE_SCRIPTS) {
      let re: RegExp
      try {
        re = new RegExp(`\\p{Script=${s}}`, 'u')
      } catch {
        continue
      }
      if (re.test(ch)) {
        counts.set(s, (counts.get(s) ?? 0) + 1)
        break
      }
    }
  }
  let best: string | undefined
  let bestN = 0
  for (const [s, n] of counts) {
    if (n > bestN) {
      best = s
      bestN = n
    }
  }
  return best
}

/** Parse one `Missing character:` line → {font, codepoint}, or null if it isn't one
 *  or the codepoint is outside the Unicode range (a malformed `U+110000` would pass
 *  isFinite but throw RangeError in String.fromCodePoint downstream). */
/** Decode the char text pdfTeX/LuaTeX print for a missing glyph when there is no `(U+XXXX)`.
 *  pdfTeX renders an unprintable byte in `^^` notation rather than the literal char:
 *  `^^` + two lowercase hex digits for bytes > 0x7F (e.g. `^^c0` → U+00C0), or `^^` + a
 *  single char for control codes (< 0x20 and 0x7F), decoded as char XOR 0x40 (`^^I` → tab).
 *  Anything else is a real printable char, read directly. */
function decodeMissingChar(text: string): number {
  const hex = /^\^\^([0-9a-f]{2})$/.exec(text)
  if (hex) return parseInt(hex[1]!, 16)
  const ctrl = /^\^\^([\s\S])$/.exec(text)
  if (ctrl) return ctrl[1]!.charCodeAt(0) ^ 0x40
  return text.codePointAt(0) ?? NaN
}

function parseMissingCharLine(line: string): { font: string; cp: number } | null {
  const m = line.match(MISSING_CHAR_RE)
  if (!m) return null
  const cp = m[2] ? parseInt(m[2], 16) : m[1] != null ? decodeMissingChar(m[1]) : NaN
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10ffff) return null
  return { font: m[3]!.replace(/^\[/, '').replace(/\]$/, ''), cp }
}

/**
 * Every `Missing character:` occurrence in document order (NOT deduped), each as
 * {font, codepoint}. The order matches the `.notdef` boxes in the XDV, so the two can
 * be zipped to attach output positions (#89 L2b).
 */
export function parseGlyphOccurrences(log: string): { font: string; codepoint: number }[] {
  const out: { font: string; codepoint: number }[] = []
  for (const line of log.split('\n')) {
    const hit = parseMissingCharLine(line)
    if (hit) out.push({ font: hit.font, codepoint: hit.cp })
  }
  return out
}

/**
 * Per-font missing-glyph report from `Missing character:` log lines. These mean the
 * font lacks a glyph for a character the document uses, so it renders as a blank
 * .notdef box even though the compile succeeds (#89). Headless: data only.
 */
export function parseGlyphGaps(log: string): FontGlyphGap[] {
  const byFont = new Map<string, { cps: number[]; seen: Set<number>; count: number }>()
  for (const { font, codepoint } of parseGlyphOccurrences(log)) {
    let e = byFont.get(font)
    if (!e) {
      e = { cps: [], seen: new Set(), count: 0 }
      byFont.set(font, e)
    }
    e.count++
    if (!e.seen.has(codepoint)) {
      e.seen.add(codepoint)
      e.cps.push(codepoint)
    }
  }
  const gaps: FontGlyphGap[] = []
  for (const [font, e] of byFont) {
    const codepoints = e.cps.slice().sort((a, b) => a - b)
    const gap: FontGlyphGap = {
      font,
      codepoints,
      count: e.count,
      sample: codepoints
        .slice(0, 8)
        .map((c) => String.fromCodePoint(c))
        .join(''),
    }
    const script = detectScript(codepoints)
    if (script) gap.script = script
    gaps.push(gap)
  }
  return gaps
}

/** Classify a parsed TeX error/warning into a stable Diagnostic code (#54). */
function classify(err: TexError): DiagnosticCode {
  if (err.code === 'missing-package') return 'missing-package'
  if (err.code === 'font-not-found') return 'font-not-found'
  const m = err.message
  if (/Reference `[^']*'.*undefined/i.test(m)) return 'undefined-reference'
  if (/Citation `[^']*'.*undefined/i.test(m)) return 'undefined-citation'
  if (/Rerun|Label\(s\) may have changed/i.test(m)) return 'rerun-needed'
  if (/^Overfull /.test(m)) return 'overfull-box'
  // `! Package X Error:` reaches here via tryTexError with the raw message (the
  // bracketed `[X]` form below only comes from the no-`!` tryPackageError path).
  if (/^Package \S+ Error:/.test(m)) return 'package-error'
  if (/^Package \S+ Warning:/.test(m)) return 'package-warning'
  if (/^\[[^\]]+] /.test(m)) return err.severity === 'error' ? 'package-error' : 'package-warning'
  return err.severity === 'error' ? 'tex-error' : 'latex-warning'
}

/** Convert a coded TexError into a Diagnostic (rerun-needed is informational). */
function toDiagnostic(err: TexError): Diagnostic {
  const code = classify(err)
  const d: Diagnostic = {
    code,
    severity: code === 'rerun-needed' ? 'info' : err.severity,
    message: err.message,
  }
  if (err.file) d.file = err.file
  if (err.line) d.line = err.line
  return d
}

/**
 * Unified, machine-readable diagnostics for a compile (#54). The evolving superset of
 * parseTexErrors + parseGlyphGaps: every entry carries a stable `code` a host can
 * branch on. Missing-glyph entries carry the structured FontGlyphGap in `glyph`.
 */
export function buildDiagnostics(
  log: string,
  gaps: FontGlyphGap[] = parseGlyphGaps(log),
): Diagnostic[] {
  const out: Diagnostic[] = []
  for (const err of parseTexErrors(log)) {
    // The per-font missing-glyph summary warnings are re-emitted below WITH structured
    // data, so drop the plain ones here to avoid duplicates.
    if (err.code !== 'missing-glyph') out.push(toDiagnostic(err))
  }
  // `gaps` are the result's own (enriched) gaps — the diagnostic's `glyph` is the same
  // object, so suggestions/occurrences added later stay in sync.
  for (const gap of gaps) {
    const scriptWord = gap.script ? `${gap.script} ` : ''
    out.push({
      code: 'missing-glyph',
      severity: 'warning',
      message: `Font [${gap.font}] has no glyph for ${gap.codepoints.length} ${scriptWord}character(s) (e.g. ${gap.sample}); they render as blank boxes.`,
      glyph: gap,
    })
  }
  return out
}
