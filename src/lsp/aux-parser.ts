import type { AuxData } from './types'

/** Unwrap a single fully-enclosing brace layer: `{knuth84}` → `knuth84`, `2.3` → `2.3`. */
function unwrapBraces(s: string): string {
  const inner = readGroup(s, 0)
  return inner && inner.end === s.length ? inner.content : s
}

/** Read a balanced `{…}` group starting at `s[i]` (which must be `{`). Returns the inner
 *  content and the index just past the closing `}`, or null if unbalanced. Backslash
 *  escapes the next char so `\{`/`\}` don't shift the brace depth. */
function readGroup(s: string, i: number): { content: string; end: number } | null {
  if (s[i] !== '{') return null
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') {
      j++ // skip the escaped char
      continue
    }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return { content: s.slice(i + 1, j), end: j + 1 }
  }
  return null
}

/** Parse `\newlabel{name}{{number}{page}…}` with brace matching. The number field can
 *  itself be brace-wrapped (amsmath/cleveref/hyperref emit `{{2.3}}`), which a lazy regex
 *  mis-captures — so read the balanced name group, the balanced value group, then its first
 *  sub-field, unwrapping one enclosing brace layer to get the bare number. */
function parseNewlabels(content: string, labels: Map<string, string>): void {
  const TOKEN = '\\newlabel{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    const name = readGroup(content, idx + TOKEN.length - 1)
    if (!name) continue
    const value = readGroup(content, name.end)
    if (!value) continue
    const field = readGroup(value.content, 0)
    if (!field) continue
    const num = unwrapBraces(field.content)
    // Trim keys to match the source-side parser (which trims `\label{ x }`); otherwise a
    // label resolvable only via .aux silently misses.
    labels.set(name.content.trim(), num)
  }
}

/** Parse `\bibcite{key}{label}` with brace matching. hyperref/natbib can emit a braced key
 *  (`\bibcite{{knuth84}}{1}`), which a lazy `(.+?)` regex captures as `{knuth84`. */
function parseBibcites(content: string, citations: Set<string>): void {
  const TOKEN = '\\bibcite{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    const key = readGroup(content, idx + TOKEN.length - 1)
    if (!key) continue
    citations.add(unwrapBraces(key.content).trim())
  }
}

function parseInputs(content: string, includes: string[]): void {
  const TOKEN = '\\@input{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    const input = readGroup(content, idx + TOKEN.length - 1)
    if (input) includes.push(input.content)
  }
}

export function parseAuxFile(content: string): AuxData {
  const labels = new Map<string, string>()
  const citations = new Set<string>()
  const includes: string[] = []

  parseNewlabels(content, labels)
  parseBibcites(content, citations)
  parseInputs(content, includes)

  return { labels, citations, includes }
}
