import {
  type CompletionCommandMetadataProvider,
  confirmedInvocationSelectionRanges,
} from './completion-context'
import type { CompletionCancellationToken } from './completion-registry'
import { indexGroupEnds } from './group-index'
import type { Token } from './latex-tokenizer'
import type { NeutralRange } from './protocol'
import { rangeFromOffsets } from './source-position'
import type { FileSymbols } from './types'

type OffsetRange = [number, number]

/** File-local parser evidence. Never contains expanded or synthesized source. */
interface StructuralSelectionIndex {
  masked: string
  lineStarts: number[]
  commands: Token[]
  groups: ReadonlyMap<number, number>
  balancedGroups: ReadonlyMap<number, number>
  ranges: OffsetRange[]
  excluded: OffsetRange[]
}

const indexes = new WeakMap<FileSymbols, StructuralSelectionIndex>()

export function getStructuralSelectionIndex(symbols: FileSymbols | undefined) {
  return symbols ? indexes.get(symbols) : undefined
}

export function structuralSelectionEstimatedBytes(symbols: FileSymbols): number {
  const index = indexes.get(symbols)
  if (!index) return 0
  return (
    index.masked.length * 2 +
    index.lineStarts.length * 8 +
    (index.groups.size + index.balancedGroups.size + index.ranges.length + index.excluded.length) *
      16 +
    index.commands.reduce((sum, token) => sum + token.value.length * 2 + 40, 0)
  )
}

export function cacheStructuralSelectionIndex(
  symbols: FileSymbols,
  masked: string,
  tokens: readonly Token[],
  lineStarts: number[],
  excluded: OffsetRange[],
  environments: OffsetRange[],
  existingGroups?: ReadonlyMap<number, number>,
): void {
  const groups = existingGroups ?? indexGroupEnds(masked)
  const ranges = [...environments]
  for (const [start, end] of groups) {
    if (masked[start] === '{') ranges.push([start + 1, end], [start, end + 1])
  }
  const hasOptional = [...groups.keys()].some((start) => masked[start] === '[')
  indexes.set(symbols, {
    masked,
    lineStarts,
    commands: tokens.filter((token) => token.type === 'command' && masked[token.start] === '\\'),
    groups,
    balancedGroups: hasOptional ? indexGroupEnds(masked, true) : groups,
    ranges,
    excluded,
  })
}

/** Smallest-to-largest, strict containment; a query never mutates the cached index. */
export function structuralSelectionRanges(
  index: StructuralSelectionIndex | undefined,
  line: number,
  column: number,
  metadata: CompletionCommandMetadataProvider,
  cancellation?: CompletionCancellationToken,
): NeutralRange[] {
  if (cancellation?.isCancellationRequested || !index) return []
  const offset = selectionOffset(index, line, column)
  if (offset === null) return []
  const ranges = index.ranges.filter((range) => contains(range, offset))
  const readGroup = (_text: string, open: number, balancedOptional = false) => {
    const close = (balancedOptional ? index.balancedGroups : index.groups).get(open)
    return close === undefined
      ? { closed: false, contentEnd: index.masked.length, end: index.masked.length }
      : { closed: true, contentEnd: close, end: close + 1 }
  }
  for (const token of index.commands) {
    if (cancellation?.isCancellationRequested) return []
    if (token.start > offset) break
    const candidates = confirmedInvocationSelectionRanges(index.masked, token, metadata, readGroup)
    for (const range of candidates) if (contains(range, offset)) ranges.push(range)
  }
  return nestedRanges(ranges, index.lineStarts)
}

function selectionOffset(
  index: StructuralSelectionIndex,
  line: number,
  column: number,
): number | null {
  if (!Number.isInteger(line) || !Number.isInteger(column) || column < 1) return null
  const start = index.lineStarts[line - 1]
  if (start === undefined) return null
  const offset = start + column - 1
  let lineEnd = (index.lineStarts[line] ?? index.masked.length + 1) - 1
  if (index.masked[lineEnd - 1] === '\r') lineEnd--
  if (offset > lineEnd || index.excluded.some(([a, b]) => offset >= a && offset < b)) return null
  return offset
}

function nestedRanges(ranges: OffsetRange[], lineStarts: number[]): NeutralRange[] {
  ranges.sort((a, b) => a[1] - a[0] - (b[1] - b[0]) || b[0] - a[0])
  const result: NeutralRange[] = []
  let previous: OffsetRange | undefined
  for (const range of ranges) {
    if (previous && (range[0] > previous[0] || range[1] < previous[1])) continue
    if (previous && range[0] === previous[0] && range[1] === previous[1]) continue
    result.push(rangeFromOffsets(lineStarts, ...range))
    previous = range
  }
  return result
}

function contains([start, end]: OffsetRange, offset: number): boolean {
  return start < end && start <= offset && offset < end
}
