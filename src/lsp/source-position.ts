/** Shared offset ↔ line/column helpers for source analysis. */
import type { NeutralPosition, NeutralRange } from './protocol'

/** Offsets at which each line begins (`lineStarts[0] === 0`). */
export function buildLineStarts(text: string): number[] {
  const starts = [0]
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n') starts.push(i + 1)
  }
  return starts
}

/** Convert an absolute offset to a 1-based `{line, column}` via binary search. */
export function offsetToLineCol(
  lineStarts: number[],
  offset: number,
): { line: number; column: number } {
  // Guard the 1-based contract: a negative offset (e.g. an unmatched-token
  // fallback that subtracted past the start) would otherwise yield column ≤ 0.
  if (offset < 0) offset = 0
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lineStarts[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return { line: lo + 1, column: offset - lineStarts[lo]! + 1 }
}

/** Convert a clamped 1-based document position to an absolute offset. */
export function positionToOffset(
  text: string,
  lineStarts: number[],
  position: NeutralPosition,
): number {
  const lineIndex = Math.min(Math.max(position.line - 1, 0), lineStarts.length - 1)
  const lineStart = lineStarts[lineIndex]!
  const lineEnd = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1]! - 1 : text.length
  return Math.min(Math.max(lineStart + position.column - 1, lineStart), lineEnd)
}

/** Convert absolute start/end offsets to a 1-based, end-exclusive neutral range. */
export function rangeFromOffsets(lineStarts: number[], start: number, end: number): NeutralRange {
  const first = offsetToLineCol(lineStarts, start)
  const last = offsetToLineCol(lineStarts, end)
  return {
    startLine: first.line,
    startColumn: first.column,
    endLine: last.line,
    endColumn: last.column,
  }
}
