import { expect, it } from 'vitest'
import { projectVisiblePdfText } from './visible-pdf-text'

it('preserves a literal line-end hyphen before optional dehyphenation', () => {
  const text = 'We re-\nsign the docu-\nment.'
  expect(projectVisiblePdfText(text).map(({ normalized }) => normalized.text)).toEqual([
    'we re-sign the docu-ment.',
  ])
  const variants = projectVisiblePdfText(text, true)
  expect(variants.map(({ normalized }) => normalized.text)).toEqual([
    'we re-sign the docu-ment.',
    'we resign the document.',
  ])
  const normalized = variants[1]!.normalized
  const offset = normalized.text.indexOf('document')
  expect(text.slice(normalized.starts[offset], normalized.ends[offset + 7])).toBe('docu-\nment')
})

it('keeps ordinary hyphens, list markers and whitespace offsets', () => {
  const text = '-\nitem and non-linear text.\n Next line.'
  const result = projectVisiblePdfText(text, true)
  expect(result).toHaveLength(1)
  expect(result[0]!.normalized.text).toBe('- item and non-linear text. next line.')
})
