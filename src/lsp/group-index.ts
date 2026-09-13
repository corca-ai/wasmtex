export type GroupEndIndex = ReadonlyMap<number, number>

/** Index required groups and legacy optional delimiters once. A brace-protected
 * closing bracket cannot end an optional group at an outer brace depth. */
export function indexGroupEnds(text: string, balancedOptional = false): GroupEndIndex {
  const ends = new Map<number, number>()
  const braces: number[] = []
  const brackets = new Map<number, number[]>()
  for (let i = 0; i < text.length; i++) {
    const ch = text.charAt(i)
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') braces.push(i)
    else if (ch === '}') {
      brackets.delete(braces.length)
      recordGroupEnd(ends, braces.pop(), i)
    } else if (ch === '[') {
      const starts = brackets.get(braces.length) ?? []
      starts.push(i)
      brackets.set(braces.length, starts)
    } else if (ch === ']') {
      closeBracket(ends, brackets, braces.length, i, balancedOptional)
    }
  }
  return ends
}

function recordGroupEnds(
  ends: Map<number, number>,
  starts: number[] | undefined,
  end: number,
): void {
  for (const start of starts ?? []) ends.set(start, end)
}

function recordGroupEnd(ends: Map<number, number>, start: number | undefined, end: number): void {
  if (start !== undefined) ends.set(start, end)
}

function closeBracket(
  ends: Map<number, number>,
  brackets: Map<number, number[]>,
  depth: number,
  end: number,
  balanced: boolean,
): void {
  const starts = brackets.get(depth)
  if (balanced) recordGroupEnd(ends, starts?.pop(), end)
  else {
    recordGroupEnds(ends, starts, end)
    brackets.delete(depth)
  }
}
