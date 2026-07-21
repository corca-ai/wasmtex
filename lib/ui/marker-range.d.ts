/** A Monaco-compatible marker range (1-based line/column, end exclusive of the next char). */
export interface MarkerRange {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
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
export declare function clampMarkerRange(line: number, column: number, endColumn: number, lineCount: number, maxColumnOf: (line: number) => number): MarkerRange;
