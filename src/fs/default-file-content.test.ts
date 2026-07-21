import { describe, expect, it } from 'vitest'
import { defaultFileContent } from './default-file-content'

describe('defaultFileContent', () => {
  it('produces a real multi-line .tex skeleton (no literal backslash-n)', () => {
    const c = defaultFileContent('notes.tex')
    expect(c).toContain('\n') // real newline byte
    expect(c).not.toContain('\\n') // not the literal two-char sequence
    expect(c.split('\n').length).toBeGreaterThanOrEqual(3)
    expect(c).toContain('\\documentclass{article}')
    expect(c).toContain('\\begin{document}')
    expect(c).toContain('\\end{document}')
  })

  it('treats an extension-less name as a .tex stub', () => {
    const c = defaultFileContent('untitled')
    expect(c).toContain('\n')
    expect(c).not.toContain('\\n')
    expect(c).toContain('\\documentclass{article}')
  })

  it('produces a real multi-line .bib skeleton', () => {
    const c = defaultFileContent('refs.bib')
    expect(c).toContain('\n')
    expect(c).not.toContain('\\n')
    expect(c).toContain('@article{example,')
    expect(c).toContain('title={Example},')
  })

  it('returns empty content for non-text extensions', () => {
    expect(defaultFileContent('logo.png')).toBe('')
  })

  it('judges by basename, so an extension-less file in a dotted directory is a .tex stub', () => {
    expect(defaultFileContent('v1.2/intro')).toContain('\\documentclass{article}')
    expect(defaultFileContent('sec.2/notes')).toContain('\\documentclass{article}')
  })

  it('matches extensions case-insensitively', () => {
    expect(defaultFileContent('notes.TEX')).toContain('\\documentclass{article}')
    expect(defaultFileContent('refs.BIB')).toContain('@article{example,')
  })
})
