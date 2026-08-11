import { describe, expect, it, vi } from 'vitest'
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
    it('preserves disjoint regions when one source line crosses columns', () => {
      const pageBox: SynctexNode = {
        type: 'hbox',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: 50,
        v: 750,
        width: 500,
        height: 700,
        depth: 0,
        parent: null,
        children: [],
      }
      const leftColumnLine: SynctexNode = {
        type: 'hbox',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: 70,
        v: 700,
        width: 220,
        height: 12,
        depth: 3,
        parent: pageBox,
        children: [],
      }
      const rightColumnLine: SynctexNode = {
        type: 'hbox',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: 310,
        v: 100,
        width: 220,
        height: 12,
        depth: 3,
        parent: pageBox,
        children: [],
      }
      const leaf = (parent: SynctexNode): SynctexNode => ({
        type: 'glue',
        input: 1,
        line: 5,
        column: 0,
        page: 1,
        h: parent.h,
        v: parent.v,
        width: 0,
        height: 0,
        depth: 0,
        parent,
        children: [],
      })
      const leftLeaf = leaf(leftColumnLine)
      const rightLeaf = leaf(rightColumnLine)
      const outputRoutineLeaf = leaf(pageBox)
      leftColumnLine.children.push(leftLeaf)
      rightColumnLine.children.push(rightLeaf)
      pageBox.children.push(leftColumnLine, rightColumnLine, outputRoutineLeaf)

      const data: SynctexData = {
        inputs: new Map([[1, 'main.tex']]),
        pages: new Map([[1, [pageBox, leftColumnLine, leftLeaf, rightColumnLine, rightLeaf]]]),
        pageRoots: new Map([[1, [pageBox]]]),
        friendIndex: new Map([[`1:5`, [leftLeaf, rightLeaf, outputRoutineLeaf]]]),
        magnification: 1000,
        unit: 1,
        xOffset: 0,
        yOffset: 0,
      }

      expect(parser.forwardLookupAll(data, 'main.tex', 5)).toEqual([
        { page: 1, x: 70, y: 688, width: 220, height: 15 },
        { page: 1, x: 310, y: 88, width: 220, height: 15 },
      ])
      expect(parser.forwardLookup(data, 'main.tex', 5)).toEqual({
        page: 1,
        x: 70,
        y: 688,
        width: 220,
        height: 15,
      })
    })

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

// ---------------------------------------------------------------------------
// Branch-coverage-focused tests. Each exercises a specific decision path in
// synctex-parser.ts that the fixtures above do not reach. They assert real
// parse/lookup outputs (not merely "runs without throwing") so they pin the
// intended behavior, not just line execution.
// ---------------------------------------------------------------------------

