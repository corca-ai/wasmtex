import { describe, expect, it } from 'vitest'
import { mergeTailSynctex } from './synctex-merge'
import { type SynctexData, type SynctexNode, SynctexParser } from './synctex-parser'

function node(
  partial: Partial<SynctexNode> & Pick<SynctexNode, 'input' | 'line' | 'page'>,
): SynctexNode {
  return {
    type: 'hbox',
    column: 0,
    h: 100,
    v: 200,
    width: 50,
    height: 10,
    depth: 0,
    parent: null,
    children: [],
    ...partial,
  }
}

function data(inputs: Record<number, string>, pages: Record<number, SynctexNode[]>): SynctexData {
  return {
    inputs: new Map(Object.entries(inputs).map(([k, v]) => [Number(k), v])),
    pages: new Map(Object.entries(pages).map(([k, v]) => [Number(k), v])),
    magnification: 1000,
    unit: 1,
    xOffset: 0,
    yOffset: 0,
  }
}

const parser = new SynctexParser()

describe('mergeTailSynctex (#99 Phase 2)', () => {
  it('offsets tail pages, remaps the tail file tag to main, and offsets source lines', () => {
    // head: main.tex is tag 3, occupies pages 1..2 (doc lines 4 and 9).
    const head = data(
      { 3: 'main.tex', 5: 'preamble.sty' },
      { 1: [node({ input: 3, line: 4, page: 1 })], 2: [node({ input: 3, line: 9, page: 2 })] },
    )
    // tail: compiled as tail.tex (tag 1), one page, tail-relative line 2.
    const tail = data(
      { 1: 'tail.tex', 2: 'tail.aux' },
      { 1: [node({ input: 1, line: 2, page: 1, h: 120, v: 250, width: 40 })] },
    )

    const merged = mergeTailSynctex({
      head,
      tail,
      headPageCount: 2,
      tailLineOffset: 10,
      mainFile: 'main.tex',
      tailFile: 'tail.tex',
    })!
    expect(merged).not.toBeNull()

    // 3 pages: head 1,2 + tail page 1 → 3.
    expect([...merged.pages.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3])
    const tailNode = merged.pages.get(3)![0]!
    expect(tailNode.page).toBe(3) // page offset by headPageCount
    expect(tailNode.input).toBe(3) // tail.tex tag(1) → main.tex tag(3)
    expect(tailNode.line).toBe(12) // 2 + tailLineOffset(10)
    // Head nodes untouched.
    expect(merged.pages.get(1)![0]!.line).toBe(4)
    expect(merged.inputs.get(3)).toBe('main.tex')

    // friendIndex rebuilt with the remapped tag + offset line.
    expect(merged.friendIndex!.get('3:12')).toHaveLength(1)
    expect(merged.friendIndex!.get('3:4')).toHaveLength(1)
    // pageRoots rebuilt (all three nodes are parentless roots on their pages).
    expect(merged.pageRoots!.get(3)).toHaveLength(1)
  })

  it('inverse + forward lookups on the merged data resolve the tail to main.tex doc lines', () => {
    const head = data({ 3: 'main.tex' }, { 1: [node({ input: 3, line: 4, page: 1 })] })
    const tail = data(
      { 1: 'tail.tex' },
      { 1: [node({ input: 1, line: 5, page: 1, h: 120, v: 250, width: 40, height: 8 })] },
    )
    const merged = mergeTailSynctex({
      head,
      tail,
      headPageCount: 1,
      tailLineOffset: 20,
      mainFile: 'main.tex',
      tailFile: 'tail.tex',
    })!

    // Forward: main.tex line 25 (= tail line 5 + 20) lands on the spliced tail page 2.
    const fwd = parser.forwardLookup(merged, 'main.tex', 25)
    expect(fwd).not.toBeNull()
    expect(fwd!.page).toBe(2)

    // Inverse: clicking the tail node's position returns main.tex line 25 (not the tail line 5).
    const inv = parser.inverseLookup(merged, 2, 121, 250)
    expect(inv).not.toBeNull()
    expect(inv!.line).toBe(25)
    expect(inv!.file).toBe('main.tex')
  })

  it('preserves the head input tags and scalars', () => {
    const head = data({ 7: 'main.tex' }, { 1: [node({ input: 7, line: 1, page: 1 })] })
    head.magnification = 1000
    head.unit = 1
    const tail = data({ 1: 'tail.tex' }, { 1: [node({ input: 1, line: 1, page: 1 })] })
    const merged = mergeTailSynctex({
      head,
      tail,
      headPageCount: 1,
      tailLineOffset: 3,
      mainFile: 'main.tex',
      tailFile: 'tail.tex',
    })!
    expect(merged.inputs.get(7)).toBe('main.tex')
    expect(merged.magnification).toBe(1000)
  })

  it('returns null (→ reconcile) for a multi-file tail (an \\input chapter)', () => {
    const head = data({ 3: 'main.tex' }, { 1: [node({ input: 3, line: 1, page: 1 })] })
    const tail = data(
      { 1: 'tail.tex', 2: 'chapter5.tex' },
      { 1: [node({ input: 1, line: 1, page: 1 }), node({ input: 2, line: 4, page: 1 })] },
    )
    expect(
      mergeTailSynctex({
        head,
        tail,
        headPageCount: 1,
        tailLineOffset: 5,
        mainFile: 'main.tex',
        tailFile: 'tail.tex',
      }),
    ).toBeNull()
  })

  it('returns null when the main or tail tag cannot be found', () => {
    const head = data({ 3: 'other.tex' }, { 1: [node({ input: 3, line: 1, page: 1 })] })
    const tail = data({ 1: 'tail.tex' }, { 1: [node({ input: 1, line: 1, page: 1 })] })
    expect(
      mergeTailSynctex({
        head,
        tail,
        headPageCount: 1,
        tailLineOffset: 1,
        mainFile: 'main.tex',
        tailFile: 'tail.tex',
      }),
    ).toBeNull() // no main.tex in head
    const tail2 = data({ 1: 'other.tex' }, { 1: [node({ input: 1, line: 1, page: 1 })] })
    const head2 = data({ 3: 'main.tex' }, { 1: [node({ input: 3, line: 1, page: 1 })] })
    expect(
      mergeTailSynctex({
        head: head2,
        tail: tail2,
        headPageCount: 1,
        tailLineOffset: 1,
        mainFile: 'main.tex',
        tailFile: 'tail.tex',
      }),
    ).toBeNull() // no tail.tex in tail
  })

  it('drops the stale tail pages of the last full compile (keeps only head pages 1..H)', () => {
    // last full had 4 pages (head 1..2, old tail 3..4); merge must keep only 1..2 from head.
    const head = data(
      { 3: 'main.tex' },
      {
        1: [node({ input: 3, line: 4, page: 1 })],
        2: [node({ input: 3, line: 9, page: 2 })],
        3: [node({ input: 3, line: 40, page: 3 })], // stale old-tail page
        4: [node({ input: 3, line: 55, page: 4 })], // stale old-tail page
      },
    )
    const tail = data({ 1: 'tail.tex' }, { 1: [node({ input: 1, line: 2, page: 1 })] })
    const merged = mergeTailSynctex({
      head,
      tail,
      headPageCount: 2,
      tailLineOffset: 10,
      mainFile: 'main.tex',
      tailFile: 'tail.tex',
    })!
    // pages 3,4 from the stale full compile are gone; new tail is the only page 3.
    expect([...merged.pages.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3])
    expect(merged.pages.get(3)![0]!.line).toBe(12) // the tail node, not the stale line 40
  })
})
