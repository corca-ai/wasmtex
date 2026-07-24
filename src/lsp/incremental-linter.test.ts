import { describe, expect, it, vi } from 'vitest'
import type { Diagnostic } from './diagnostic-provider'
import { IncrementalLinter } from './incremental-linter'

function diagnostic(file: string, message: string): Diagnostic {
  return {
    file,
    line: 1,
    column: 1,
    endColumn: 2,
    message,
    severity: 'info',
    code: 'test-lint',
  }
}

describe('IncrementalLinter', () => {
  it('re-lints only changed TeX files and preserves deterministic project order', () => {
    const lint = vi.fn((content: string, path: string) => [diagnostic(path, content)])
    const linter = new IncrementalLinter(true, lint)

    linter.updateFile('b.tex', 'b1')
    linter.updateFile('a.tex', 'a1')
    expect(linter.diagnostics(['a.tex', 'b.tex']).map((item) => item.message)).toEqual(['a1', 'b1'])
    expect(lint).toHaveBeenCalledTimes(2)

    linter.updateFile('a.tex', 'a2')
    linter.updateFile('b.tex', 'b1')

    expect(linter.diagnostics(['a.tex', 'b.tex']).map((item) => item.message)).toEqual(['a2', 'b1'])
    expect(lint).toHaveBeenCalledTimes(3)
  })

  it('drops cached diagnostics for removed, binary, and non-TeX files', () => {
    const lint = vi.fn((content: string, path: string) => [diagnostic(path, content)])
    const linter = new IncrementalLinter(true, lint)

    linter.updateFile('main.tex', 'first')
    linter.updateFile('notes.txt', 'ignored')
    linter.updateFile('main.tex', new Uint8Array([1, 2, 3]))
    expect(linter.diagnostics(['main.tex', 'notes.txt'])).toEqual([])

    linter.updateFile('main.tex', 'second')
    linter.removeFile('main.tex')
    expect(linter.diagnostics(['main.tex'])).toEqual([])
    expect(lint).toHaveBeenCalledTimes(2)
  })

  it('does no lint work when disabled', () => {
    const lint = vi.fn((content: string, path: string) => [diagnostic(path, content)])
    const linter = new IncrementalLinter(false, lint)

    linter.updateFile('main.tex', 'content')

    expect(linter.diagnostics(['main.tex'])).toEqual([])
    expect(lint).not.toHaveBeenCalled()
  })

  it('does not expose mutable cached diagnostics to callers', () => {
    const linter = new IncrementalLinter(true, (_content, path) => [diagnostic(path, 'original')])

    linter.updateFile('main.tex', 'content')
    linter.diagnostics(['main.tex'])[0]!.message = 'mutated'

    expect(linter.diagnostics(['main.tex'])[0]!.message).toBe('original')
  })
})
