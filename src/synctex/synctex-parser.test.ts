import { describe, expect, it } from 'vitest'
import type { SynctexData, SynctexNode } from './synctex-parser'
import { normalizeSynctexInputName, SynctexParser } from './synctex-parser'

describe('normalizeSynctexInputName', () => {
  it('strips the WASM working-dir prefix but keeps subdirectories', () => {
    // The bug: `chapters/./intro.tex` lost `chapters/` (forward/inverse search then
    // failed for any file in a subdirectory).
    expect(normalizeSynctexInputName('chapters/./intro.tex')).toBe('chapters/intro.tex')
    expect(normalizeSynctexInputName('/work/./chapters/./intro.tex')).toBe('chapters/intro.tex')
    expect(normalizeSynctexInputName('/work/./main.tex')).toBe('main.tex')
    expect(normalizeSynctexInputName('/work/main.tex')).toBe('main.tex')
    expect(normalizeSynctexInputName('./main.tex')).toBe('main.tex')
    expect(normalizeSynctexInputName('main.tex')).toBe('main.tex')
  })
})

/** Minimal synctex file with one page, two hboxes, and a kern */
const FIXTURE_BASIC = `SyncTeX Version:1
Input:1:./main.tex
Input:2:./chapter.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
!100
{1
[1,1:0,0:34611850,49825690,0
(1,3:4736286,3670016:25137278,655360,0
x1,3:4736286,3670016
h1,3:4736286,3670016:3078103,655360,0
)
(2,10:4736286,5242880:12000000,655360,0
h2,10:4736286,5242880:5000000,655360,0
)
]
}1
Postamble:
Count:6
`

/**
 * Fixture with multiple pages
 */
const FIXTURE_MULTI_PAGE = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
(1,5:4736286,3670016:25137278,655360,0
)
]
}1
{2
[1,1:0,0:34611850,49825690,0
(1,15:4736286,3670016:25137278,655360,0
)
]
}2
Postamble:
Count:4
`

/**
 * Fixture with column info (synctex 1.2+)
 */
const FIXTURE_WITH_COLUMNS = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
(1,7,5:4736286,3670016:25137278,655360,0
k1,7,5:4736286,3670016:100000
$1,7,10:6001000,3670016
)
}1
Postamble:
Count:3
`

/**
 * Fixture with non-standard magnification and unit
 */
const FIXTURE_SCALED = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:2000
Unit:2
X Offset:0
Y Offset:0
Content:
{1
(1,3:4736286,3670016:25137278,655360,0
)
}1
Postamble:
Count:1
`

/**
 * Fixture simulating paragraph line breaking: the parent hbox for a wrapped
 * paragraph line is tagged to the first line of the paragraph, while the
 * kern/glue nodes inside are tagged to the actual source line.
 * Line 16 has only kern/glue nodes — the enclosing hbox is tagged line 14.
 */
const FIXTURE_PARAGRAPH = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
(1,14:4736286,23068672:22609920,655360,196608
g1,16:10100000,23068672
k1,16:12800000,23068672
g1,16:13000000,23068672
k1,16:14300000,23068672
k1,16:15300000,23068672
)
]
}1
Postamble:
Count:7
`

/**
 * Fixture simulating \begin{itemize}\item First\item Second\end{itemize}
 * A vbox wraps both items (tagged to line 5 = Second Item's line),
 * plus each item has its own hbox at different v positions.
 * This tests that forwardLookup prefers hbox nodes over the spanning vbox.
 */
const FIXTURE_ITEMIZE = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
[1,5:4736286,3670016:25137278,1966080,0
(1,4:4736286,3014656:25137278,655360,0
h1,4:4736286,3014656:10000000,655360,0
)
(1,5:4736286,3670016:25137278,655360,0
h1,5:4736286,3670016:12000000,655360,0
)
]
]
}1
Postamble:
Count:6
`

/**
 * Fixture simulating equation environment: vbox wraps hboxes with vertical
 * padding between them. Clicks in padding area should still find nearest hbox.
 */
const FIXTURE_EQUATION = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
[1,8:4736286,4000000:25137278,3000000,500000
(1,9:4736286,2500000:25137278,655360,0
h1,9:4736286,2500000:10000000,655360,0
)
(1,10:4736286,4000000:25137278,655360,0
h1,10:4736286,4000000:10000000,655360,0
)
]
]
}1
Postamble:
Count:6
`

/**
 * Fixture with WASM-style paths (/work/./)
 */
const FIXTURE_WASM_PATHS = `SyncTeX Version:1
Input:1:/work/./main.tex
Input:2:/work/./includes/chapter.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
(1,3:4736286,3670016:25137278,655360,0
)
}1
Postamble:
Count:1
`

/**
 * Fixture with Input entries appearing mid-content (multi-file \input)
 * pdfTeX adds Input lines when \input{file} opens a new file during compilation
 */
