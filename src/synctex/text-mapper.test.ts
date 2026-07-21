import type * as pdfjsLib from 'pdfjs-dist'
import { describe, expect, it } from 'vitest'
import { TextMapper } from './text-mapper'

// Mock PDFPageProxy with minimal getTextContent + getViewport
function mockPage(
  items: Array<{ str: string; transform: number[]; width: number; height: number }>,
) {
  return {
    getTextContent: async () => ({ items }),
    getViewport: (_opts: { scale: number }) => ({
      height: 800,
      width: 600,
      // Standard non-rotated page: flip Y from bottom-left to top-left origin
      convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
    }),
  } as unknown as pdfjsLib.PDFPageProxy
}

/** Create a mockPage, index it, and return the mapper for lookups. */
async function indexItems(
  mapper: TextMapper,
  items: Array<{ str: string; transform: number[]; width: number; height: number }>,
  pageNum = 1,
) {
  await mapper.indexPage(mockPage(items), pageNum)
}

const HELLO_WORLD_ITEM = {
  str: 'Hello World',
  transform: [1, 0, 0, 1, 100, 700],
  width: 80,
  height: 12,
}

describe('TextMapper', () => {
  it('indexes a page and finds text by position', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'line one\nHello World\nline three')

    await indexItems(mapper, [HELLO_WORLD_ITEM])

    const result = mapper.lookup(1, 140, 100) // y=800-700=100
    expect(result).toEqual({ file: 'main.tex', line: 2 })
  })

  it('returns null for empty page', () => {
    const mapper = new TextMapper()
    expect(mapper.lookup(1, 0, 0)).toBeNull()
  })

  it('returns null when text not found in source', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'completely different content')

    await indexItems(mapper, [
      { str: 'XYZ not in source', transform: [1, 0, 0, 1, 100, 700], width: 80, height: 12 },
    ])

    expect(mapper.lookup(1, 140, 100)).toBeNull()
  })

  it('finds closest block when multiple exist', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'First line\nSecond line\nThird line')

    await indexItems(mapper, [
      { str: 'First line', transform: [1, 0, 0, 1, 100, 750], width: 70, height: 12 },
      { str: 'Second line', transform: [1, 0, 0, 1, 100, 700], width: 80, height: 12 },
      { str: 'Third line', transform: [1, 0, 0, 1, 100, 650], width: 75, height: 12 },
    ])

    // Click near "Second line" (y=800-700=100)
    const result = mapper.lookup(1, 140, 100)
    expect(result).toEqual({ file: 'main.tex', line: 2 })
  })

  it('uses partial match for long text', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'short\nThe quick brown fox jumps over the lazy dog\nend')

    await indexItems(mapper, [
      { str: 'The quick brown', transform: [1, 0, 0, 1, 100, 700], width: 100, height: 12 },
    ])

    const result = mapper.lookup(1, 150, 100)
    expect(result).toEqual({ file: 'main.tex', line: 2 })
  })

  it('clears indexed data', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'Hello')

    await indexItems(mapper, [
      { str: 'Hello', transform: [1, 0, 0, 1, 100, 700], width: 40, height: 12 },
    ])

    mapper.clear()
    expect(mapper.lookup(1, 140, 100)).toBeNull()
  })

  it('drops stale source files when the source set is replaced', async () => {
    const mapper = new TextMapper()
    mapper.setSources([['stale.tex', 'Hello World']])
    await indexItems(mapper, [HELLO_WORLD_ITEM])
    expect(mapper.lookup(1, 140, 100)).toEqual({ file: 'stale.tex', line: 1 })

    // A later compile registers a different file set: stale.tex is gone from the
    // project and must no longer be a candidate for inverse search.
    mapper.setSources([['current.tex', 'Completely different content']])
    expect(mapper.lookup(1, 140, 100)).toBeNull()
  })

  it('searches multiple source files', async () => {
    const mapper = new TextMapper()
    mapper.setSource('main.tex', 'Main content')
    mapper.setSource('chapter1.tex', 'Chapter one text here')

    await indexItems(mapper, [
      { str: 'Chapter one text here', transform: [1, 0, 0, 1, 100, 700], width: 120, height: 12 },
    ])

    const result = mapper.lookup(1, 160, 100)
    expect(result).toEqual({ file: 'chapter1.tex', line: 1 })
  })

  it('forward lookup finds PDF position for a source line', async () => {
    const mapper = new TextMapper()
    mapper.setSource(
      'main.tex',
      '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
    )

    await indexItems(mapper, [HELLO_WORLD_ITEM])

    const result = mapper.forwardLookup('main.tex', 3) // "Hello World" is line 3
    // y = (800 - 700) - 12 = 88 (top of text, not baseline)
    expect(result).toEqual({ page: 1, x: 100, y: 88, width: 80, height: 12 })
  })

  it('falls back to font scale when pdf.js reports height 0', async () => {
    // pdf.js can emit `height: 0` for some glyph runs. 0 is not a usable height, so the
    // block must fall back to the font scale |tx[3]| — otherwise the block keeps its
    // baseline as the top (y unshifted) and a zero-height box, biasing closest-block math.
    const mapper = new TextMapper()
    mapper.setSource(
      'main.tex',
      '\\documentclass{article}\n\\begin{document}\nHello World\n\\end{document}',
    )
    await indexItems(mapper, [
      { str: 'Hello World', transform: [12, 0, 0, 12, 100, 700], width: 80, height: 0 },
    ])
    const result = mapper.forwardLookup('main.tex', 3)
    // height falls back to |tx[3]| = 12 → y = (800 - 700) - 12 = 88, not the baseline 100
    expect(result).toEqual({ page: 1, x: 100, y: 88, width: 80, height: 12 })
  })

  it('forward lookup returns null for TeX-only lines', async () => {
    const mapper = new TextMapper()
    mapper.setSource(
      'main.tex',
      '\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}',
    )

    await indexItems(mapper, [
      { str: 'Hello', transform: [1, 0, 0, 1, 100, 700], width: 40, height: 12 },
    ])

    // Line 1 is "\\documentclass{article}" — no meaningful text fragments (< 3 chars after stripping)
    const result = mapper.forwardLookup('main.tex', 1)
    expect(result).toBeNull()
  })

  it('forward lookup returns null for unknown file', () => {
    const mapper = new TextMapper()
    expect(mapper.forwardLookup('unknown.tex', 1)).toBeNull()
  })
})
