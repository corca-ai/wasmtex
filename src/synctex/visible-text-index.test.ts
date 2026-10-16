import { expect, it } from 'vitest'
import { LatexSyntaxService } from '../syntax'
import { VisibleTextIndex } from './visible-text-index'
import { projectVisibleTextSource } from './visible-text-source'

function source(content: string, path = 'main.tex') {
  const syntax = new LatexSyntaxService().upsert({
    fileId: 'stable',
    path,
    content,
    documentVersion: 3,
  })
  return projectVisibleTextSource(content, syntax)
}

it('connects styled title source fragments to renderer-neutral disjoint PDF boxes', () => {
  const content = String.raw`\title{An \emph{Introduction} to Linear Algebra}`
  const index = new VisibleTextIndex()
  index.setSources([source(content)])
  const ranges: number[][] = []
  index.setPage({
    page: 1,
    text: 'An Introduction\nto Linear Algebra',
    rangeRects(start, end) {
      ranges.push([start, end])
      return [
        { page: 1, x: 10, y: 10, width: 90, height: 15 },
        { page: 1, x: 10, y: 30, width: 95, height: 15 },
      ]
    },
  })
  const fragment = index.sourceFragments('stable', content.indexOf('Introduction'))[0]!
  expect(fragment.text).toBe('an introduction to linear algebra')
  const pdf = index.findPdf(fragment.text)
  expect(pdf.truncated).toBe(false)
  expect(pdf.candidates[0]?.regions).toHaveLength(2)
  expect(ranges).toEqual([[0, 33]])
  const inverse = index.findSources('Introduction to Linear Algebra')
  expect(inverse.candidates).toHaveLength(1)
  expect(inverse.candidates[0]).toMatchObject({
    file: 'main.tex',
    line: 1,
    column: 17,
    kind: 'metadata',
  })
  expect(content.slice(inverse.candidates[0]!.start, inverse.candidates[0]!.end)).toBe(
    'Introduction} to Linear Algebra',
  )
})

it('returns duplicate source candidates and retires renamed/removed inventories', () => {
  const index = new VisibleTextIndex()
  index.setSources([source('Repeated phrase.\n\nRepeated phrase.')])
  expect(index.findSources('Repeated phrase').candidates).toHaveLength(2)
  index.setSources([source('Repeated phrase.', 'renamed.tex')])
  expect(index.findSources('Repeated phrase').candidates.map(({ file }) => file)).toEqual([
    'renamed.tex',
  ])
  index.setSources([])
  expect(index.findSources('Repeated phrase').candidates).toEqual([])
})

it('uses literal PDF evidence first and labels optional dehyphenation', () => {
  const index = new VisibleTextIndex()
  index.setPage({ page: 1, text: 're-\nsign a docu-\nment', rangeRects: () => [] })
  expect(index.findPdf('re-sign', { dehyphenate: true }).candidates[0]?.method).toBe('exact')
  expect(index.findPdf('document').candidates).toEqual([])
  expect(index.findPdf('document', { dehyphenate: true }).candidates[0]).toMatchObject({
    method: 'dehyphenated',
    start: 11,
    end: 21,
  })
})

it('evicts old pages and clears prior compile geometry explicitly', () => {
  const index = new VisibleTextIndex()
  for (let page = 1; page <= 9; page++)
    index.setPage({ page, text: `Unique content page ${page}.`, rangeRects: () => [] })
  expect(index.findPdf('page 1.').candidates).toEqual([])
  expect(index.findPdf('page 9.').candidates).toHaveLength(1)
  index.clearPages()
  expect(index.findPdf('page 9.').candidates).toEqual([])
})
