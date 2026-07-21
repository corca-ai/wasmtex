/**
 * Error-tolerant, catcode-aware LaTeX tokenizer.
 *
 * This is the lexical foundation the project index builds on. It never throws
 * on malformed input — it always returns a best-effort token stream covering
 * the whole source. Each token carries an absolute offset plus a 1-based
 * line/column so downstream consumers can report precise locations.
 *
 * It models the catcodes that matter for source intelligence: control
 * sequences, group braces, math toggles, comments, macro parameters, and
 * verbatim regions (`\verb`-style inline spans and verbatim-like environments)
 * whose contents must NOT be interpreted as commands.
 */

export type TokenType =
  | 'command' // control word `\foo` or control symbol `\%`; value = name without backslash
  | 'open' // `{`
  | 'close' // `}`
  | 'math' // `$` or `$$` math toggle (value `$`/`$$`). Note: `\(` `\)` `\[` `\]` are `command` tokens.
  | 'comment' // `%` to end of line; value includes the leading `%`
  | 'verb' // raw verbatim content (inline `\verb` or a verbatim environment body)
  | 'param' // `#1`..`#9` or bare `#`; value is the digit (or '')
  | 'text' // a run of ordinary characters

export interface Token {
  type: TokenType
  value: string
  /** Absolute start offset (0-based, inclusive). */
  start: number
  /** Absolute end offset (0-based, exclusive). */
  end: number
  /** 1-based line of `start`. */
  line: number
  /** 1-based column of `start`. */
  column: number
}

/** Environments whose body is verbatim (commands inside are not interpreted). */
export const VERBATIM_ENVIRONMENTS = new Set([
  'verbatim',
  'verbatim*',
  'Verbatim',
  'BVerbatim',
  'lstlisting',
  'minted',
  'alltt',
  'comment',
])

/** Inline verbatim commands that take a delimited raw argument. */
const INLINE_VERB_COMMANDS = new Set(['verb', 'verb*', 'lstinline', 'mintinline'])

const isLetter = (ch: string): boolean => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9'

class Tokenizer {
  private pos = 0
  private line = 1
  private col = 1
  private tokens: Token[] = []

  constructor(private src: string) {}

