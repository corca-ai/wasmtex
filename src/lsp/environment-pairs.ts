import type { Token } from './latex-tokenizer'
import { VERBATIM_ENVIRONMENTS } from './latex-tokenizer'
import type { NeutralRange } from './protocol'
import { rangeFromOffsets } from './source-position'

/** Literal, source-owned names. Control sequences and parameter templates are excluded. */
export const ENVIRONMENT_NAME_PATTERN = '[A-Za-z0-9@:_*\\-]+'

export interface LinkedEditingRanges {
  ranges: NeutralRange[]
  wordPattern: string
}

export interface EnvironmentNamePair {
  begin: NeutralRange
  end: NeutralRange
}

/** Consume the parser's existing token stream and source-preserving template mask. */
export function environmentNamePairs(
  source: string,
  masked: string,
  tokens: readonly Token[],
  lineStarts: number[],
): EnvironmentNamePair[] {
  const pairs: EnvironmentNamePair[] = []
  const stack: Array<{ name: string; range: NeutralRange }> = []
  for (const token of tokens) {
    if (!isEnvironmentDelimiter(token)) continue
    if (masked[token.start] !== '\\') continue
    const match = /^\s*\{([A-Za-z0-9@:_*-]+)\}/.exec(source.slice(token.end))
    // An unparseable delimiter is a barrier, never permission to jump to a later end.
    if (!match) {
      stack.length = 0
      continue
    }
    const name = match[1]!
    const end = token.end + match[0].length - 1
    const range = rangeFromOffsets(lineStarts, end - name.length, end)
    if (token.value === 'begin') {
      stack.push({ name, range })
      continue
    }
    const begin = stack.pop()
    if (!begin || begin.name !== name) {
      stack.length = 0
      continue
    }
    if (!VERBATIM_ENVIRONMENTS.has(name)) pairs.push({ begin: begin.range, end: range })
  }
  return pairs
}

export function linkedEnvironmentRanges(
  pairs: readonly EnvironmentNamePair[],
  line: number,
  column: number,
): NeutralRange[] | null {
  const contains = (range: NeutralRange) =>
    line === range.startLine && column >= range.startColumn && column <= range.endColumn
  const pair = pairs.find((pair) => contains(pair.begin) || contains(pair.end))
  return pair ? [{ ...pair.begin }, { ...pair.end }] : null
}

function isEnvironmentDelimiter(token: Token): boolean {
  return token.type === 'command' && (token.value === 'begin' || token.value === 'end')
}
