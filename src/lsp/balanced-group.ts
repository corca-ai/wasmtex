/** Read brace/bracket groups, preserving escaped and brace-protected delimiters. */
export function readBalancedGroup(
  text: string,
  open: number,
  balancedOptional = false,
): { closed: boolean; contentEnd: number; end: number } {
  const stack: string[] = [text[open] === '{' ? '}' : ']']
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') stack.push('}')
    else if (balancedOptional && ch === '[' && stack[stack.length - 1] === ']') stack.push(']')
    else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return { closed: true, contentEnd: i, end: i + 1 }
    }
  }
  return { closed: false, contentEnd: text.length, end: text.length }
}