const FIXTURE_MID_CONTENT_INPUTS = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
(1,3:4736286,3670016:25137278,655360,0
)
Input:7:./algebra.tex
(7,5:4736286,5242880:25137278,655360,0
)
Input:8:/work/./analysis.tex
(8,10:4736286,6815744:25137278,655360,0
)
]
}1
Postamble:
Count:5
`

/**
 * Fixture with zero-width anchor hboxes on a later page.
 * Simulates pdfTeX's \begin{document} (line 5) emitting invisible anchor
 * markers on page 2, while real content (\maketitle) is at line 7 on page 1.
 */
const FIXTURE_ZERO_WIDTH_ANCHORS = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,1:0,0:34611850,49825690,0
(1,7:4736286,3670016:25137278,655360,0
h1,7:4736286,3670016:10000000,655360,0
)
]
}1
{2
[1,1:0,0:34611850,49825690,0
(1,5:4736286,3670016:0,655360,196608
)
(1,5:10000000,3670016:0,655360,196608
)
]
}2
Postamble:
Count:5
`

// Conversion factor for default settings (unit=1, mag=1000)
// pdf_pt = sp * 1 * 1000/1000 / 65536 * 72/72.27
const SP_TO_PDF = (1 / 65536) * (72 / 72.27)

describe('SynctexParser', () => {
  const parser = new SynctexParser()

  describe('parseText', () => {
    it('parses preamble correctly', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      expect(data.magnification).toBe(1000)
      expect(data.unit).toBe(1)
      expect(data.xOffset).toBe(0)
      expect(data.yOffset).toBe(0)
    })

    it('parses input file mappings', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      expect(data.inputs.size).toBe(2)
      expect(data.inputs.get(1)).toBe('main.tex')
      expect(data.inputs.get(2)).toBe('chapter.tex')
    })

    it('parses CRLF-terminated input identically to LF (no trailing \\r, content not skipped)', () => {
      // A SyncTeX file authored/normalized with Windows line endings must parse the same:
      // a trailing \r must not break the `Content:` trigger or leave 'main.tex\r' as the name.
      const data = parser.parseText(FIXTURE_BASIC.replace(/\n/g, '\r\n'))
      expect(data.inputs.get(1)).toBe('main.tex')
      expect(data.inputs.get(2)).toBe('chapter.tex')
      expect(data.pages.has(1)).toBe(true)
      expect(data.pages.get(1)!.length).toBeGreaterThan(0)
    })

    it('strips ./ prefix from input filenames', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      // "./main.tex" should become "main.tex"
      expect(data.inputs.get(1)).toBe('main.tex')
    })

    it('strips /work/./ prefix from WASM paths', () => {
      const data = parser.parseText(FIXTURE_WASM_PATHS)
      expect(data.inputs.get(1)).toBe('main.tex')
      expect(data.inputs.get(2)).toBe('includes/chapter.tex')
    })

    it('parses Input entries that appear mid-content', () => {
      const data = parser.parseText(FIXTURE_MID_CONTENT_INPUTS)
      expect(data.inputs.size).toBe(3)
      expect(data.inputs.get(1)).toBe('main.tex')
      expect(data.inputs.get(7)).toBe('algebra.tex')
      expect(data.inputs.get(8)).toBe('analysis.tex')
      // Nodes from included files should be parsed correctly
      const nodes = data.pages.get(1)!
      const algebraNode = nodes.find((n) => n.input === 7 && n.line === 5)
      expect(algebraNode).toBeDefined()
      const analysisNode = nodes.find((n) => n.input === 8 && n.line === 10)
      expect(analysisNode).toBeDefined()
    })

    it('parses nodes on page 1', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      expect(data.pages.has(1)).toBe(true)
      const nodes = data.pages.get(1)!
      // Should have: 1 vbox, 2 hboxes, 1 kern, 2 void_hboxes = 6 nodes
      expect(nodes.length).toBeGreaterThan(0)

      // Check the first hbox node (tag=1, line=3)
      const hbox = nodes.find((n) => n.type === 'hbox' && n.line === 3)
      expect(hbox).toBeDefined()
      expect(hbox!.input).toBe(1)
      expect(hbox!.line).toBe(3)
    })

    it('converts coordinates from sp to PDF points', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const nodes = data.pages.get(1)!

      // hbox at h=4736286, v=3670016 sp
      const hbox = nodes.find((n) => n.type === 'hbox' && n.input === 1 && n.line === 3)!
      expect(hbox.h).toBeCloseTo(4736286 * SP_TO_PDF, 1)
      expect(hbox.v).toBeCloseTo(3670016 * SP_TO_PDF, 1)
      expect(hbox.width).toBeCloseTo(25137278 * SP_TO_PDF, 1)
    })

    it('preserves the sign of a negative kern width (left move)', () => {
      // A negative kern moves the reference point LEFT; its signed width drives the
      // w<0 branch of hOrderedDistance. abs()-ing it away put the kern's geometry on
      // the wrong side, mislocating inverse-search clicks near negative kerns.
      const FIXTURE_NEG_KERN = `SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
!100
{1
[1,1:0,0:34611850,49825690,0
k1,3:5000000,3670016:-300000,655360,0
]
}1
Postamble:
Count:2
`
      const data = parser.parseText(FIXTURE_NEG_KERN)
      const kern = data.pages.get(1)!.find((n) => n.type === 'kern')!
      expect(kern).toBeDefined()
      expect(kern.width).toBeCloseTo(-300000 * SP_TO_PDF, 1)
      expect(kern.width).toBeLessThan(0)
    })

    it('parses nodes from different input files', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const nodes = data.pages.get(1)!

      // Node from chapter.tex (input tag=2, line=10)
      const chapterNode = nodes.find((n) => n.input === 2 && n.line === 10)
      expect(chapterNode).toBeDefined()
      expect(chapterNode!.type === 'hbox' || chapterNode!.type === 'void_hbox').toBe(true)
    })

    it('parses multiple pages', () => {
      const data = parser.parseText(FIXTURE_MULTI_PAGE)

      expect(data.pages.size).toBe(2)
      expect(data.pages.has(1)).toBe(true)
      expect(data.pages.has(2)).toBe(true)

      // Page 1 has line 5, page 2 has line 15
      const p1Nodes = data.pages.get(1)!
      const p2Nodes = data.pages.get(2)!
      expect(p1Nodes.some((n) => n.line === 5)).toBe(true)
      expect(p2Nodes.some((n) => n.line === 15)).toBe(true)
    })

    it('parses column info when present', () => {
      const data = parser.parseText(FIXTURE_WITH_COLUMNS)
      const nodes = data.pages.get(1)!

      const hbox = nodes.find((n) => n.type === 'hbox')!
      expect(hbox.column).toBe(5)
      expect(hbox.line).toBe(7)

      const math = nodes.find((n) => n.type === 'math')!
      expect(math.column).toBe(10)
    })

    it('handles kern nodes with width only', () => {
      const data = parser.parseText(FIXTURE_WITH_COLUMNS)
      const nodes = data.pages.get(1)!

      const kern = nodes.find((n) => n.type === 'kern')
      expect(kern).toBeDefined()
      expect(kern!.width).toBeCloseTo(100000 * SP_TO_PDF, 1)
    })

    it('applies magnification and unit scaling', () => {
      const data = parser.parseText(FIXTURE_SCALED)
      const nodes = data.pages.get(1)!

      // With unit=2 and mag=2000:
      // pdf_pt = sp * 2 * 2000/1000 / 65536 * 72/72.27 = sp * 4 / 65536 * 72/72.27
      const scaledFactor = ((2 * 2000) / (1000 * 65536)) * (72 / 72.27)

      const hbox = nodes.find((n) => n.type === 'hbox')!
      expect(hbox.h).toBeCloseTo(4736286 * scaledFactor, 1)
    })

    it('keeps default magnification when the preamble value is empty (NaN guard)', () => {
      // Bug: `Magnification:` with no value → parseInt('') === NaN, which silently
      // poisons every node coordinate (all become NaN). Guard must retain the default.
      const FIXTURE_EMPTY_MAG = `SyncTeX Version:1
Input:1:./main.tex
Magnification:
Unit:1
X Offset:0
Y Offset:0
Content:
{1
[1,3:4736286,3670016:25137278,361944,0
]
}1
Postamble:
`
      const data = parser.parseText(FIXTURE_EMPTY_MAG)
      expect(Number.isFinite(data.magnification)).toBe(true)
      expect(data.magnification).toBe(1000)
      const node = data.pages.get(1)!.find((n) => n.type === 'vbox')!
      expect(Number.isFinite(node.h)).toBe(true)
      expect(Number.isFinite(node.width)).toBe(true)
    })

    it('keeps default unit when the preamble value is zero (collapse guard)', () => {
      // Bug: `Unit:0` collapses every node to (0,0) with zero size. 0 is not a valid
      // scale factor; the guard must retain the default unit of 1.
      const FIXTURE_ZERO_UNIT = `SyncTeX Version:1
Input:1:./main.tex
Magnification:1000
Unit:0
X Offset:0
Y Offset:0
Content:
{1
[1,3:4736286,3670016:25137278,361944,0
]
}1
Postamble:
`
      const data = parser.parseText(FIXTURE_ZERO_UNIT)
      expect(data.unit).toBe(1)
      const node = data.pages.get(1)!.find((n) => n.type === 'vbox')!
      expect(node.width).toBeGreaterThan(0)
    })

    it('still honors legitimate positive magnification/unit overrides', () => {
      // Regression: the guard must NOT reject valid positive integer overrides.
      const data = parser.parseText(FIXTURE_SCALED)
      expect(data.magnification).toBe(2000)
      expect(data.unit).toBe(2)
    })

    it('handles empty content gracefully', () => {
      const data = parser.parseText(`SyncTeX Version:1
Input:1:./main.tex
Output:main.pdf
Magnification:1000
Unit:1
X Offset:0
Y Offset:0
Content:
Postamble:
Count:0
`)
      expect(data.pages.size).toBe(0)
      expect(data.inputs.size).toBe(1)
    })
  })

  describe('inverseLookup', () => {
    it('finds source location for click inside an hbox', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      // Click inside the first hbox (input=1, line=3)
      // hbox at h=4736286sp, v=3670016sp, W=25137278sp, H=655360sp
      const h = 4736286 * SP_TO_PDF
      const v = 3670016 * SP_TO_PDF
      const height = 655360 * SP_TO_PDF

      // Click in the middle of the hbox
      const result = parser.inverseLookup(data, 1, h + 50, v - height / 2)
      expect(result).not.toBeNull()
      expect(result!.file).toBe('main.tex')
      expect(result!.line).toBe(3)
    })

    it('finds source location for click inside chapter hbox', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      // Click inside the chapter.tex hbox (input=2, line=10)
      const h = 4736286 * SP_TO_PDF
      const v = 5242880 * SP_TO_PDF
      const height = 655360 * SP_TO_PDF

      const result = parser.inverseLookup(data, 1, h + 50, v - height / 2)
      expect(result).not.toBeNull()
      expect(result!.file).toBe('chapter.tex')
      expect(result!.line).toBe(10)
    })

    it('falls back to nearest hbox when click is in equation padding', () => {
      const data = parser.parseText(FIXTURE_EQUATION)

      // Click between two hboxes (in the vbox padding area)
      // hbox1 at v=2500000sp, hbox2 at v=4000000sp
      // Click at v=3250000sp (midpoint between them)
      const h = 4736286 * SP_TO_PDF + 50
      const midV = 3250000 * SP_TO_PDF

      const result = parser.inverseLookup(data, 1, h, midV)
      expect(result).not.toBeNull()
      // Should find nearest hbox, not fall through to page-level fallback
      expect(result!.line).toBeGreaterThanOrEqual(9)
      expect(result!.line).toBeLessThanOrEqual(10)
    })

    it('falls back to nearest node when click is outside all boxes', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      // Click far from any hbox — should find nearest node
      const result = parser.inverseLookup(data, 1, 0, 0)
      expect(result).not.toBeNull()
      // Should return some source location from the page
      expect(result!.file).toBeTruthy()
      expect(result!.line).toBeGreaterThan(0)
    })

    it('returns null for empty page', () => {
      const data: SynctexData = {
        inputs: new Map(),
        pages: new Map(),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }

      const result = parser.inverseLookup(data, 1, 100, 100)
      expect(result).toBeNull()
    })

    it('searches every page root in the deep-child fallback, not just the first', () => {
      // No hbox nodes → Steps 1–4 find no container and we reach the page-root fallback.
      // Two top-level vbox roots: root A's leaf (line 3) is far from the click; root B's
      // leaf (line 50) is right under it. The fallback must consider BOTH roots.
      const leaf = (h: number, line: number): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line,
        column: 0,
        page: 1,
        h,
        v: 100,
        width: 10,
        height: 10,
        depth: 0,
        parent: null,
        children: [],
      })
      const root = (child: SynctexNode): SynctexNode => {
        const r: SynctexNode = { ...leaf(child.h, child.line), type: 'vbox', children: [child] }
        child.parent = r
        return r
      }
      const leafA = leaf(0, 3)
      const leafB = leaf(1000, 50)
      const rootA = root(leafA)
      const rootB = root(leafB)
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [rootA, rootB, leafA, leafB]]]),
        pageRoots: new Map([[1, [rootA, rootB]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }

      // Click on leaf B (h≈1000): must resolve to line 50 (root B), not line 3 (root A).
      expect(parser.inverseLookup(data, 1, 1000, 100)).toEqual({ file: 'main.tex', line: 50 })
    })

    it('keeps the first of several equidistant non-kern children (deterministic)', () => {
      // Reference rule: prefer a non-kern child over a kern when equidistant. The fix must
      // only upgrade kern→non-kern; among equidistant non-kern children the FIRST wins,
      // otherwise inverse-search results depend on child emission order.
      const mkLeaf = (line: number): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line,
        column: 0,
        page: 1,
        h: 100,
        v: 100,
        width: 10,
        height: 10,
        depth: 0,
        parent: null,
        children: [],
      })
      const leafA = mkLeaf(3)
      const leafB = mkLeaf(9)
      const root: SynctexNode = { ...mkLeaf(3), type: 'vbox', children: [leafA, leafB] }
      leafA.parent = root
      leafB.parent = root
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [root, leafA, leafB]]]),
        pageRoots: new Map([[1, [root]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      // Click exactly on the shared position: both leaves are equidistant.
      expect(parser.inverseLookup(data, 1, 100, 100)).toEqual({ file: 'main.tex', line: 3 })
    })

    it('skips a line-0 deep child in the page-root fallback (uses a real source line)', () => {
      // The page-root fallback must not return an invalid line:0 location — it
      // should fall through to Step 6, which already excludes line 0.
      const leaf = (h: number, line: number): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line,
        column: 0,
        page: 1,
        h,
        v: 100,
        width: 10,
        height: 10,
        depth: 0,
        parent: null,
        children: [],
      })
      const zeroLeaf = leaf(100, 0)
      const root: SynctexNode = { ...leaf(100, 0), type: 'vbox', children: [zeroLeaf] }
      zeroLeaf.parent = root
      const realLeaf = leaf(120, 7)
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [root, zeroLeaf, realLeaf]]]),
        pageRoots: new Map([[1, [root]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      const result = parser.inverseLookup(data, 1, 100, 100)
      expect(result).not.toBeNull()
      expect(result!.line).not.toBe(0)
      expect(result!.line).toBe(7)
    })

    it('does not return line:0 from the Step-4 pickBestLR container path', () => {
      // An hbox (line 0) whose closest L/R children are line-0 glue leaves: pickBestLR
      // used to return {line:0} (an invalid source location), unlike Steps 5/6 which guard
      // it. It must fall through to a real source line instead.
      const node = (over: Partial<SynctexNode>): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line: 0,
        column: 0,
        page: 1,
        h: 0,
        v: 100,
        width: 0,
        height: 10,
        depth: 0,
        parent: null,
        children: [],
        ...over,
      })
      const glueL = node({ h: 100, width: 10 }) // line 0
      const glueR = node({ h: 150, width: 10 }) // line 0
      const h = node({ type: 'hbox', h: 90, width: 120, children: [glueL, glueR] })
      glueL.parent = h
      glueR.parent = h
      const realLeaf = node({ line: 7, h: 400, v: 400, width: 10 })
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [h, glueL, glueR, realLeaf]]]),
        pageRoots: new Map(), // skip Step 5 → Step 6 finds the real-line leaf
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      const result = parser.inverseLookup(data, 1, 130, 100) // click between the glue leaves
      expect(result).not.toBeNull()
      expect(result!.line).toBeGreaterThan(0)
      expect(result!.line).toBe(7)
    })

    it('falls back to the opposite L/R side when the preferred pick is line 0', () => {
      // pickBestLR preferred the SMALLER line number, so a line-0 kern beat a real line-7
      // glyph (0 < 7). The caller then discards the line-0 pick (no real source location) and
      // falls through to the container's line — throwing away the line-7 leaf directly
      // bracketing the click. When exactly one L/R side has a real line, prefer that side.
      const node = (over: Partial<SynctexNode>): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line: 0,
        column: 0,
        page: 1,
        h: 0,
        v: 100,
        width: 0,
        height: 100,
        depth: 0,
        parent: null,
        children: [],
        ...over,
      })
      const kernL = node({ h: 100, width: 5, line: 0 }) // closest-left glue/kern, no real line
      const glyphR = node({ h: 150, width: 10, line: 7 }) // closest-right glyph, real line
      const h = node({ type: 'hbox', line: 99, h: 90, width: 120, children: [kernL, glyphR] })
      kernL.parent = h
      glyphR.parent = h
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [h, kernL, glyphR]]]),
        pageRoots: new Map([[1, [h]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      // Click between the line-0 kern and the line-7 glyph. Buggy code returns the container
      // line 99; the leaf directly bracketing the click is line 7.
      const result = parser.inverseLookup(data, 1, 130, 100)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(7)
    })

    it('does not return line:0 from the container fallback path', () => {
      // A childless hbox (line 0) containing the click yields no L/R children, so the code
      // fell back to returning the container's own line:0. It must fall through instead.
      const node = (over: Partial<SynctexNode>): SynctexNode => ({
        type: 'void_hbox',
        input: 1,
        line: 0,
        column: 0,
        page: 1,
        h: 0,
        v: 100,
        width: 0,
        height: 10,
        depth: 0,
        parent: null,
        children: [],
        ...over,
      })
      const emptyHbox = node({ type: 'hbox', h: 90, width: 120 }) // line 0, no children
      const realLeaf = node({ line: 9, h: 400, v: 400, width: 10 })
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [emptyHbox, realLeaf]]]),
        pageRoots: new Map(),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      const result = parser.inverseLookup(data, 1, 130, 100)
      expect(result).not.toBeNull()
      expect(result!.line).toBeGreaterThan(0)
      expect(result!.line).toBe(9)
    })

    it('recurses into the closest child container in the vbox fallback', () => {
      // deepestContainer must descend through a vbox's closest child-with-children
      // (reference _synctex_eq_deepest_container_v2), not return it directly. Tree:
      // hbox H ⊃ vbox V1 ⊃ {V2a, V2b}; V2b ⊃ {V3 (leaves 310/320), Lsibling line 99}.
      // The click is in a gap (no leaf contains it). Without recursion the container
      // is V2b and its L/R bracket returns the sibling line 99; recursing to V3
      // returns leaf line 310.
      const box = (
        type: SynctexNode['type'],
        h: number,
        width: number,
        line: number,
        children: SynctexNode[] = [],
      ): SynctexNode => {
        const n: SynctexNode = {
          type,
          input: 1,
          line,
          column: 0,
          page: 1,
          h,
          v: 100,
          width,
          height: 50,
          depth: 50,
          parent: null,
          children,
        }
        for (const c of children) c.parent = n
        return n
      }
      const leafX = box('void_hbox', 110, 10, 310)
      const leafY = box('void_hbox', 140, 10, 320)
      const v3 = box('vbox', 110, 40, 5, [leafX, leafY])
      const lSibling = box('void_hbox', 0, 40, 99)
      const v2b = box('vbox', 110, 40, 6, [v3, lSibling])
      const v2aLeaf = box('void_hbox', 0, 10, 8)
      const v2a = box('vbox', 0, 40, 7, [v2aLeaf])
      const v1 = box('vbox', 0, 200, 4, [v2a, v2b])
      const h = box('hbox', 0, 200, 3, [v1])
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [h, v1, v2a, v2aLeaf, v2b, v3, lSibling, leafX, leafY]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      expect(parser.inverseLookup(data, 1, 100, 100)).toEqual({ file: 'main.tex', line: 310 })
    })

    it('returns null for non-existent page', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const result = parser.inverseLookup(data, 99, 100, 100)
      expect(result).toBeNull()
    })

    it('ranks parentless leaves by true point distance (no fabricated band)', () => {
      // Two top-level glue leaves at the same h: a click at y=108 is geometrically closer to
      // A (line 11, v=100, dv=8) than B (line 22, v=120, dv=12). A fabricated 10pt parent
      // band on the parentless leaves would invert the ranking and wrongly pick B.
      const leaf = (line: number, v: number): SynctexNode => ({
        type: 'glue',
        input: 1,
        line,
        column: 0,
        page: 1,
        h: 100,
        v,
        width: 0,
        height: 0,
        depth: 0,
        parent: null,
        children: [],
      })
      const a = leaf(11, 100)
      const b = leaf(22, 120)
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [a, b]]]),
        pageRoots: new Map([[1, [a, b]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      expect(parser.inverseLookup(data, 1, 100, 108)?.line).toBe(11)
    })

    it('prefers smallest containing hbox', () => {
      // An hbox nested inside a larger hbox — click should match the inner one
      const data = parser.parseText(FIXTURE_BASIC)

      // The void_hbox (h1,3:...) is inside the hbox (1,3:...)
      // The void_hbox at h=4736286, v=3670016, W=3078103, H=655360
      const h = 4736286 * SP_TO_PDF
      const v = 3670016 * SP_TO_PDF
      const height = 655360 * SP_TO_PDF

      // Click at the very start of the void_hbox
      const result = parser.inverseLookup(data, 1, h + 10, v - height / 2)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(3)
    })
  })

  describe('forwardLookup', () => {
    it('finds PDF position for a source line', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      const result = parser.forwardLookup(data, 'main.tex', 3)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
      // Should encompass the hbox at line 3
      expect(result!.x).toBeCloseTo(4736286 * SP_TO_PDF, 0)
      expect(result!.width).toBeGreaterThan(0)
      expect(result!.height).toBeGreaterThan(0)
    })

    it('finds PDF position for a different file', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      const result = parser.forwardLookup(data, 'chapter.tex', 10)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })

    it('does not throw on a very large friend bucket (no argument-spread overflow)', () => {
      // forwardForLine computed Math.min(...visible.map(n => n.page)); a source line that
      // maps to more nodes than V8's argument-spread limit (~125k) threw a RangeError out
      // to the caller instead of returning a best-effort PdfLocation. Use a reduce instead.
      const COUNT = 200_000
      const friends: SynctexNode[] = Array.from({ length: COUNT }, () => ({
        type: 'hbox',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: 100,
        v: 200,
        width: 300,
        height: 12,
        depth: 0,
        parent: null,
        children: [],
      }))
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map(),
        friendIndex: new Map([['1:5', friends]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      let result: ReturnType<typeof parser.forwardLookup> | undefined
      expect(() => {
        result = parser.forwardLookup(data, 'main.tex', 5)
      }).not.toThrow()
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })

    it('prefers an exact input-name match over a basename/suffix match', () => {
      // Two inputs share the basename intro.tex. A bare `intro.tex` query must bind to the
      // exact input (tag 2), not `sub/intro.tex` (tag 1) which merely ends with it and is
      // iterated first.
      const node: SynctexNode = {
        type: 'hbox',
        input: 2,
        line: 5,
        column: 0,
        page: 1,
        h: 100,
        v: 200,
        width: 300,
        height: 12,
        depth: 0,
        parent: null,
        children: [],
      }
      const data: SynctexData = {
        inputs: new Map([
          [1, 'sub/intro.tex'],
          [2, 'intro.tex'],
        ]),
        pages: new Map(),
        friendIndex: new Map([['2:5', [node]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      const result = parser.forwardLookup(data, 'intro.tex', 5)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })

    it('picks the earliest page for the line, not a later-page non-box node', () => {
      // Line 5's own hbox is on page 1; a glue tagged to the same line sits on page 2.
      // Forward search must land on page 1 (where the line is typeset). Choosing the page
      // from the non-box subset first would let the page-2 glue win.
      const hbox: SynctexNode = {
        type: 'hbox',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: 100,
        v: 200,
        width: 300,
        height: 12,
        depth: 0,
        parent: null,
        children: [],
      }
      const glue: SynctexNode = {
        type: 'glue',
        input: 1,
        line: 5,
        column: 0,
        page: 2,
        h: 50,
        v: 50,
        width: 0,
        height: 0,
        depth: 0,
        parent: null,
        children: [],
      }
      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map(),
        friendIndex: new Map([['1:5', [hbox, glue]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }
      const result = parser.forwardLookup(data, 'main.tex', 5)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })

    it('returns null for unknown file', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const result = parser.forwardLookup(data, 'nonexistent.tex', 1)
      expect(result).toBeNull()
    })

    it('returns null for line with no nodes', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      // Line 999 doesn't exist in the synctex data
      const result = parser.forwardLookup(data, 'main.tex', 999)
      expect(result).toBeNull()
    })

    it('finds correct page in multi-page document', () => {
      const data = parser.parseText(FIXTURE_MULTI_PAGE)

      const result1 = parser.forwardLookup(data, 'main.tex', 5)
      expect(result1).not.toBeNull()
      expect(result1!.page).toBe(1)

      const result2 = parser.forwardLookup(data, 'main.tex', 15)
      expect(result2).not.toBeNull()
      expect(result2!.page).toBe(2)
    })

    it('returns bounding box covering all matching nodes', () => {
      const data = parser.parseText(FIXTURE_BASIC)

      // Line 3 has multiple nodes: hbox, kern, void_hbox
      const result = parser.forwardLookup(data, 'main.tex', 3)
      expect(result).not.toBeNull()
      // Width should be at least as wide as the widest node
      expect(result!.width).toBeGreaterThan(0)
    })

    it('prefers hbox over spanning vbox for itemize-like structures', () => {
      const data = parser.parseText(FIXTURE_ITEMIZE)

      // Line 5 has both a vbox (spanning items 1+2) and an hbox (just item 2).
      // forwardLookup should use the hbox, not the spanning vbox.
      const result = parser.forwardLookup(data, 'main.tex', 5)
      expect(result).not.toBeNull()

      // The hbox for line 5 is at v=3670016, H=655360 → about 10 PDF pt height
      // The vbox spans v=3670016 down to v=3014656, H=1966080 → about 30 PDF pt height
      // Result should use the smaller hbox height, not the large vbox height
      const hboxHeight = 655360 * SP_TO_PDF
      expect(result!.height).toBeLessThan(hboxHeight * 2) // should be ~10pt, not ~30pt
    })

    it('uses enclosing hbox when only kern/glue nodes match the line', () => {
      const data = parser.parseText(FIXTURE_PARAGRAPH)

      // Line 16 has only kern/glue nodes (h=10100000..15300000 sp).
      // The enclosing hbox is at line 14 (h=4736286, W=22609920).
      const result = parser.forwardLookup(data, 'main.tex', 16)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)

      // Should use the enclosing hbox bounds, not the narrow kern/glue span
      const hboxH = 4736286 * SP_TO_PDF
      const hboxW = 22609920 * SP_TO_PDF
      expect(result!.x).toBeCloseTo(hboxH, 0)
      expect(result!.width).toBeCloseTo(hboxW, 0)
      // Should have real height from the hbox, not the 12pt default
      expect(result!.height).toBeGreaterThan(5)
    })

    it('skips zero-width anchor hboxes from \\begin{document}', () => {
      const data = parser.parseText(FIXTURE_ZERO_WIDTH_ANCHORS)

      // Line 5 has only zero-width hboxes on page 2 (anchor markers).
      // Line 7 has real content on page 1.
      // Forward search for line 5 should zigzag to line 7 (page 1),
      // NOT match the zero-width anchors on page 2.
      const result = parser.forwardLookup(data, 'main.tex', 5)
      // zigzag ±3 from line 5 reaches line 7
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })

    it('does not include distant items when clustering by vertical position', () => {
      const data = parser.parseText(FIXTURE_ITEMIZE)

      // Line 4 = First Item (only hbox, no spanning vbox at this line)
      const result4 = parser.forwardLookup(data, 'main.tex', 4)
      // Line 5 = Second Item (hbox + vbox)
      const result5 = parser.forwardLookup(data, 'main.tex', 5)

      expect(result4).not.toBeNull()
      expect(result5).not.toBeNull()

      // They should be at different y positions
      expect(Math.abs(result4!.y - result5!.y)).toBeGreaterThan(5)
    })
  })

  describe('tree structure', () => {
    it('builds parent-child relationships', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const roots = data.pageRoots!.get(1)!

      // Root is a single vbox
      expect(roots.length).toBe(1)
      const vbox = roots[0]!
      expect(vbox.type).toBe('vbox')
      expect(vbox.parent).toBeNull()

      // vbox has 2 hbox children
      expect(vbox.children.length).toBe(2)
      const hbox1 = vbox.children[0]!
      const hbox2 = vbox.children[1]!
      expect(hbox1.type).toBe('hbox')
      expect(hbox1.line).toBe(3)
      expect(hbox1.parent).toBe(vbox)
      expect(hbox2.type).toBe('hbox')
      expect(hbox2.line).toBe(10)
      expect(hbox2.parent).toBe(vbox)

      // First hbox has kern + void_hbox children
      expect(hbox1.children.length).toBe(2)
      expect(hbox1.children[0]!.type).toBe('kern')
      expect(hbox1.children[0]!.parent).toBe(hbox1)
      expect(hbox1.children[1]!.type).toBe('void_hbox')
      expect(hbox1.children[1]!.parent).toBe(hbox1)
    })

    it('builds friend index for O(1) lookup', () => {
      const data = parser.parseText(FIXTURE_BASIC)
      const idx = data.friendIndex!

      // Line 3 has hbox + kern + void_hbox
      const line3 = idx.get('1:3')!
      expect(line3.length).toBe(3)
      expect(line3.map((n) => n.type)).toEqual(['hbox', 'kern', 'void_hbox'])

      // Line 10 has hbox + void_hbox (from chapter.tex, tag=2)
      const line10 = idx.get('2:10')!
      expect(line10.length).toBe(2)
    })

    it('inverse search returns child line for paragraph hbox', () => {
      const data = parser.parseText(FIXTURE_PARAGRAPH)

      // The hbox is tagged line 14 but kern/glue children are tagged line 16.
      // Clicking inside the hbox should return line 16 (from children).
      const hbox = data.pages.get(1)!.find((n) => n.type === 'hbox')!
      const midX = hbox.h + hbox.width / 2
      const midY = hbox.v - hbox.height / 2

      const result = parser.inverseLookup(data, 1, midX, midY)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(16) // child line, not parent's 14
    })

    it('forward search resolves kern/glue to ancestor hbox via parent pointer', () => {
      const data = parser.parseText(FIXTURE_PARAGRAPH)

      // Line 16 has only kern/glue. Tree parent walk finds hbox(line 14).
      const result = parser.forwardLookup(data, 'main.tex', 16)
      expect(result).not.toBeNull()

      // Should use the parent hbox bounds
      const hboxH = 4736286 * SP_TO_PDF
      const hboxW = 22609920 * SP_TO_PDF
      expect(result!.x).toBeCloseTo(hboxH, 0)
      expect(result!.width).toBeCloseTo(hboxW, 0)
    })
  })

  describe('parse (async with Uint8Array)', () => {
    it('parses uncompressed synctex data', async () => {
      const encoder = new TextEncoder()
      const bytes = encoder.encode(FIXTURE_BASIC)

      const data = await parser.parse(bytes)
      expect(data.inputs.size).toBe(2)
      expect(data.pages.size).toBe(1)
    })

    it('does not leak an unhandled rejection on corrupt gzip', async () => {
      // Bug: the writer-side promise (write/close) rejects with no handler when the
      // DecompressionStream errors on corrupt input, producing an orphaned rejection
      // (global unhandledrejection in browsers; can terminate strict Node hosts).
      // gzip magic 0x1f 0x8b but garbage body so the decompress branch is taken.
      const bad = new Uint8Array([
        0x1f, 0x8b, 0x08, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
      ])
      const unhandled: unknown[] = []
      const onRej = (r: unknown) => unhandled.push(r)
      process.on('unhandledRejection', onRej)
      try {
        // The caller still sees the (correctly thrown) parse error.
        await expect(parser.parse(bad)).rejects.toThrow()
        // Let any orphaned microtask/timer flush before asserting.
        await new Promise((r) => setTimeout(r, 50))
      } finally {
        process.off('unhandledRejection', onRej)
      }
      expect(unhandled).toHaveLength(0)
    })

    it('decompresses a valid gzip body (sanity)', async () => {
      const { gzipSync } = await import('node:zlib')
      const gz = new Uint8Array(gzipSync(Buffer.from(FIXTURE_BASIC)))
      const unhandled: unknown[] = []
      const onRej = (r: unknown) => unhandled.push(r)
      process.on('unhandledRejection', onRej)
      try {
        const data = await parser.parse(gz)
        await new Promise((r) => setTimeout(r, 50))
        expect(data.inputs.size).toBe(2)
        expect(data.pages.size).toBe(1)
      } finally {
        process.off('unhandledRejection', onRej)
      }
      expect(unhandled).toHaveLength(0)
    })
  })
})
