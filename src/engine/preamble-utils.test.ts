import { describe, expect, it } from 'vitest'
import { extractPreamble, simpleHash } from './preamble-utils'

describe('extractPreamble', () => {
  it('splits at \\begin{document}', () => {
    const source = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\begin{document}',
      'Hello, world!',
      '\\end{document}',
    ].join('\n')

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preamble).toBe('\\documentclass{article}\n\\usepackage{amsmath}\n')
    expect(result!.body).toBe('\\begin{document}\nHello, world!\n\\end{document}')
    expect(result!.body.startsWith('\\begin{document}')).toBe(true)
  })

  it('returns null when \\begin{document} is missing', () => {
    const source = '\\documentclass{article}\nHello'
    expect(extractPreamble(source)).toBeNull()
  })

  it('ignores \\begin{document} inside a comment', () => {
    const source = [
      '\\documentclass{article}',
      '% \\begin{document}',
      '\\begin{document}',
      'Hello',
      '\\end{document}',
    ].join('\n')

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    // Should split at the real \begin{document} (line 3), not the commented one
    expect(result!.preamble).toBe('\\documentclass{article}\n% \\begin{document}\n')
    expect(result!.body.startsWith('\\begin{document}')).toBe(true)
  })

  it('returns null when only \\begin{document} is in a comment', () => {
    const source = '\\documentclass{article}\n% \\begin{document}\nHello'
    expect(extractPreamble(source)).toBeNull()
  })

  it('treats an escaped percent (\\%) before \\begin{document} as a literal, not a comment', () => {
    // `\%` is a literal percent, so the marker on this line is NOT commented out.
    const source = '\\documentclass{article}\n50\\% off \\begin{document}\nHi\n\\end{document}'

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preamble).toBe('\\documentclass{article}\n50\\% off ')
    expect(result!.body).toBe('\\begin{document}\nHi\n\\end{document}')
    expect(result!.body.startsWith('\\begin{document}')).toBe(true)
  })

  it('counts preamble lines correctly', () => {
    const source = [
      '\\documentclass{article}',
      '\\usepackage{amsmath}',
      '\\usepackage{graphicx}',
      '\\begin{document}',
      'Hello',
      '\\end{document}',
    ].join('\n')

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preambleLineCount).toBe(4) // lines 1-3 content + empty line 4 start
  })

  it('handles single-line preamble', () => {
    const source = '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}'

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preambleLineCount).toBe(2)
    expect(result!.preamble).toBe('\\documentclass{article}\n')
  })

  it('handles an empty preamble (document starts immediately)', () => {
    const source = '\\begin{document}\nHi\n\\end{document}'

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preamble).toBe('')
    expect(result!.preambleLineCount).toBe(1)
    expect(result!.body).toBe(source)
  })

  it('keeps inline content after \\begin{document} in the body', () => {
    const source = '\\documentclass{article}\n\\begin{document}\\maketitle Hi\n\\end{document}'

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preamble).toBe('\\documentclass{article}\n')
    expect(result!.body.startsWith('\\begin{document}\\maketitle Hi')).toBe(true)
  })

  it('splits at the first \\begin{document} and ignores a stray duplicate in the body', () => {
    const source = [
      '\\documentclass{article}',
      '\\begin{document}',
      'First.',
      '\\begin{document}',
      '\\end{document}',
    ].join('\n')

    const result = extractPreamble(source)
    expect(result).not.toBeNull()
    expect(result!.preamble).toBe('\\documentclass{article}\n')
    expect(result!.preambleLineCount).toBe(2)
  })
})

describe('simpleHash', () => {
  it('returns a stable hash for the same input', () => {
    const input = '\\documentclass{article}\n\\usepackage{amsmath}\n'
    expect(simpleHash(input)).toBe(simpleHash(input))
  })

  it('returns different hashes for different inputs', () => {
    const a = '\\documentclass{article}\n\\usepackage{amsmath}\n'
    const b = '\\documentclass{article}\n\\usepackage{graphicx}\n'
    expect(simpleHash(a)).not.toBe(simpleHash(b))
  })

  it('returns a base-36 string', () => {
    const hash = simpleHash('test')
    expect(hash).toMatch(/^-?[0-9a-z]+$/)
  })

  it('returns consistent result for empty string', () => {
    expect(simpleHash('')).toBe('0')
  })
})
