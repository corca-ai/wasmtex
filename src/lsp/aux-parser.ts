import { tokenize } from './latex-tokenizer'
import type { AuxData, AuxLabel } from './types'

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
function parseNewlabels(
  content: string,
  labels: Map<string, string>,
  details: Map<string, AuxLabel>,
  commands: ReadonlySet<number>,
  ambiguous: Set<string>,
): void {
  const TOKEN = '\\newlabel{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    if (!commands.has(idx)) continue
    const name = readGroup(content, idx + TOKEN.length - 1)
    if (!name) continue
    const value = readGroup(content, name.end)
    if (!value) continue
    const field = readGroup(value.content, 0)
    if (!field) continue
    const num = unwrapBraces(field.content)
    const page = readGroup(value.content, field.end)
    // Trim keys to match the source-side parser (which trims `\label{ x }`); otherwise a
    // label resolvable only via .aux silently misses.
    const key = name.content.trim()
    if (labels.has(key)) ambiguous.add(key)
    labels.set(key, num)
    details.set(key, {
      number: num,
      ...(page ? { page: unwrapBraces(page.content) } : {}),
    })
  }
}

/** Parse `\bibcite{key}{label}` with brace matching. hyperref/natbib can emit a braced key
 *  (`\bibcite{{knuth84}}{1}`), which a lazy `(.+?)` regex captures as `{knuth84`. */
function parseBibcites(
  content: string,
  citations: Set<string>,
  commands: ReadonlySet<number>,
): void {
  const TOKEN = '\\bibcite{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    if (!commands.has(idx)) continue
    const key = readGroup(content, idx + TOKEN.length - 1)
    if (!key) continue
    citations.add(unwrapBraces(key.content).trim())
  }
}

function parseInputs(content: string, includes: string[], commands: ReadonlySet<number>): void {
  const TOKEN = '\\@input{'
  for (let idx = content.indexOf(TOKEN); idx !== -1; idx = content.indexOf(TOKEN, idx + 1)) {
    if (!commands.has(idx)) continue
    const input = readGroup(content, idx + TOKEN.length - 1)
    if (input) includes.push(input.content)
  }
}

export function parseAuxFile(content: string): AuxData {
  const labels = new Map<string, string>()
  const labelDetails = new Map<string, AuxLabel>()
  const ambiguousLabels = new Set<string>()
  const citations = new Set<string>()
  const includes: string[] = []
  const commands = new Set<number>()
  let depth = 0
  for (const token of tokenize(content)) {
    if (token.type === 'open') depth += 1
    else if (token.type === 'close') depth = Math.max(0, depth - 1)
    else if (token.type === 'command' && depth === 0) commands.add(token.start)
  }

  parseNewlabels(content, labels, labelDetails, commands, ambiguousLabels)
  parseBibcites(content, citations, commands)
  parseInputs(content, includes, commands)

  for (const key of ambiguousLabels) {
    labels.delete(key)
    labelDetails.delete(key)
  }
  return { labels, labelDetails, ambiguousLabels, citations, includes }
}