  tokenize(): Token[] {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]!
      if (ch === '\\') this.readControlSequence()
      else if (ch === '{') this.emitSingle('open', ch)
      else if (ch === '}') this.emitSingle('close', ch)
      else if (ch === '%') this.readComment()
      else if (ch === '$') this.readMath()
      else if (ch === '#') this.readParam()
      else this.readText()
    }
    return this.tokens
  }

  /** Advance one character, tracking line/column. */
  private advance(): string {
    const ch = this.src[this.pos]!
    this.pos++
    if (ch === '\n') {
      this.line++
      this.col = 1
    } else {
      this.col++
    }
    return ch
  }

  /**
   * Consume `src[pos, end)` in one shot: update line/column over the whole span,
   * advance `pos` to `end`, and return the slice. Scanning to `end` and slicing
   * once avoids the per-character `value += advance()` concatenation that
   * dominated tokenize time on large documents.
   */
  private consumeTo(end: number): string {
    const src = this.src
    const from = this.pos
    let lastNewline = -1
    for (let i = from; i < end; i++) {
      if (src.charCodeAt(i) === 10 /* \n */) {
        this.line++
        lastNewline = i
      }
    }
    this.col = lastNewline >= 0 ? end - lastNewline : this.col + (end - from)
    this.pos = end
    return src.slice(from, end)
  }

  private push(type: TokenType, value: string, start: number, line: number, column: number): void {
    this.tokens.push({ type, value, start, end: this.pos, line, column })
  }

  private emitSingle(type: TokenType, value: string): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    this.advance()
    this.push(type, value, start, line, column)
  }

  private readControlSequence(): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    this.advance() // consume backslash

    if (this.pos >= this.src.length) {
      this.push('command', '', start, line, column)
      return
    }

    const ch = this.src[this.pos]!
    let name: string
    if (isLetter(ch)) {
      const src = this.src
      const len = src.length
      let i = this.pos
      while (i < len && isLetter(src[i]!)) i++
      name = this.consumeTo(i)
    } else {
      // Control symbol: a single (possibly non-letter) character, e.g. \% \\ \{ \,
      name = this.advance()
    }
    this.push('command', name, start, line, column)

    if (INLINE_VERB_COMMANDS.has(name)) this.readInlineVerb(name)
  }

  /**
   * After `\verb`/`\lstinline`/`\mintinline` (etc.): read the verbatim argument.
   *
   * `\verb`/`\verb*` use the next char as a one-shot delimiter. The listings/minted
   * inline forms additionally accept an optional `[options]` group and brace-delimited
   * bodies: `\lstinline[opts]{code}`, `\mintinline[opts]{lang}{code}`. Without
   * brace/bracket awareness the `[` or first `{` would be mistaken for the delimiter,
   * swallowing the real `{code}`/trailing source as verbatim.
   */
  private readInlineVerb(name: string): void {
    if (this.pos >= this.src.length) return
    // \verb* variant: a '*' may precede the delimiter.
    if (this.src[this.pos] === '*') this.advance()
    if (this.pos >= this.src.length) return

    // listings/minted brace forms emit the verb themselves; everything else (and the
    // \lstinline|...| delimiter form) falls through to the generic single-char reader.
    if ((name === 'lstinline' || name === 'mintinline') && this.readBracketedVerb(name)) return
    this.readDelimitedVerb()
  }

  /**
   * Handle the listings/minted brace forms: an optional `[options]` group, `\mintinline`'s
   * mandatory `{language}` group, then a brace-delimited `{code}` body emitted as one verb
   * token. Returns true when it emitted the verb; false to fall through to the generic
   * single-char delimiter (e.g. `\lstinline|code|`).
   */
  private readBracketedVerb(name: string): boolean {
    if (this.src[this.pos] === '[') this.skipBalancedGroup('[', ']')
    if (this.pos >= this.src.length) return false
    if (name === 'mintinline' && this.src[this.pos] === '{') this.skipBalancedGroup('{', '}')
    if (this.pos >= this.src.length || this.src[this.pos] !== '{') return false
    this.readBraceVerb()
    return true
  }

  /** Generic `\verb`-style reader: the next char is the delimiter; read raw until it repeats. */
  private readDelimitedVerb(): void {
    const delim = this.advance() // delimiter char (consumed, not part of content)
    const start = this.pos
    const line = this.line
    const column = this.col
    const src = this.src
    const len = src.length
    let i = this.pos
    while (i < len && src[i] !== delim && src[i] !== '\n') i++
    const value = this.consumeTo(i)
    if (this.pos < len && src[this.pos] === delim) this.advance()
    this.push('verb', value, start, line, column)
  }

  /**
   * Consume a balanced `open..close` group starting at the current `open` char,
   * tracking nesting depth. Stops at a newline if the group never closes (inline
   * verb args are single-line), so malformed input can't run away.
   */
  private skipBalancedGroup(open: string, close: string): void {
    const src = this.src
    const len = src.length
    let depth = 0
    let i = this.pos
    while (i < len) {
      const c = src[i]!
      if (c === '\n') break
      if (c === open) depth++
      else if (c === close && --depth === 0) {
        i++
        break
      }
      i++
    }
    this.consumeTo(i)
  }

  /** Read a balanced `{..}` group as a single verb token (contents between the braces). */
  private readBraceVerb(): void {
    this.advance() // consume opening '{'
    const start = this.pos
    const line = this.line
    const column = this.col
    const src = this.src
    const len = src.length
    let depth = 1
    let i = this.pos
    while (i < len) {
      const c = src[i]!
      if (c === '\n') break
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) break
      i++
    }
    const value = this.consumeTo(i)
    if (this.pos < len && src[this.pos] === '}') this.advance()
    this.push('verb', value, start, line, column)
  }

  private readComment(): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    const src = this.src
    const len = src.length
    let i = this.pos
    while (i < len && src[i] !== '\n') i++
    const value = this.consumeTo(i)
    this.push('comment', value, start, line, column)
  }

  private readMath(): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    this.advance() // first $
    if (this.pos < this.src.length && this.src[this.pos] === '$') {
      this.advance()
      this.push('math', '$$', start, line, column)
    } else {
      this.push('math', '$', start, line, column)
    }
  }

  private readParam(): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    this.advance() // #
    let digit = ''
    if (this.pos < this.src.length && isDigit(this.src[this.pos]!)) {
      digit = this.advance()
    }
    this.push('param', digit, start, line, column)
  }

  private readText(): void {
    const start = this.pos
    const line = this.line
    const column = this.col
    const src = this.src
    const len = src.length
    // Single pass over the text run: find the break char AND track newlines via
    // charCode comparisons. This is the tokenizer's hottest loop (most of a
    // document is ordinary text), so it avoids both per-char string concat and a
    // second newline-scan. Break chars: \(92) {(123) }(125) %(37) $(36) #(35).
    let i = start
    let newlines = 0
    let lastNewline = -1
    while (i < len) {
      const c = src.charCodeAt(i)
      if (c === 92 || c === 123 || c === 125 || c === 37 || c === 36 || c === 35) break
      if (c === 10) {
        newlines++
        lastNewline = i
      }
      i++
    }
    if (newlines > 0) {
      this.line += newlines
      this.col = i - lastNewline
    } else {
      this.col += i - start
    }
    this.pos = i
    this.push('text', src.slice(start, i), start, line, column)
  }
}

/** Tokenize a LaTeX source string into a flat token stream. Never throws. */
export function tokenize(source: string): Token[] {
  return new Tokenizer(source).tokenize()
}
