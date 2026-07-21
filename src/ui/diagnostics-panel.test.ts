import { describe, expect, it } from 'vitest'
import { hasErrorsOrWarnings } from './diagnostics-panel'

describe('hasErrorsOrWarnings', () => {
  it('is false for no diagnostics', () => {
    expect(hasErrorsOrWarnings([])).toBe(false)
  })

  it('is false for info-only diagnostics (panel stays collapsed)', () => {
    expect(hasErrorsOrWarnings([{ severity: 'info' }])).toBe(false)
  })

  it('is true when a warning is present', () => {
    expect(hasErrorsOrWarnings([{ severity: 'warning' }])).toBe(true)
  })

  it('is true when an error is present', () => {
    expect(hasErrorsOrWarnings([{ severity: 'error' }])).toBe(true)
  })

  it('is true for a mix of info and warning', () => {
    expect(hasErrorsOrWarnings([{ severity: 'info' }, { severity: 'warning' }])).toBe(true)
  })
})
