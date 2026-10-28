import { maskSpansFromTokens } from './latex-parser'
import { tokenize } from './latex-tokenizer'

/** Literal source occurrences only. The host supplies compile-bound display
 * values; syntax never estimates counters or interprets citation styles. */
export interface ReferenceOccurrence {
  command: 'label' | 'ref' | 'eqref' | 'pageref' | 'cite'
  from: number
  to: number
  keys: string[]
}

export function getReferenceOccurrences(content: string): ReferenceOccurrence[] {
  const tokens = tokenize(content)
  const spans = maskSpansFromTokens(tokens).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let spanIndex = 0
  const commands = new Set(
    tokens.filter((token) => token.type === 'command').map((token) => token.start),
  )
  const occurrences: ReferenceOccurrence[] = []
  for (const match of content.matchAll(/\\(label|ref|eqref|pageref|cite)\s*\{([^{}\\%#]+)\}/g)) {
    while (spans[spanIndex] && spans[spanIndex]![1] <= match.index) spanIndex++
    const span = spans[spanIndex]
    if ((span && span[0] <= match.index && match.index < span[1]) || !commands.has(match.index))
      continue
    const command = match[1]
    if (
      command !== 'label' &&
      command !== 'ref' &&
      command !== 'eqref' &&
      command !== 'pageref' &&
      command !== 'cite'
    )
      continue
    const keys = match[2]!.split(',').map((key) => key.trim())
    if (keys.some((key) => !key || /\s/.test(key)) || (command !== 'cite' && keys.length !== 1))
      continue
    occurrences.push({ command, from: match.index, to: match.index + match[0].length, keys })
  }
  return occurrences
}
