import { gzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { SynctexParser } from '../synctex'
import { mergeTailSynctex } from './synctex-merge'

function synctex(records: string, count = 2) {
  return `SyncTeX Version:1
Input:1:./main.tex
Input:2:./classes/article.cls
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
${records}
Postamble:
Count:${count}
`
}

const fixture = synctex(
  `{1
[1,0:0,49825690:34611850,49825690,0
(1,10,4:6578176,13156352:3289088,657818,0
h1,10,4:6578176,13156352:1315635,657818,0
)
(1,10,4:19734528,13156352:3289088,657818,0
h1,10,4:19734528,13156352:1315635,657818,0
)
(2,40:6578176,26312704:3289088,657818,0
h2,40:6578176,26312704:1315635,657818,0
)
]
}1
{2
(1,10,4:6578176,6578176:3289088,657818,0
h1,10,4:6578176,6578176:1315635,657818,0
)
}2`,
  9,
)

const parser = new SynctexParser()
const parseText = (text: string) => parser.parse(new TextEncoder().encode(text))

describe('detailed SyncTeX queries through the public entry', () => {
  it('reports source columns and contained geometry without changing the legacy result', async () => {
    const data = await parseText(fixture)
    const match = parser.inverseLookupDetailed(data, 1, 105, 195)
    expect(match?.source).toEqual({ file: 'main.tex', line: 10, column: 4 })
    expect(match?.match).toBe('contains')
    expect(match?.distance).toBe(0)
    expect(match?.region.page).toBe(1)
    expect(match?.container).not.toBeNull()
    expect(parser.inverseLookup(data, 1, 105, 195)).toEqual({ file: 'main.tex', line: 10 })
    expect(JSON.parse(JSON.stringify(match))).toEqual(match)
  })

  it('distinguishes a nearby selection from a contained node', async () => {
    const data = await parseText(fixture)
    const match = parser.inverseLookupDetailed(data, 1, 10, 10)
    expect(match?.match).toBe('nearby')
    expect(match?.distance).toBeCloseTo(270, 2)
    expect(match?.source).toMatchObject(parser.inverseLookup(data, 1, 10, 10) ?? {})
  })

  it('keeps the selected page and disjoint columns while exposing the matched line', async () => {
    const data = await parseText(fixture)
    const exact = parser.forwardLookupDetailed(data, 'main.tex', 10)
    const nearby = parser.forwardLookupDetailed(data, 'main.tex', 9)
    expect(exact?.match).toBe('exact')
    expect(exact?.source).toEqual({ file: 'main.tex', line: 10 })
    expect(exact?.requestedLine).toBe(10)
    expect(exact?.regions).toHaveLength(2)
    expect(exact?.regions.every((region) => region.page === 1)).toBe(true)
    expect(exact?.regions[1]?.x).toBeGreaterThan(250)
    expect(nearby).toEqual({ ...exact, requestedLine: 9, match: 'nearby' })
    expect(parser.forwardLookupAll(data, 'main.tex', 9)).toEqual(nearby?.regions)
    expect(parser.forwardLookup(data, 'main.tex', 9)).toEqual(nearby?.regions[0])
    expect(parser.forwardLookupDetailed(data, 'main.tex', 7)?.source.line).toBe(10)
    expect(parser.forwardLookupDetailed(data, 'main.tex', 6)).toBeNull()
    expect(parser.forwardLookupDetailed(data, 'missing.tex', 10)).toBeNull()
  })

  it('filters inaccessible sources without returning a rejected fallback', async () => {
    const data = await parseText(fixture)
    expect(parser.inverseLookup(data, 1, 105, 395)?.file).toBe('classes/article.cls')
    const match = parser.inverseLookupDetailed(data, 1, 105, 395, {
      acceptSource: ({ file }) => file === 'main.tex',
    })
    expect(match?.source.file).toBe('main.tex')
    expect(match?.match).toBe('nearby')
    expect(match?.distance).toBeGreaterThan(0)
    expect(
      parser.inverseLookupDetailed(data, 1, 105, 395, { acceptSource: () => false }),
    ).toBeNull()
    expect(
      parser.forwardLookupDetailed(data, 'main.tex', 9, {
        acceptSource: ({ line }) => line === 10,
      })?.source.line,
    ).toBe(10)
    expect(
      parser.forwardLookupDetailed(data, 'main.tex', 10, { acceptSource: () => false }),
    ).toBeNull()
  })

  it('prefers an exact input name over a preceding matching suffix', async () => {
    const data = await parseText(fixture)
    data.inputs = new Map([
      [2, 'chapters/main.tex'],
      [1, 'main.tex'],
    ])
    expect(parser.forwardLookupDetailed(data, 'main.tex', 10)?.source.file).toBe('main.tex')
    expect(parser.forwardLookupDetailed(data, 'main.tex', 40)).toBeNull()
    expect(parser.forwardLookupDetailed(data, 'chapters/main.tex', 40)?.source).toEqual({
      file: 'chapters/main.tex',
      line: 40,
    })
  })

  it.each([
    657818, -657818,
  ])('describes signed kern geometry (%i) from its after-move position', async (width) => {
    const data = await parseText(
      synctex(`{1
(1,0:6578176,13156352:3289088,657818,0
k1,12,8:7893811,13156352:${width}
)
}1`),
    )
    const kern = data.pages.get(1)?.find((node) => node.type === 'kern')
    if (!kern) throw new Error('Missing kern fixture')
    const match = parser.inverseLookupDetailed(data, 1, kern.h - kern.width / 2, kern.v - 5)
    expect(match?.source).toEqual({ file: 'main.tex', line: 12, column: 8 })
    expect(match?.nodeType).toBe('kern')
    expect(match?.region.x).toBeCloseTo(Math.min(kern.h, kern.h - kern.width))
    expect(match?.region.width).toBeCloseTo(Math.abs(kern.width))
    expect(match?.region.height).toBeCloseTo(10)
    expect(match?.distance).toBe(0)
  })

  it.each([
    'g',
    '$',
  ])('reports %s markers as zero-width node geometry, not glyph ink', async (prefix) => {
    const data = await parseText(
      synctex(`{1
(1,0:6578176,13156352:3289088,657818,0
${prefix}1,12,8:7893811,13156352
)
}1`),
    )
    const marker = data.pages.get(1)?.find((node) => node.line === 12)
    if (!marker) throw new Error('Missing marker fixture')
    const match = parser.inverseLookupDetailed(data, 1, marker.h, marker.v - 5)
    expect(match?.source.line).toBe(12)
    expect(match?.region.width).toBe(0)
    expect(match?.region.height).toBeCloseTo(10)
    expect(match?.container?.x).toBeCloseTo(100)
    expect(match?.container?.y).toBeCloseTo(190)
    expect(match?.container?.width).toBeCloseTo(50)
    expect(match?.container?.height).toBeCloseTo(10)
    expect(match?.match).toBe('contains')
  })

  it('keeps parentless markers as points and rejects line-zero-only pages', async () => {
    const data = await parseText(
      synctex(
        `{1
g1,12:7893811,13156352
}1`,
        1,
      ),
    )
    const marker = data.pages.get(1)?.[0]
    if (!marker) throw new Error('Missing parentless marker fixture')
    const match = parser.inverseLookupDetailed(data, 1, marker.h, marker.v)
    expect(match?.region).toMatchObject({ width: 0, height: 0 })
    expect(match?.source).toEqual({ file: 'main.tex', line: 12 })
    expect(match?.container).toBeNull()
    const empty = await parseText(
      synctex(
        `{1
[1,0:0,49825690:34611850,49825690,0
]
}1`,
        1,
      ),
    )
    expect(parser.inverseLookupDetailed(empty, 1, 100, 100)).toBeNull()
    expect(parser.inverseLookupDetailed(data, 2, 100, 100)).toBeNull()
  })

  it('returns identical evidence from raw and gzip bytes', async () => {
    const plain = await parseText(fixture)
    const compressed = await parser.parse(gzipSync(fixture))
    expect(parser.inverseLookupDetailed(compressed, 1, 105, 195)).toEqual(
      parser.inverseLookupDetailed(plain, 1, 105, 195),
    )
    expect(parser.forwardLookupDetailed(compressed, 'main.tex', 9)).toEqual(
      parser.forwardLookupDetailed(plain, 'main.tex', 9),
    )
  })

  it('reports remapped source lines and pages from merged incremental data', async () => {
    const head = await parseText(fixture)
    const tail = await parseText(fixture.replace('Input:1:./main.tex', 'Input:1:./tail.tex'))
    const merged = mergeTailSynctex({
      head,
      tail,
      headPageCount: 2,
      tailLineOffset: 20,
      mainFile: 'main.tex',
      tailFile: 'tail.tex',
    })
    if (!merged) throw new Error('Fixture merge failed')
    const inverse = parser.inverseLookupDetailed(merged, 3, 105, 195)
    expect(inverse?.source).toEqual({ file: 'main.tex', line: 30, column: 4 })
    expect(inverse?.region.page).toBe(3)
    const forward = parser.forwardLookupDetailed(merged, 'main.tex', 29)
    expect(forward?.source).toEqual({ file: 'main.tex', line: 30 })
    expect(forward?.match).toBe('nearby')
    expect(forward?.regions.every((region) => region.page === 3)).toBe(true)
  })
})
