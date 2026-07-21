export interface PreambleSplit {
  /** Everything before \begin{document} */
  preamble: string
  /** Everything from \begin{document} onwards (inclusive) */
  body: string
  /** Number of lines in the preamble portion */
  preambleLineCount: number
}

/**
 * Split TeX source into preamble and body at the \begin{document} boundary.
 * Returns null if \begin{document} is not found or is inside a comment.
 */
export function extractPreamble(texSource: string): PreambleSplit | null {
  const marker = '\\begin{document}'
  let searchFrom = 0

  while (true) {
    const idx = texSource.indexOf(marker, searchFrom)
    if (idx === -1) return null

    // Skip if \begin{document} is inside a comment
    const lineStart = texSource.lastIndexOf('\n', idx - 1) + 1
    if (hasCommentStart(texSource.substring(lineStart, idx))) {
      searchFrom = idx + marker.length
      continue
    }

    return {
      preamble: texSource.substring(0, idx),
      body: texSource.substring(idx),
      preambleLineCount: texSource.substring(0, idx).split('\n').length,
    }
  }
}

/**
 * Whether `text` contains a comment-starting `%`. A `%` only starts a comment
 * when preceded by an even number of backslashes — an escaped `\%` is a literal
 * percent, not a comment.
 */
function hasCommentStart(text: string): boolean {
  let backslashes = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '\\') {
      backslashes++
      continue
    }
    if (ch === '%' && backslashes % 2 === 0) return true
    backslashes = 0
  }
  return false
}

/**
 * Simple string hash (djb2 variant). Returns a base-36 string.
 * Used to detect preamble changes without comparing full text.
 */
export function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0
  }
  return h.toString(36)
}
