import type { CompletionValueKind } from './package-db'
import type { NeutralDocument, NeutralPosition, NeutralRange } from './protocol'
import { buildLineStarts, positionToOffset, rangeFromOffsets } from './source-position'

export type BibCompletionDomain = Extract<
  CompletionValueKind,
  'bib-entry-type' | 'bib-field' | 'bib-entry-key' | 'bib-string'
>

export interface BibCompletionContext {
  type: 'bibtex'
  domain: BibCompletionDomain
  documentPath: string
  prefix: string
  replacementRange: NeutralRange
  entryType?: string
  field?: string
  usedFields: string[]
}

interface BibEntryBounds {
  type: string
  at: number
  open: number
  close: number
}

function isNameChar(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z0-9_.:+/-]/.test(char)
}

function structuralClose(
  char: string,
  outerClose: string,
  braceDepth: number,
): { braceDepth: number; closes: boolean } {
  if (char === '{') return { braceDepth: braceDepth + 1, closes: false }
  if (char !== '}' && char !== outerClose) return { braceDepth, closes: false }
  if (char === '}' && braceDepth > 0) return { braceDepth: braceDepth - 1, closes: false }
  return { braceDepth, closes: char === outerClose }
}

function entryClose(text: string, open: number): number {
  const outerClose = text[open] === '{' ? '}' : ')'
  let braceDepth = 0
  let quoted = false
  for (let cursor = open + 1; cursor < text.length; cursor++) {
    const char = text[cursor]!
    if (char === '\\') {
      cursor++
      continue
    }
    if (char === '"' && braceDepth === 0) {
      quoted = !quoted
      continue
    }
    if (quoted) continue
    const structural = structuralClose(char, outerClose, braceDepth)
    braceDepth = structural.braceDepth
    if (structural.closes) return cursor
  }
  return text.length
}

