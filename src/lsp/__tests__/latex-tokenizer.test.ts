import { describe, expect, it } from 'vitest'
import { tokenize } from '../latex-tokenizer'

describe('tokenize', () => {
  it('reads control words and control symbols', () => {
    const t = tokenize('\\section \\% \\\\')
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['section', '%', '\\'])
  })

  it('tracks 1-based line and column of each token', () => {
    const t = tokenize('ab\\foo')
    const foo = t.find((x) => x.type === 'command')!
    expect(foo.value).toBe('foo')
    expect(foo.line).toBe(1)
    expect(foo.column).toBe(3)
  })

  it('tracks positions across newlines', () => {
    const t = tokenize('line1\n  \\ref{x}')
    const ref = t.find((x) => x.type === 'command')!
    expect(ref.line).toBe(2)
    expect(ref.column).toBe(3)
  })

  it('emits nested braces as separate group tokens', () => {
    const t = tokenize('{a{b}}')
    expect(t.filter((x) => x.type === 'open')).toHaveLength(2)
    expect(t.filter((x) => x.type === 'close')).toHaveLength(2)
  })

  it('captures a comment to end of line and resumes after', () => {
    const t = tokenize('a % comment \\ref{x}\n\\label{y}')
    const comment = t.find((x) => x.type === 'comment')!
    expect(comment.value).toBe('% comment \\ref{x}')
    // The \ref inside the comment is NOT a command token.
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['label'])
  })

  it('treats \\% as a control symbol, not a comment', () => {
    const t = tokenize('50\\% done % real')
    expect(t.some((x) => x.type === 'command' && x.value === '%')).toBe(true)
    expect(t.filter((x) => x.type === 'comment')).toHaveLength(1)
  })

  it('reads inline \\verb with arbitrary delimiters as raw content', () => {
    const t = tokenize('\\verb|\\label{x}|')
    const verb = t.find((x) => x.type === 'verb')!
    expect(verb.value).toBe('\\label{x}')
    // No command token for the \label inside the verb span.
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['verb'])
  })

  it('skips a \\lstinline optional [..] arg and reads the {..} body as verb', () => {
    const t = tokenize('\\lstinline[language=C]{int x;} after \\ref{r}')
    const verb = t.find((x) => x.type === 'verb')!
    expect(verb.value).toBe('int x;')
    // The trailing \ref must survive as a real command, not be swallowed by the verb.
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['lstinline', 'ref'])
  })

  it('reads \\mintinline{lang}{code} with lang skipped and code as a single verb token', () => {
    const t = tokenize('\\mintinline{latex}{\\ref{fake}} \\ref{real}')
    const verbs = t.filter((x) => x.type === 'verb').map((x) => x.value)
    expect(verbs).toEqual(['\\ref{fake}'])
    // Only the trailing real \ref is a command; the code body's \ref is verbatim.
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['mintinline', 'ref'])
  })

  it('reads a brace-delimited \\lstinline{code} body', () => {
    const t = tokenize('\\lstinline{a_b}')
    expect(t.find((x) => x.type === 'verb')!.value).toBe('a_b')
  })

  it('distinguishes $ and $$ math toggles', () => {
    const t = tokenize('$x$ $$y$$')
    expect(t.filter((x) => x.type === 'math').map((x) => x.value)).toEqual(['$', '$', '$$', '$$'])
  })

  it('reads \\( and \\[ as command tokens', () => {
    const t = tokenize('\\(x\\) \\[y\\]')
    const cmds = t.filter((x) => x.type === 'command').map((x) => x.value)
    expect(cmds).toEqual(['(', ')', '[', ']'])
  })

  it('reads macro parameters', () => {
    const t = tokenize('#1 and #')
    const params = t.filter((x) => x.type === 'param').map((x) => x.value)
    expect(params).toEqual(['1', ''])
  })

  it('never throws on malformed input', () => {
    expect(() => tokenize('\\\\{{{unclosed \\verb')).not.toThrow()
  })

  // Characterization test: pins the COMPLETE token stream (type/value/start/end/
  // line/column) for a document that mixes multi-line text spans, a command with
  // braces, math, a comment, inline verb, and a param. It guards the exact
  // offset/line/column bookkeeping against refactors of the scanning internals.
  it('produces the exact token stream for a representative document', () => {
    const doc = 'Hello world\n\\section{A}\nx $y$ %c\n\\verb|z|#1 end\nlast'
    const compact = tokenize(doc).map((t) => [t.type, t.value, t.start, t.end, t.line, t.column])
    expect(compact).toEqual([
      ['text', 'Hello world\n', 0, 12, 1, 1],
      ['command', 'section', 12, 20, 2, 1],
      ['open', '{', 20, 21, 2, 9],
      ['text', 'A', 21, 22, 2, 10],
      ['close', '}', 22, 23, 2, 11],
      ['text', '\nx ', 23, 26, 2, 12],
      ['math', '$', 26, 27, 3, 3],
      ['text', 'y', 27, 28, 3, 4],
      ['math', '$', 28, 29, 3, 5],
      ['text', ' ', 29, 30, 3, 6],
      ['comment', '%c', 30, 32, 3, 7],
      ['text', '\n', 32, 33, 3, 9],
      ['command', 'verb', 33, 38, 4, 1],
      ['verb', 'z', 39, 41, 4, 7],
      ['param', '1', 41, 43, 4, 9],
      ['text', ' end\nlast', 43, 52, 4, 11],
    ])
  })
})
