import { expect, it } from 'vitest'
import type { TexError } from '../types'
import { previewErrorsCovered } from './preview-diagnostics'

const error: TexError = {
  severity: 'error',
  message: 'Undefined control sequence.',
  file: 'a.tex',
  line: 7,
}
it('admits a prefix subset of existing errors without accepting a new location or occurrence', () => {
  expect(previewErrorsCovered([error, error], [error])).toBe(true)
  expect(previewErrorsCovered([error], [error, error])).toBe(false)
  expect(previewErrorsCovered([error], [{ ...error, line: 8 }])).toBe(false)
  expect(previewErrorsCovered([error], [{ ...error, file: 'b.tex' }])).toBe(false)
  expect(previewErrorsCovered([error], [{ ...error, message: 'New error' }])).toBe(false)
  expect(previewErrorsCovered([], [error])).toBe(false)
})
it('does not treat unverified zero-line context as a source location', () => {
  expect(
    previewErrorsCovered([{ ...error, line: 0 }], [{ ...error, line: 0, file: 'b.tex' }]),
  ).toBe(true)
  expect(previewErrorsCovered([{ ...error, line: 0 }], [error])).toBe(false)
})
it('ignores warnings and never promotes one into an existing error', () => {
  expect(previewErrorsCovered([], [{ ...error, severity: 'warning' }])).toBe(true)
  expect(previewErrorsCovered([{ ...error, severity: 'warning' }], [error])).toBe(false)
})