function entries(text: string): BibEntryBounds[] {
  const result: BibEntryBounds[] = []
  for (const match of text.matchAll(/@([A-Za-z][A-Za-z0-9_-]*)\s*([{(])/g)) {
    const open = match.index + match[0].length - 1
    result.push({
      type: match[1]!.toLowerCase(),
      at: match.index,
      open,
      close: entryClose(text, open),
    })
  }
  return result
}

function entryTypeContext(
  text: string,
  cursor: number,
  lineStarts: number[],
  documentPath: string,
): BibCompletionContext | null {
  const at = text.lastIndexOf('@', cursor - 1)
  if (at < 0) return null
  let end = at + 1
  while (isNameChar(text[end])) end++
  const between = text.slice(end, cursor)
  if (cursor < at + 1 || (cursor > end && between.trim() !== '')) return null
  const prefix = text.slice(at + 1, Math.min(cursor, end))
  if (!/^[A-Za-z0-9_-]*$/.test(prefix)) return null
  return {
    type: 'bibtex',
    domain: 'bib-entry-type',
    documentPath,
    prefix,
    replacementRange: rangeFromOffsets(lineStarts, at + 1, end),
    usedFields: [],
  }
}

function topLevelOffsets(text: string, start: number, end: number, needle: string): number[] {
  const result: number[] = []
  let braceDepth = 0
  let quoted = false
  for (let cursor = start; cursor < end; cursor++) {
    const char = text[cursor]!
    if (char === '\\') cursor++
    else if (char === '"' && braceDepth === 0) quoted = !quoted
    else if (!quoted && char === '{') braceDepth++
    else if (!quoted && char === '}' && braceDepth > 0) braceDepth--
    else if (!quoted && braceDepth === 0 && char === needle) result.push(cursor)
  }
  return result
}

function trimStart(text: string, start: number, end: number): number {
  while (start < end && /\s/.test(text[start]!)) start++
  return start
}

function wordRange(text: string, start: number, end: number, cursor: number): [number, number] {
  let wordStart = cursor
  let wordEnd = cursor
  while (wordStart > start && isNameChar(text[wordStart - 1])) wordStart--
  while (wordEnd < end && isNameChar(text[wordEnd])) wordEnd++
  return [wordStart, wordEnd]
}

function usedFields(text: string, start: number, end: number, currentStart: number): string[] {
  const commas = topLevelOffsets(text, start, end, ',')
  const result = new Set<string>()
  let segmentStart = start
  for (const segmentEnd of [...commas, end]) {
    if (segmentStart !== currentStart) {
      const equals = topLevelOffsets(text, segmentStart, segmentEnd, '=')[0]
      const name = text
        .slice(segmentStart, equals ?? segmentEnd)
        .trim()
        .toLowerCase()
      if (name) result.add(name)
    }
    segmentStart = segmentEnd + 1
  }
  return [...result].sort()
}

function valueContext(
  text: string,
  cursor: number,
  lineStarts: number[],
  documentPath: string,
  entry: BibEntryBounds,
  segmentStart: number,
  segmentEnd: number,
  equals: number,
  fields: string[],
): BibCompletionContext | null {
  const field = text.slice(segmentStart, equals).trim().toLowerCase()
  const valueStart = trimStart(text, equals + 1, segmentEnd)
  const [start, end] = wordRange(text, valueStart, segmentEnd, cursor)
  const domain = field === 'crossref' || field === 'xdata' ? 'bib-entry-key' : 'bib-string'
  const first = text[valueStart]
  if (domain === 'bib-string' && (first === '{' || first === '"')) return null
  return {
    type: 'bibtex',
    domain,
    documentPath,
    entryType: entry.type,
    field,
    prefix: text.slice(start, cursor),
    replacementRange: rangeFromOffsets(lineStarts, start, end),
    usedFields: fields,
  }
}

function fieldOrValueContext(
  text: string,
  cursor: number,
  lineStarts: number[],
  documentPath: string,
  entry: BibEntryBounds,
): BibCompletionContext | null {
  const start = entry.open + 1
  const commas = topLevelOffsets(text, start, entry.close, ',')
  const firstComma = commas[0]
  if (firstComma === undefined || cursor <= firstComma) return null
  const previous = commas.filter((comma) => comma < cursor).at(-1)!
  const next = commas.find((comma) => comma >= cursor) ?? entry.close
  const segmentStart = previous + 1
  const equals = topLevelOffsets(text, segmentStart, next, '=')[0]
  const fields = usedFields(text, firstComma + 1, entry.close, segmentStart)
  if (equals !== undefined && cursor > equals) {
    return valueContext(
      text,
      cursor,
      lineStarts,
      documentPath,
      entry,
      segmentStart,
      next,
      equals,
      fields,
    )
  }
  const fieldStart = trimStart(text, segmentStart, next)
  const [wordStart, wordEnd] = wordRange(text, fieldStart, equals ?? next, cursor)
  return {
    type: 'bibtex',
    domain: 'bib-field',
    documentPath,
    entryType: entry.type,
    prefix: text.slice(wordStart, cursor).toLowerCase(),
    replacementRange: rangeFromOffsets(lineStarts, wordStart, wordEnd),
    usedFields: fields,
  }
}

/** Error-tolerant completion context for BibTeX and biblatex database source. */
export function analyzeBibCompletionContext(
  document: NeutralDocument,
  position: NeutralPosition,
): BibCompletionContext | null {
  try {
    const text = document.getText()
    const lineStarts = buildLineStarts(text)
    const cursor = positionToOffset(text, lineStarts, position)
    const type = entryTypeContext(text, cursor, lineStarts, document.path)
    if (type) return type
    const entry = entries(text).find(
      (candidate) => cursor > candidate.open && cursor <= candidate.close,
    )
    return entry ? fieldOrValueContext(text, cursor, lineStarts, document.path, entry) : null
  } catch {
    return null
  }
}
