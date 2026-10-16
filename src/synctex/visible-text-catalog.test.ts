import { expect, it } from 'vitest'
import { VisibleTextCatalog } from './visible-text-catalog'
import { normalizeNavigationText } from './visible-text-normalize'

it('returns every original range and context evidence without choosing a duplicate', () => {
  const catalog = new VisibleTextCatalog<string>()
  catalog.add('a', normalizeNavigationText('First ﬃ example, then another ﬃ example.'))
  const result = catalog.find('ffi example', { contextBefore: 'another' })
  expect(result.truncated).toBe(false)
  expect(result.candidates).toHaveLength(2)
  expect(result.candidates.map(({ start, end }) => [start, end])).toEqual([
    [6, 15],
    [30, 39],
  ])
  expect(result.candidates.map(({ contextBefore }) => contextBefore)).toEqual([0, 7])
})

it('reports incomplete admission and candidate clipping instead of apparent uniqueness', () => {
  const catalog = new VisibleTextCatalog<string>(100, 1)
  expect(catalog.add('a', normalizeNavigationText('Repeated phrase. Repeated phrase.'))).toBe(true)
  expect(catalog.add('b', normalizeNavigationText('Repeated phrase.'))).toBe(false)
  const result = catalog.find('Repeated phrase', { maxCandidates: 1 })
  expect(result.candidates).toHaveLength(1)
  expect(result.truncated).toBe(true)
})

it('refuses short tokens and skips unrelated indexed blocks', () => {
  const catalog = new VisibleTextCatalog<number>()
  for (let index = 0; index < 1000; index++)
    catalog.add(index, normalizeNavigationText(`Unrelated content ${index}`))
  catalog.add(1000, normalizeNavigationText('A unique Korean 한글 구절.'))
  expect(catalog.find('the').candidates).toEqual([])
  expect(catalog.find('한글 구절').candidates.map(({ owner }) => owner)).toEqual([1000])
  expect(catalog.find('no such indexed phrase')).toEqual({ candidates: [], truncated: false })
})