describe('SynctexParser branch coverage', () => {
  const parser = new SynctexParser()

  /** Build a fully-populated node, overriding only the interesting fields. */
  const mkNode = (over: Partial<SynctexNode>): SynctexNode => ({
    type: 'void_hbox',
    input: 1,
    line: 1,
    column: 0,
    page: 1,
    h: 0,
    v: 0,
    width: 0,
    height: 0,
    depth: 0,
    parent: null,
    children: [],
    ...over,
  })

  /** Wire up parent pointers for a node's children and return the node. */
  const withChildren = (node: SynctexNode, children: SynctexNode[]): SynctexNode => {
    node.children = children
    for (const c of children) c.parent = node
    return node
  }

  const mkData = (over: Partial<SynctexData>): SynctexData => ({
    inputs: new Map([[1, 'main.tex']]),
    pages: new Map(),
    magnification: 1000,
    unit: 1,
    xOffset: 0,
    yOffset: 0,
    ...over,
  })

  describe('maybeDecompress', () => {
    it('throws a clear error when gzip data is given but DecompressionStream is absent', async () => {
      // Covers the `typeof DecompressionStream === 'undefined'` guard (line 80): a gzip
      // magic header (0x1f 0x8b) in an environment lacking the stream API must fail loudly
      // rather than feed compressed bytes to the text decoder.
      vi.stubGlobal('DecompressionStream', undefined)
      try {
        const gzipMagic = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00])
        await expect(parser.parse(gzipMagic)).rejects.toThrow(/DecompressionStream not available/)
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })

  describe('hOrderedDistance — positive kern geometry', () => {
    it('locates a click that lands inside a positive-width kern span', () => {
      // A positive kern moves the reference point RIGHT, so its span is [h-w, h] (line 212-213).
      // A click horizontally inside that span drives the "inside the kern" return (line 221).
      // We prove the kern is treated as an L/R bracket child (not ignored) by getting a
      // source line back from a container whose only real child is the kern.
      const kern = mkNode({ type: 'kern', h: 200, width: 40, v: 50, line: 12 })
      const container = withChildren(
        mkNode({ type: 'hbox', h: 100, width: 300, v: 50, height: 50, depth: 50, line: 3 }),
        [kern],
      )
      const data = mkData({
        pages: new Map([[1, [container, kern]]]),
        pageRoots: new Map([[1, [container]]]),
      })
      // Click at x=180 == med, inside the kern span [160, 200]; y=50 inside the container band.
      // med = (160+200)/2 = 180, so x > med is false → the `min - x - 0.01` arm.
      expect(parser.inverseLookup(data, 1, 180, 50)?.line).toBe(12)
      // Click at x=190 > med → the `max - x + 0.01` arm of the inside-kern ternary (line 221).
      expect(parser.inverseLookup(data, 1, 190, 50)?.line).toBe(12)
    })
  })

  describe('pointNodeDistance — parented glue/math extent', () => {
    it('uses the parent box height for a parented glue in the last-resort fallback', () => {
      // No hbox / no pageRoots → Step 6 calls pointNodeDistance on the glue leaf. Its parent is
      // set, so the `node.parent ? parent.height : 0` ternary takes its truthy arm (line 264).
      const parentBox = mkNode({ type: 'vbox', height: 40, depth: 10 })
      const glue = mkNode({ type: 'glue', h: 100, v: 200, line: 8, parent: parentBox })
      const data = mkData({ pages: new Map([[1, [glue]]]) })
      expect(parser.inverseLookup(data, 1, 100, 190)?.line).toBe(8)
    })
  })

  describe('pointNodeDistance — kern nodes', () => {
    it('ranks kern nodes by point distance in the last-resort fallback (parented and orphan)', () => {
      // No hbox and no pageRoots → inverseLookup falls all the way to Step 6, which calls
      // pointNodeDistance on every node. Two kerns exercise both sides of the
      // `node.parent ? parent.height : 0` ternary (lines 258-261): one has a parent box,
      // one is parentless. The nearer kern must win.
      const parentBox = mkNode({ type: 'hbox', height: 50 })
      const nearKern = mkNode({
        type: 'kern',
        h: 100,
        width: 10,
        v: 50,
        line: 5,
        parent: parentBox,
      })
      const farKern = mkNode({ type: 'kern', h: 1000, width: 10, v: 50, line: 6, parent: null })
      const data = mkData({ pages: new Map([[1, [nearKern, farKern]]]) })
      const result = parser.inverseLookup(data, 1, 105, 50)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(5)
    })
  })

  describe('forwardLookup — input name resolution', () => {
    it('binds a bare basename to a subdirectory input via the /suffix fallback', () => {
      // No exact name match, so the second loop matches on `name.endsWith('/' + file)`
      // (lines 616-617): a query for `intro.tex` resolves to `chapters/intro.tex`.
      const hbox = mkNode({ type: 'hbox', h: 100, v: 200, width: 300, height: 12, line: 5 })
      const data = mkData({
        inputs: new Map([[1, 'chapters/intro.tex']]),
        friendIndex: new Map([['1:5', [hbox]]]),
      })
      const result = parser.forwardLookup(data, 'intro.tex', 5)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })
  })

  describe('forwardLookup — zigzag line search', () => {
    it('skips non-positive candidate lines while zigzagging toward a match', () => {
      // Query line 1 with the only match at line 4. The zigzag sequence dips to 0 and -1,
      // which must be skipped and re-stepped (lines 640-641), before reaching line 4 within
      // the ±3 window.
      const hbox = mkNode({ type: 'hbox', h: 100, v: 200, width: 300, height: 12, line: 4 })
      const data = mkData({ friendIndex: new Map([['1:4', [hbox]]]) })
      const result = parser.forwardLookup(data, 'main.tex', 1)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
    })
  })

  describe('forwardFromNodes — leaf-only fallback', () => {
    it('boxes a zero-dimension leaf that has no ancestor hbox', () => {
      // A glue leaf whose only ancestor is a vbox: findAncestorHbox walks up, finds no hbox,
      // and returns null (lines 926-928). forwardFromNodes then has neither resolved nor
      // direct boxes, so it falls back to bounding the raw leaf (line 710). The leaf is
      // zero-height, tripping the baseline-estimate branch in bboxFromNodes (lines 949-950).
      const wrapperVbox = mkNode({ type: 'vbox', h: 100, v: 200, width: 400, line: 2 })
      const glue = mkNode({ type: 'glue', h: 100, v: 200, width: 0, line: 5, parent: wrapperVbox })
      const data = mkData({ friendIndex: new Map([['1:5', [glue]]]) })
      const result = parser.forwardLookup(data, 'main.tex', 5)
      expect(result).not.toBeNull()
      expect(result!.page).toBe(1)
      // x is the glue's h; the box is synthesized from the baseline estimate (v-12 .. v+3).
      expect(result!.x).toBeCloseTo(100, 5)
      expect(result!.y).toBeCloseTo(200 - 12, 5)
      expect(result!.height).toBeCloseTo(15, 5)
      expect(result!.width).toBe(10) // Math.max(0, 10)
    })
  })

  describe('vOrderedDistance — leaf nodes', () => {
    it('uses parent extent for a parented leaf and a point test for an orphan leaf', () => {
      // deepestContainer calls pointInBox on the container's children. When a leaf sits exactly
      // under the click horizontally, hOrderedDistance is 0 and vOrderedDistance runs on the
      // leaf. mathLeaf (parent === null) drives the orphan branch `return node.v - y`
      // (line 734); glueLeaf (parent set) drives the parent-extent branch (lines 730-732) and,
      // being vertically inside, resolves the click to its own source line.
      const glueLeaf = mkNode({ type: 'glue', h: 150, v: 50, line: 5 })
      const mathLeaf = mkNode({ type: 'math', h: 150, v: 200, line: 99, parent: null })
      const container = withChildren(
        mkNode({ type: 'hbox', h: 100, width: 100, v: 50, height: 50, depth: 50, line: 3 }),
        [mathLeaf, glueLeaf],
      )
      // withChildren set both parents; force mathLeaf back to orphan for the null branch.
      mathLeaf.parent = null
      const data = mkData({
        pages: new Map([[1, [container, mathLeaf, glueLeaf]]]),
        pageRoots: new Map([[1, [container]]]),
      })
      const result = parser.inverseLookup(data, 1, 150, 50)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(5)
    })
  })

  describe('smallestContainer — overlapping hboxes', () => {
    it('keeps the smallest-area hbox among several that contain the click', () => {
      // Three overlapping hboxes all contain the click. Step 1 folds them with
      // smallestContainer: comparison A→B exercises `areaA < areaB` (line 747) and B→C
      // exercises `areaA > areaB` (line 748). The smallest (B, line 42) must win.
      const big = mkNode({
        type: 'hbox',
        h: 0,
        width: 400,
        v: 50,
        height: 100,
        depth: 100,
        line: 1,
      })
      const small = mkNode({
        type: 'hbox',
        h: 100,
        width: 100,
        v: 50,
        height: 20,
        depth: 20,
        line: 42,
      })
      const medium = mkNode({
        type: 'hbox',
        h: 50,
        width: 250,
        v: 50,
        height: 40,
        depth: 40,
        line: 9,
      })
      const data = mkData({
        pages: new Map([[1, [big, small, medium]]]),
        pageRoots: new Map([[1, [big, small, medium]]]),
      })
      expect(parser.inverseLookup(data, 1, 150, 50)?.line).toBe(42)
    })

    it('tie-breaks equal-area containers toward the shorter one (both orderings)', () => {
      // Two equal-area hboxes (P: 100×40, Q: 80×50) both contain the click, so the area test
      // ties and the height tie-break runs. Whichever ordering the flat list uses, the shorter
      // box P (line 7) must win — covering both the `return a` (line 750) and `return b`
      // (line 751) tie-break arms.
      const shorter = () =>
        mkNode({ type: 'hbox', h: 100, width: 100, v: 50, height: 20, depth: 20, line: 7 })
      const taller = () =>
        mkNode({ type: 'hbox', h: 110, width: 80, v: 50, height: 25, depth: 25, line: 8 })

      const pFirst = mkData({
        pages: new Map([[1, [shorter(), taller()]]]),
        pageRoots: new Map(),
      })
      expect(parser.inverseLookup(pFirst, 1, 150, 50)?.line).toBe(7)

      const qFirst = mkData({
        pages: new Map([[1, [taller(), shorter()]]]),
        pageRoots: new Map(),
      })
      expect(parser.inverseLookup(qFirst, 1, 150, 50)?.line).toBe(7)
    })
  })

  describe('getClosestChildrenInBox — nested recursion & drilling', () => {
    it('recurses into a child the click is horizontally inside', () => {
      // The container's child D horizontally contains the click but is vertically far away, so
      // deepestContainer does not descend into it. getClosestChildrenInBox then sees
      // hOrderedDistance === 0 for D and recurses into it (line 818), returning D's leaf (line 42).
      const leaf = mkNode({ type: 'void_hbox', h: 145, width: 5, v: 500, height: 10, line: 42 })
      const inner = withChildren(
        mkNode({ type: 'hbox', h: 140, width: 20, v: 500, height: 10, depth: 10, line: 7 }),
        [leaf],
      )
      const container = withChildren(
        mkNode({ type: 'hbox', h: 100, width: 100, v: 50, height: 50, depth: 50, line: 3 }),
        [inner],
      )
      const data = mkData({
        pages: new Map([[1, [container, inner, leaf]]]),
        pageRoots: new Map([[1, [container]]]),
      })
      expect(parser.inverseLookup(data, 1, 150, 50)?.line).toBe(42)
    })

    it('drills both L and R bracket boxes down to their closest leaves', () => {
      // The click brackets two sibling boxes: one entirely left, one entirely right. Each has
      // children, so both are drilled via closestDeepChild (lines 834-835 and 838-839). With
      // distinct real lines, pickBestLR prefers the smaller line number (line 865 returns L).
      const lLeaf = mkNode({ type: 'void_hbox', h: 110, width: 4, v: 50, height: 10, line: 10 })
      const rLeaf = mkNode({ type: 'void_hbox', h: 185, width: 4, v: 50, height: 10, line: 20 })
      const lBox = withChildren(
        mkNode({ type: 'hbox', h: 100, width: 20, v: 50, height: 40, depth: 40, line: 1 }),
        [lLeaf],
      )
      const rBox = withChildren(
        mkNode({ type: 'hbox', h: 180, width: 20, v: 50, height: 40, depth: 40, line: 2 }),
        [rLeaf],
      )
      const container = withChildren(
        mkNode({ type: 'hbox', h: 90, width: 130, v: 50, height: 50, depth: 50, line: 3 }),
        [lBox, rBox],
      )
      const data = mkData({
        pages: new Map([[1, [container, lBox, rBox, lLeaf, rLeaf]]]),
        pageRoots: new Map([[1, [container]]]),
      })
      expect(parser.inverseLookup(data, 1, 150, 50)?.line).toBe(10)
    })
  })

  describe('pickBestLR — same-line, different-file bracket', () => {
    it('falls to the point-distance tiebreak when L and R share a line but differ in file', () => {
      // L and R bracket the click, same source line (10) but different input files. This skips
      // the smaller-line rule and reaches the distance comparison (lines 866-870). Both are
      // equidistant here, so the `dL <= dR` arm returns L — either way the reported line is 10.
      const lLeaf = mkNode({
        type: 'void_hbox',
        input: 1,
        h: 118,
        width: 0,
        v: 50,
        height: 10,
        line: 10,
      })
      const rLeaf = mkNode({
        type: 'void_hbox',
        input: 2,
        h: 182,
        width: 0,
        v: 50,
        height: 10,
        line: 10,
      })
      const lBox = withChildren(
        mkNode({ type: 'hbox', h: 100, width: 20, v: 50, height: 40, depth: 40, line: 1 }),
        [lLeaf],
      )
      const rBox = withChildren(
        mkNode({ type: 'hbox', h: 180, width: 20, v: 50, height: 40, depth: 40, line: 2 }),
        [rLeaf],
      )
      const container = withChildren(
        mkNode({ type: 'hbox', h: 90, width: 130, v: 50, height: 50, depth: 50, line: 3 }),
        [lBox, rBox],
      )
      const data = mkData({
        inputs: new Map([
          [1, 'main.tex'],
          [2, 'other.tex'],
        ]),
        pages: new Map([[1, [container, lBox, rBox, lLeaf, rLeaf]]]),
        pageRoots: new Map([[1, [container]]]),
      })
      const result = parser.inverseLookup(data, 1, 150, 50)
      expect(result).not.toBeNull()
      expect(result!.line).toBe(10)
    })
  })

  describe('closestDeepChild — multi-level recursion', () => {
    it('descends through a grandparent→parent→leaf chain in the page-root fallback', () => {
      // No hbox anywhere → Steps 1-4 are skipped and the page-root fallback (Step 5) runs
      // closestDeepChild on the root vbox. Its child is itself a container with leaves, forcing
      // the container-recursion arm (lines 896-899). The nearest grandchild leaf (line 30) wins.
      const near = mkNode({ type: 'void_hbox', h: 100, v: 100, width: 10, height: 10, line: 30 })
      const far = mkNode({ type: 'void_hbox', h: 500, v: 100, width: 10, height: 10, line: 31 })
      const mid = withChildren(
        mkNode({ type: 'vbox', h: 100, v: 100, width: 400, height: 50, depth: 50, line: 4 }),
        [near, far],
      )
      const root = withChildren(
        mkNode({ type: 'vbox', h: 100, v: 100, width: 400, height: 50, depth: 50, line: 1 }),
        [mid],
      )
      const data = mkData({
        pages: new Map([[1, [root, mid, near, far]]]),
        pageRoots: new Map([[1, [root]]]),
      })
      expect(parser.inverseLookup(data, 1, 100, 100)?.line).toBe(30)
    })
  })

  describe('maybeDecompress — gzip magic detection', () => {
    it('treats a sub-2-byte payload as plain text (no gzip probe)', async () => {
      // `data.length >= 2` short-circuits false for a 1-byte buffer, so the gzip branch is
      // skipped and the byte is decoded as text. Not valid synctex → empty structured result.
      const data = await parser.parse(new Uint8Array([0x41]))
      expect(data.inputs.size).toBe(0)
      expect(data.pages.size).toBe(0)
    })

    it('does not treat 0x1f followed by a non-0x8b byte as gzip', async () => {
      // First magic byte matches but the second does not, so `data[1] === 0x8b` is false and the
      // payload is decoded verbatim rather than fed to DecompressionStream (which would throw).
      const data = await parser.parse(new Uint8Array([0x1f, 0x00, 0x42]))
      expect(data.inputs.size).toBe(0)
      expect(data.pages.size).toBe(0)
    })
  })

  describe('parseText — malformed & boundary input', () => {
    const preamble = `SyncTeX Version:1
Input:1:./main.tex
Magnification:1000
Unit:1`

    it('keeps default offsets when X/Y Offset values are non-finite', () => {
      // The offset guards assign only when Number.isFinite; malformed values (parseInt → NaN)
      // must leave the defaults (0) untouched — exercising the false arm of both guards.
      const data = parser.parseText(`${preamble}
X Offset:nonsense
Y Offset:
Content:
{1
(1,3:4736286,3670016:25137278,655360,0
)
}1
Postamble:
`)
      expect(data.xOffset).toBe(0)
      expect(data.yOffset).toBe(0)
      // A node still parses to finite coordinates.
      const node = data.pages.get(1)!.find((n) => n.type === 'hbox')!
      expect(Number.isFinite(node.h)).toBe(true)
    })

    it('appends to an existing page when its number is opened twice', () => {
      // Re-encountering `{1` must not recreate/clear the page bucket (the `!pages.has` guard
      // takes its false arm); nodes from both openings accumulate on page 1.
      const data = parser.parseText(`${preamble}
X Offset:0
Y Offset:0
Content:
{1
(1,3:4736286,3670016:25137278,655360,0
)
}1
{1
(1,7:4736286,5242880:25137278,655360,0
)
}1
Postamble:
`)
      expect(data.pages.size).toBe(1)
      const lines = data.pages.get(1)!.map((n) => n.line)
      expect(lines).toContain(3)
      expect(lines).toContain(7)
    })

    it('ignores an unmatched close bracket (empty stack)', () => {
      // A stray `]` with nothing on the stack must be a no-op (false arm of `stack.length > 0`),
      // and subsequent nodes must still parse and become page roots.
      const data = parser.parseText(`${preamble}
X Offset:0
Y Offset:0
Content:
{1
]
(1,3:4736286,3670016:25137278,655360,0
)
}1
Postamble:
`)
      const nodes = data.pages.get(1)!
      expect(nodes.some((n) => n.type === 'hbox' && n.line === 3)).toBe(true)
      // The (hbox with no live parent) is a page root.
      expect(data.pageRoots!.get(1)!.some((n) => n.line === 3)).toBe(true)
    })

    it('ignores node records that appear before the first page marker', () => {
      // A node line while currentPage === 0 hits the `currentPage === 0` arm of the skip guard
      // and is dropped; only nodes inside `{1 ... }1` survive.
      const data = parser.parseText(`${preamble}
X Offset:0
Y Offset:0
Content:
h9,99:1,2:3,4,0
{1
(1,3:4736286,3670016:25137278,655360,0
)
}1
Postamble:
`)
      const nodes = data.pages.get(1)!
      expect(nodes.every((n) => n.line !== 99)).toBe(true)
      expect(nodes.some((n) => n.line === 3)).toBe(true)
    })

    it('does not add a line-0 node to the friend index', () => {
      // A well-formed node whose source line is 0 is kept as geometry but excluded from the
      // friend index (false arm of `sourceLine > 0`), so no `tag:0` bucket appears.
      const data = parser.parseText(`${preamble}
X Offset:0
Y Offset:0
Content:
{1
(1,3:4736286,3670016:25137278,655360,0
h1,0:5000000,3670016:100000,655360,0
)
}1
Postamble:
`)
      expect(data.friendIndex!.has('1:0')).toBe(false)
      expect(data.friendIndex!.has('1:3')).toBe(true)
      // The line-0 node is still present in the flat page list.
      expect(data.pages.get(1)!.some((n) => n.line === 0)).toBe(true)
    })

    it('tolerates blank lines, one-colon Input lines, and colon-less node records', () => {
      // Bundles several defensive parse arms:
      //  - `Input:5` has no second colon → parseInputLine's `secondColon !== -1` false arm; no
      //    input tag 5 is registered.
      //  - a blank line inside content → the `!line` continue.
      //  - `gbogus` (a glue prefix with no colon) → parseTagLineColumn returns all-zero and the
      //    record is dropped by `!coordStr && sourceLine === 0`.
      //  - `h5:1,2:3,4,0` has a tag but no comma before the colon → parseTagLineColumn's
      //    `parts[1] ?? '0'` fallback yields line 0.
      //  - `k1,3:100` has coordinates with no comma → parseCoords' `hvParts[1] ?? '0'` fallback
      //    yields v = 0.
      const data = parser.parseText(`${preamble}
Input:5
X Offset:0
Y Offset:0
Content:
{1
(1,3:4736286,3670016:25137278,655360,0

gbogus
h5:1,2:3,4,0
k1,3:100
)
}1
Postamble:
`)
      expect(data.inputs.get(1)).toBe('main.tex')
      expect(data.inputs.has(5)).toBe(false)

      const nodes = data.pages.get(1)!
      // The valid hbox parsed.
      expect(nodes.some((n) => n.type === 'hbox' && n.line === 3)).toBe(true)
      // The colon-less glue was dropped entirely.
      expect(nodes.some((n) => n.type === 'glue')).toBe(false)
      // The tag-only void_hbox parsed with line 0 (parts[1] fallback).
      const tag5 = nodes.find((n) => n.input === 5)!
      expect(tag5).toBeDefined()
      expect(tag5.line).toBe(0)
      // The comma-less kern parsed with v = 0 (hvParts[1] fallback).
      const kern = nodes.find((n) => n.type === 'kern')!
      expect(kern).toBeDefined()
      expect(kern.v).toBe(0)
    })
  })
})
