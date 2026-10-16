import {
  type NormalizedVisibleText,
  normalizeVisibleText,
  type VisibleTextUnit,
} from './visible-text-normalize'

export interface VisiblePdfTextVariant {
  method: 'exact' | 'dehyphenated'
  normalized: NormalizedVisibleText
}

/** Renderer offsets remain those of the original extracted PDF string. */
export function projectVisiblePdfText(text: string, dehyphenate = false): VisiblePdfTextVariant[] {
  const exact: VisibleTextUnit[] = []
  const joined: VisibleTextUnit[] = []
  let previous = 0
  let changed = false
  // Keep the literal hyphen first: re-sign must not silently become resign.
  for (const match of text.matchAll(/[-\u2010][ \t]*\r?\n[ \t]*(?=\p{L})/gu)) {
    const start = match.index
    if (start === 0 || !/\p{L}/u.test(text[start - 1]!)) continue
    const prefix = { text: text.slice(previous, start), start: previous, end: start }
    exact.push(prefix, { text: text[start]!, start, end: start + 1 })
    joined.push(prefix)
    previous = start + match[0].length
    changed = true
  }
  const tail = { text: text.slice(previous), start: previous, end: text.length }
  exact.push(tail)
  joined.push(tail)
  const variants: VisiblePdfTextVariant[] = [
    { method: 'exact', normalized: normalizeVisibleText(exact) },
  ]
  if (dehyphenate && changed)
    variants.push({ method: 'dehyphenated', normalized: normalizeVisibleText(joined) })
  return variants
}
