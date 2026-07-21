/** Shared offset ↔ line/column helpers for source analysis. */

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
