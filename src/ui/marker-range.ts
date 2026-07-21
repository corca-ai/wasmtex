/** A Monaco-compatible marker range (1-based line/column, end exclusive of the next char). */
export interface MarkerRange {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

/**
 * Clamp a diagnostic's (line, column, endColumn) into a single-line Monaco marker range
 * that is always valid: `1 <= startColumn <= endColumn <= maxColumn` on a line within
 * `[1, lineCount]`. A stale diagnostic can point past the current (shorter) document; if
 * only the line and endColumn are clamped — but not startColumn — the result inverts
 * (startColumn > endColumn) and Monaco renders a wrong/empty squiggle.
 *
 * Pure (no Monaco import) so the range math is unit-testable on its own.
 */
export function clampMarkerRange(
  line: number,
  column: number,
  endColumn: number,
  lineCount: number,
  maxColumnOf: (line: number) => number,
): MarkerRange {
  const ln = Math.min(Math.max(line, 1), Math.max(lineCount, 1))
  const maxColumn = maxColumnOf(ln)
  const startColumn = Math.min(Math.max(column, 1), maxColumn)
  const endCol = Math.min(Math.max(endColumn, startColumn), maxColumn)
  return { startLineNumber: ln, startColumn, endLineNumber: ln, endColumn: endCol }
}
