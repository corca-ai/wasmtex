/**
 * Pure helpers for choosing where to place a mid-document checkpoint (#55).
 *
 * A checkpoint may only sit at an EXISTING page break (`\clearpage` / `\newpage` /
 * `\cleardoublepage`): those are the points where dumping mid-document keeps the head's
 * pagination byte-identical to a full compile. (Dumping mid-page would force a spurious
 * page break.) On an edit we reuse the latest such boundary that lies before the first
 * changed character — so the head text is provably unchanged and its checkpoint valid.
 */

// `\include{X}` is a page break too: it forces `\clearpage` before and after the file,
// so a checkpoint can sit at an include boundary (the basis for multi-file incremental).
const PAGE_BREAK_RE = /\\(?:clearpage|cleardoublepage|newpage)\b|\\include\{[^}]*\}/g

/** Byte offsets just AFTER each explicit page-break command (so the head includes the
 *  command and thus ships its pages). Matches inside `%` comments are skipped. */
export function findPageBreaks(source: string): number[] {
  const out: number[] = []
  for (const m of source.matchAll(PAGE_BREAK_RE)) {
    const idx = m.index
    const lineStart = source.lastIndexOf('\n', idx - 1) + 1
    if (hasUnescapedPercent(source.slice(lineStart, idx))) continue // commented out
    out.push(idx + m[0].length)
  }
  return out
}

const INCLUDE_RE = /\\(?:include|input|subfile)\{([^}]+)\}/g

/** Map each `\include`/`\input`/`\subfile` target name (without `.tex`) to the byte
 *  offset of its command in `source` — first occurrence wins. Used to translate "which
 *  included file changed" into an edit position for boundary selection. */
export function includePositions(source: string): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of source.matchAll(INCLUDE_RE)) {
    const idx = m.index
    const lineStart = source.lastIndexOf('\n', idx - 1) + 1
    if (hasUnescapedPercent(source.slice(lineStart, idx))) continue
    const name = m[1]!.trim().replace(/\.tex$/, '')
    if (!out.has(name)) out.set(name, idx)
  }
  return out
}

/** True if `line` contains a real comment `%` — one not escaped as `\%` (an even run
 *  of preceding backslashes leaves the `%` active). */
function hasUnescapedPercent(line: string): boolean {
  for (let i = 0; i < line.length; i++) {
    if (line[i] !== '%') continue
    let backslashes = 0
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) backslashes++
    if (backslashes % 2 === 0) return true
  }
  return false
}

/** First index at which `a` and `b` differ; if one is a prefix of the other, the
 *  shorter length. Equal strings return their length. */
export function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a.charCodeAt(i) === b.charCodeAt(i)) i++
  return i
}

/**
 * Pick the best checkpoint boundary for an edit: the latest page break at or before
 * `editOffset`, but no earlier than `minHead` bytes in (too-early checkpoints save
 * little). Returns null when no boundary qualifies (→ caller does a full compile).
 */
export function chooseBoundary(
  boundaries: number[],
  editOffset: number,
  minHead = 0,
): number | null {
  let best: number | null = null
  for (const b of boundaries) {
    if (b <= editOffset && b >= minHead) {
      if (best === null || b > best) best = b
    }
  }
  return best
}

/** Split `source` at `offset` into the checkpoint head (ending at the page break) and
 *  the tail to typeset from the checkpoint. */
export function splitAtBoundary(
  source: string,
  offset: number,
): { headText: string; tailText: string } {
  return { headText: source.slice(0, offset), tailText: source.slice(offset) }
}

/** djb2 hash (base-36), matching the worker's preamble-hash, for keying checkpoints
 *  by head content. */
export function hashString(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}
