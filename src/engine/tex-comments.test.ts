import { describe, expect, it } from 'vitest'
import { stripTexComments } from './tex-comments'

describe('stripTexComments', () => {
  it('strips a plain line comment', () => {
    expect(stripTexComments('a % comment')).toBe('a ')
    expect(stripTexComments('% whole line\nkept')).toBe('\nkept')
  })

  it('keeps an escaped literal percent (odd backslash run)', () => {
    expect(stripTexComments('50\\% done')).toBe('50\\% done')
    expect(stripTexComments('a \\\\\\% b')).toBe('a \\\\\\% b') // 3 backslashes = odd
  })

  it('treats % after an escaped backslash as a comment (even run)', () => {
    expect(stripTexComments('a \\\\% comment')).toBe('a \\\\')
    expect(stripTexComments('x \\\\\\\\% c')).toBe('x \\\\\\\\') // 4 backslashes = even
  })

  it('is per-line (multiline flag)', () => {
    expect(stripTexComments('keep1 % drop\nkeep2 % drop2')).toBe('keep1 \nkeep2 ')
  })
})
