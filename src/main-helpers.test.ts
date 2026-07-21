import { describe, expect, it } from 'vitest'
import { mergeDiagnostics, type PanelDiagnostic, resolveAddFile } from './main-helpers'

const diag = (message: string, severity = 'error'): PanelDiagnostic => ({
  line: 1,
  message,
  severity,
})

describe('mergeDiagnostics', () => {
  it('shows compile errors and static diagnostics together', () => {
    const compileErr = diag('compile boom')
    const lint = diag('unused-bib-entry', 'warning')
    const merged = mergeDiagnostics([compileErr], [lint])
    expect(merged).toContain(compileErr)
    expect(merged).toContain(lint)
    expect(merged).toHaveLength(2)
  })

  it('keeps both sets even when one is empty', () => {
    expect(mergeDiagnostics([], [diag('x')])).toHaveLength(1)
    expect(mergeDiagnostics([diag('y')], [])).toHaveLength(1)
  })
})

describe('resolveAddFile', () => {
  const exists = (p: string) => p === 'main.tex'

  it('cancels on empty/whitespace/null input', () => {
    expect(resolveAddFile(null, exists)).toEqual({ action: 'cancel' })
    expect(resolveAddFile('', exists)).toEqual({ action: 'cancel' })
    expect(resolveAddFile('   ', exists)).toEqual({ action: 'cancel' })
  })

  it('opens (does NOT overwrite) an existing file', () => {
    expect(resolveAddFile('main.tex', exists)).toEqual({ action: 'open', path: 'main.tex' })
  })

  it('creates a new file when the name is free', () => {
    expect(resolveAddFile('new.tex', exists)).toEqual({ action: 'create', path: 'new.tex' })
  })

  it('trims the path before deciding', () => {
    expect(resolveAddFile('  main.tex  ', exists)).toEqual({ action: 'open', path: 'main.tex' })
  })
})
