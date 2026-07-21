/**
 * SyncTeX file parser for PDF↔source bidirectional navigation.
 *
 * Ported from the reference C implementation (synctex_parser.c by Jérôme Laurens).
 * Original reference implementation copyright (c) 2008-2017 Jérôme Laurens.
 * The complete upstream permission and non-endorsement notice is retained in
 * LICENSES/SyncTeX.txt and distributed with this package.
 * Tree-based parser preserving parent-child box hierarchy.
 *
 * Key algorithms from reference:
 * - Inverse search: deepest container → L/R bracketing of closest children
 * - Forward search: friend index → non-box first → nearest-line zigzag
 * - Distance: L1 (Manhattan) not Euclidean
 *
 * Coordinate system: SyncTeX stores positions in TeX scaled points (sp).
 * We convert to PDF points (bp, 1/72 inch) for use with PDF.js viewports.
 *   pdf_pt = sp * unit * magnification / 1000 / 65536 * 72 / 72.27
 */

// Re-export SourceLocation so consumers can import from either module
export type { PdfLocation, SourceLocation } from './text-mapper'

import type { PdfLocation, SourceLocation } from './text-mapper'

export interface SynctexNode {
  type: 'hbox' | 'vbox' | 'kern' | 'glue' | 'math' | 'void_vbox' | 'void_hbox'
  input: number
  line: number
  column: number
  page: number
  /** Horizontal position in PDF points from left edge */
  h: number
  /** Vertical position in PDF points from top edge (downward positive) */
  v: number
  /** Width in PDF points */
  width: number
  /** Height in PDF points (above baseline) */
  height: number
  /** Depth in PDF points (below baseline) */
  depth: number
  /** Parent box in the SyncTeX tree (null for page-level root nodes) */
  parent: SynctexNode | null
  /** Child nodes within this box (empty for leaf nodes) */
  children: SynctexNode[]
}

export interface SynctexData {
  inputs: Map<number, string>
  /** Flat list of all nodes per page (backward compatibility) */
  pages: Map<number, SynctexNode[]>
  /** Tree roots per page — top-level boxes from which children descend */
  pageRoots?: Map<number, SynctexNode[]>
  /** Friend index: "inputTag:line" → nodes, for O(1) forward lookup */
  friendIndex?: Map<string, SynctexNode[]>
  magnification: number
  unit: number
  xOffset: number
  yOffset: number
}

/** Conversion factor: TeX points to PDF points (big points) */
const TEX_TO_PDF = 72 / 72.27

/**
 * Convert a raw synctex coordinate value to PDF points.
 * Formula: value * unit * (magnification/1000) / 65536 * (72/72.27)
 */
function spToPdfPt(value: number, unit: number, mag: number): number {
  return ((value * unit * mag) / (1000 * 65536)) * TEX_TO_PDF
}

/**
 * Decompress gzipped data using the browser's DecompressionStream API.
 * Falls back to returning the input unchanged if not gzipped.
 */
async function maybeDecompress(data: Uint8Array): Promise<Uint8Array> {
  // Check gzip magic number: 0x1f 0x8b
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DecompressionStream not available — cannot decompress synctex.gz')
    }
    const ds = new DecompressionStream('gzip')
    const writer = ds.writable.getWriter()
    const reader = ds.readable.getReader()

    // Pump input into the stream, then close. Swallow the writer-side rejection:
    // the reader.read() loop below already surfaces decode errors to the caller, so
    // an unhandled writer rejection on corrupt gzip would just be orphaned noise
    // (a global unhandledrejection in browsers; process-terminating under strict Node).
    void writer
      .write(data as unknown as BufferSource)
      .then(() => writer.close())
      .catch(() => {})

    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }

    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    return result
  }
  return data
}

/**
 * Parse a tag,line[,column] prefix that appears in synctex node records.
 * Returns [tag, line, column, restOfLine].
 */
function parseTagLineColumn(s: string): [number, number, number, string] {
  // Format: "tag,line:..." or "tag,line,column:..."
  const colonIdx = s.indexOf(':')
  if (colonIdx === -1) return [0, 0, 0, '']

  const prefix = s.slice(0, colonIdx)
  const rest = s.slice(colonIdx + 1)
  const parts = prefix.split(',')

  const tag = parseInt(parts[0] ?? '0', 10)
  const line = parseInt(parts[1] ?? '0', 10)
  const column = parts.length > 2 ? parseInt(parts[2] ?? '0', 10) : 0

  return [tag, line, column, rest]
}

/**
 * Parse the coordinate portion "h,v:W,H,D" or "h,v" from a synctex record.
 * Returns [h, v, W, H, D] (W/H/D default to 0 if absent).
 */
function parseCoords(s: string): [number, number, number, number, number] {
  const colonIdx = s.indexOf(':')
  let hvPart: string
  let whdPart: string | null

  if (colonIdx === -1) {
    hvPart = s
    whdPart = null
  } else {
    hvPart = s.slice(0, colonIdx)
    whdPart = s.slice(colonIdx + 1)
  }

  const hvParts = hvPart.split(',')
  const h = parseInt(hvParts[0] ?? '0', 10)
  const v = parseInt(hvParts[1] ?? '0', 10)

  if (!whdPart) return [h, v, 0, 0, 0]

  const whdParts = whdPart.split(',')
  const W = parseInt(whdParts[0] ?? '0', 10)
  const H = parseInt(whdParts[1] ?? '0', 10)
  const D = parseInt(whdParts[2] ?? '0', 10)

  return [h, v, W, H, D]
}

type NodeType = SynctexNode['type']

/** Is this node a box type (container or void)? */
function isBox(node: SynctexNode): boolean {
  return (
    node.type === 'hbox' ||
    node.type === 'vbox' ||
    node.type === 'void_hbox' ||
    node.type === 'void_vbox'
  )
}

/** Node type prefix → type name mapping */
const NODE_PREFIXES: Record<string, NodeType> = {
  '[': 'vbox',
  '(': 'hbox',
  v: 'void_vbox',
  h: 'void_hbox',
  x: 'kern',
  k: 'kern',
  g: 'glue',
  $: 'math',
}

/**
 * Horizontal ordered distance from hit point to node (reference: _synctex_point_h_ordered_distance_v2).
 * Positive = node is to the right of hit. Negative = node is to the left. Zero = inside.
 */
function hOrderedDistance(x: number, node: SynctexNode): number {
  if (
    node.type === 'hbox' ||
    node.type === 'vbox' ||
    node.type === 'void_hbox' ||
    node.type === 'void_vbox'
  ) {
    const min = node.h
    const max = min + node.width
    if (x < min) return min - x
    if (x > max) return max - x
    return 0
  }
  if (node.type === 'kern') {
    // Reference: kern position is AFTER the move. Distance relative to closest edge.
    const w = node.width
    let min: number
    let max: number
    if (w > 0) {
      min = node.h - w
      max = node.h
    } else {
      min = node.h
      max = node.h - w
    }
    const med = (min + max) / 2
    if (x < min) return min - x + 0.01 // penalty so other nodes preferred
    if (x > max) return max - x - 0.01
    return x > med ? max - x + 0.01 : min - x - 0.01
  }
  // glue, math: point distance
  return node.h - x
}

/**
 * L1 (Manhattan) distance from hit point to a node's bounding box.
 * Reference: _synctex_point_node_distance_v2 + _synctex_distance_to_box_v2.
 */
function pointNodeDistance(x: number, y: number, node: SynctexNode): number {
  let minH: number
  let maxH: number
  let minV: number
  let maxV: number

  if (node.type === 'hbox' || node.type === 'vbox') {
    minH = node.h
    maxH = minH + node.width
    minV = node.v - node.height
    maxV = node.v + node.depth
  } else if (node.type === 'void_hbox' || node.type === 'void_vbox') {
    // Best of distances from left edge and right edge
    const dLeft = distToBox(x, y, node.h, node.h, node.v - node.height, node.v + node.depth)
    const dRight = distToBox(
      x,
      y,
      node.h + node.width,
      node.h + node.width,
      node.v - node.height,
      node.v + node.depth,
    )
    return Math.min(dLeft, dRight)
  } else if (node.type === 'kern') {
    // A parentless leaf collapses to a pure point distance (parent height 0), matching
    // vOrderedDistance and upstream `_synctex_node_height(NULL)`; a fabricated band would
    // mis-rank nearest-node selection among multiple parentless leaves.
    const parentH = node.parent ? node.parent.height : 0
    const dA = distToBox(x, y, node.h, node.h, node.v - parentH, node.v)
    const dB = distToBox(x, y, node.h - node.width, node.h - node.width, node.v - parentH, node.v)
    return Math.min(dA, dB)
  } else {
    // glue, math: vertical extent from parent (0 when parentless — see kern note above)
    const parentH = node.parent ? node.parent.height : 0
    minH = node.h
    maxH = node.h
    maxV = node.v
    minV = maxV - parentH
    return distToBox(x, y, minH, maxH, minV, maxV)
  }

  return distToBox(x, y, minH, maxH, minV, maxV)
}

/** L1 distance from point to axis-aligned box (reference: _synctex_distance_to_box_v2) */
function distToBox(
  x: number,
  y: number,
  minH: number,
  maxH: number,
  minV: number,
  maxV: number,
): number {
  let dh = 0
  let dv = 0
  if (x < minH) dh = minH - x
  else if (x > maxH) dh = x - maxH
  if (y < minV) dv = minV - y
  else if (y > maxV) dv = y - maxV
  return dh + dv
}

/**
 * Normalize a SyncTeX `Input:` path: strip the WASM working-dir prefix (`/work/./`,
 * `/work/`, or a leading `./`) and collapse interior `/./` segments — WITHOUT dropping
 * parent directories. A subdirectory path like `chapters/./intro.tex` must keep
 * `chapters/` (the old `indexOf('/./')` slice discarded it, breaking forward/inverse
 * search for any file in a subdirectory).
 */
export function normalizeSynctexInputName(name: string): string {
  let n = name
  if (n.startsWith('/work/./')) n = n.slice('/work/./'.length)
  else if (n.startsWith('/work/')) n = n.slice('/work/'.length)
  else if (n.startsWith('./')) n = n.slice(2)
  return n.replace(/\/\.\//g, '/')
}

export class SynctexParser {
  /**
   * Parse raw synctex data (possibly gzip-compressed) into structured data.
   */
  async parse(data: Uint8Array): Promise<SynctexData> {
    const bytes = await maybeDecompress(data)
    const text = new TextDecoder().decode(bytes)
    return this.parseText(text)
  }

  /**
   * Parse synctex text content into a tree-structured representation.
   * Uses a stack to track open vbox/hbox containers, building parent-child
   * relationships and a friend index for O(1) forward lookup.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stack-based tree parser with preamble handling
  parseText(text: string): SynctexData {
    const pageRoots = new Map<number, SynctexNode[]>()
    const friendIndex = new Map<string, SynctexNode[]>()

    const result: SynctexData = {
      inputs: new Map(),
      pages: new Map(),
      pageRoots,
      friendIndex,
      magnification: 1000,
      unit: 1,
      xOffset: 0,
      yOffset: 0,
    }

    /** Parse an Input: line and register it in result.inputs */
    const parseInputLine = (line: string): void => {
      const firstColon = line.indexOf(':')
      const secondColon = line.indexOf(':', firstColon + 1)
      if (secondColon !== -1) {
        const tag = parseInt(line.slice(firstColon + 1, secondColon), 10)
        result.inputs.set(tag, normalizeSynctexInputName(line.slice(secondColon + 1)))
      }
    }

    // Split on CRLF or LF so a Windows-authored .synctex (trailing '\r') still matches the
    // line classifiers (`line === 'Content:'`, `startsWith('Postamble:')`) and does not leave
    // a trailing '\r' on parsed input filenames — otherwise the whole parse silently no-ops.
    const lines = text.split(/\r?\n/)
    let currentPage = 0
    let inContent = false
    const stack: SynctexNode[] = []

    for (const line of lines) {
      if (!line) continue

      // Input entries can appear both in the preamble and mid-content
      // (pdfTeX adds them when \input{file} opens a new file during compilation)
      if (line.startsWith('Input:')) {
        parseInputLine(line)
        continue
      }

      // Preamble section
      if (!inContent) {
        if (line === 'Content:') {
          inContent = true
          continue
        }
        // Validate before overwriting the sane defaults: a malformed/empty value
        // (parseInt → NaN) or a zero scale factor would silently poison EVERY node
        // coordinate via spToPdfPt (NaN → all lookups fail; 0 → all nodes collapse
        // to the origin). magnification/unit must be positive scale factors; offsets
        // only need to be finite (0 is a legitimate offset).
        if (line.startsWith('Magnification:')) {
          const m = parseInt(line.slice('Magnification:'.length), 10)
          if (Number.isFinite(m) && m > 0) result.magnification = m
        } else if (line.startsWith('Unit:')) {
          const u = parseInt(line.slice('Unit:'.length), 10)
          if (Number.isFinite(u) && u > 0) result.unit = u
        } else if (line.startsWith('X Offset:')) {
          const xo = parseInt(line.slice('X Offset:'.length), 10)
          if (Number.isFinite(xo)) result.xOffset = xo
        } else if (line.startsWith('Y Offset:')) {
          const yo = parseInt(line.slice('Y Offset:'.length), 10)
          if (Number.isFinite(yo)) result.yOffset = yo
        }
        continue
      }

      // Postamble — stop parsing
      if (line.startsWith('Postamble:')) break

      const firstChar = line[0]!

      // Page boundaries
      if (firstChar === '{') {
        currentPage = parseInt(line.slice(1), 10)
        if (!result.pages.has(currentPage)) {
          result.pages.set(currentPage, [])
          pageRoots.set(currentPage, [])
        }
        stack.length = 0
        continue
      }
      if (firstChar === '}') {
        stack.length = 0
        continue
      }

      // Close brackets — pop the tree stack
      if (firstChar === ']' || firstChar === ')') {
        if (stack.length > 0) stack.pop()
        continue
      }

      // Anchor lines
      if (firstChar === '!') continue

      // Node records
      const nodeType = NODE_PREFIXES[firstChar]
      if (!nodeType || currentPage === 0) continue

      const content = line.slice(1)
      const [tag, sourceLine, column, coordStr] = parseTagLineColumn(content)
      if (!coordStr && sourceLine === 0) continue

      const [h, v, W, H, D] = parseCoords(coordStr)
      const unit = result.unit
      const mag = result.magnification

      const node: SynctexNode = {
        type: nodeType,
        input: tag,
        line: sourceLine,
        column,
        page: currentPage,
        h: spToPdfPt(h + result.xOffset, unit, mag),
        v: spToPdfPt(v + result.yOffset, unit, mag),
        // Kern widths are signed (a negative kern moves left); the geometry
        // consumers (hOrderedDistance/pointNodeDistance) handle the sign, so we must
        // NOT abs() it away here. Box widths are ≥0, so this stays a no-op for them.
        width: spToPdfPt(W, unit, mag),
        height: spToPdfPt(Math.abs(H), unit, mag),
        depth: spToPdfPt(Math.abs(D), unit, mag),
        parent: null,
        children: [],
      }

      // Tree structure: attach to parent or mark as page root
      if (stack.length > 0) {
        const parent = stack[stack.length - 1]!
        node.parent = parent
        parent.children.push(node)
      } else {
        pageRoots.get(currentPage)!.push(node)
      }

      // Container boxes ([vbox] and (hbox)) go on the stack
      if (firstChar === '[' || firstChar === '(') {
        stack.push(node)
      }

      // Flat page list (backward compatibility)
      result.pages.get(currentPage)!.push(node)

      // Friend index for O(1) forward lookup
      if (sourceLine > 0) {
        const key = `${tag}:${sourceLine}`
        let bucket = friendIndex.get(key)
        if (!bucket) {
          bucket = []
          friendIndex.set(key, bucket)
        }
        bucket.push(node)
      }
    }

    return result
  }

  /**
   * Inverse search: PDF click → source location.
   * Port of synctex_iterator_new_edit from reference.
   *
   * Algorithm:
   * 1. Scan all hboxes on the page, find smallest containing one
   * 2. Drill into deepest container (DFS)
   * 3. Find L/R closest children using horizontal ordered distance
   * 4. Pick the best based on line number and distance
   * 5. Fallback: closest deep child using L1 distance
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference algorithm
  inverseLookup(data: SynctexData, page: number, x: number, y: number): SourceLocation | null {
    const nodes = data.pages.get(page)
    if (!nodes || nodes.length === 0) return null

    // Step 1: Find smallest containing hbox (scan ALL hboxes on page via flat list)
    // Reference: browse next_hbox linked list
    let container: SynctexNode | null = null
    for (const node of nodes) {
      if (node.type !== 'hbox') continue
      if (this.pointInBox(x, y, node)) {
        container = container ? this.smallestContainer(node, container) : node
      }
    }

    // Step 1b: No containing hbox — find nearest hbox by L1 distance.
    // This handles equation environments where vbox wrappers create vertical
    // padding between hbox lines, causing clicks to miss all hboxes.
    if (!container) {
      let bestDist = Infinity
      for (const node of nodes) {
        if (node.type !== 'hbox') continue
        const d = pointNodeDistance(x, y, node)
        if (d < bestDist) {
          bestDist = d
          container = node
        }
      }
    }

    if (container) {
      // Step 2: Drill into deepest container (reference: _synctex_eq_deepest_container_v2)
      container = this.deepestContainer(x, y, container)

      // Step 3: Find L/R closest children (reference: _synctex_eq_get_closest_children_in_box_v2)
      const { l, r } = this.getClosestChildrenInBox(x, y, container)

      // Step 4: Pick best result (reference lines 7338-7377). Guard line:0 like Steps 5/6 —
      // L/R children are often glue/kern leaves tagged line 0 (not a real source location).
      const target = this.pickBestLR(l, r, x, y)
      if (target && target.line > 0) {
        const filename = data.inputs.get(target.input) ?? ''
        return { file: filename, line: target.line }
      }

      // Container itself as fallback (only if it maps to a real source line). If neither the
      // L/R pick nor the container has line>0, fall through to Steps 5/6, which skip line 0.
      if (container.line > 0) {
        const filename = data.inputs.get(container.input) ?? ''
        return { file: filename, line: container.line }
      }
    }

    // Step 5: "Not lucky" — closest deep child across ALL page roots. A page commonly has
    // several top-level boxes (columns/floats/separate vboxes); searching only the first
    // would return a node from the wrong subtree.
    const roots = data.pageRoots?.get(page)
    if (roots && roots.length > 0) {
      let best: SynctexNode | null = null
      let bestDist = Infinity
      for (const root of roots) {
        const cand = this.closestDeepChild(x, y, root)
        if (!cand) continue
        // A line-0 candidate is not a real source location (Step 6 and the friend
        // index both exclude it); skip so we fall through to Step 6 instead.
        if (cand.line === 0) continue
        const d = pointNodeDistance(x, y, cand)
        if (d < bestDist) {
          bestDist = d
          best = cand
        }
      }
      if (best) {
        const filename = data.inputs.get(best.input) ?? ''
        return { file: filename, line: best.line }
      }
    }

    // Step 6: Last resort — nearest node by L1 distance
    let bestNode: SynctexNode | null = null
    let bestDist = Infinity
    for (const node of nodes) {
      if (node.line === 0) continue
      const dist = pointNodeDistance(x, y, node)
      if (dist < bestDist) {
        bestDist = dist
        bestNode = node
      }
    }
    if (!bestNode) return null
    const filename = data.inputs.get(bestNode.input) ?? ''
    return { file: filename, line: bestNode.line }
  }

  /**
   * Forward search: source line → PDF region.
   * Port of synctex_iterator_new_display from reference.
   *
   * Algorithm:
   * 1. Find input tag for the file
   * 2. Try exact line match via friend index
   * 3. If no match, zigzag to nearby lines: line±1, ±2, ... up to 100 tries
   * 4. For each line: non-box nodes first (reference: exclude_box=YES),
   *    then include boxes as fallback
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: nearest-line zigzag with two-pass search
  forwardLookup(data: SynctexData, file: string, line: number): PdfLocation | null {
    // Find input tag for this file. Prefer an EXACT name match over a basename/suffix
    // match: with two files sharing a basename (chapters/intro.tex, intro.tex), a bare
    // `intro.tex` query must bind to the exact input, not whichever suffix-matches first.
    let inputTag = -1
    for (const [tag, name] of data.inputs) {
      if (name === file) {
        inputTag = tag
        break
      }
    }
    if (inputTag === -1) {
      for (const [tag, name] of data.inputs) {
        if (name.endsWith(`/${file}`)) {
          inputTag = tag
          break
        }
      }
    }
    if (inputTag === -1) return null

    // Nearest-line zigzag (reference: synctex_iterator_new_display lines 7510-7572)
    // Tries: line, line+1, line-1, line+2, line-2, ...
    // Cap at ±3 lines — only compensate for macro-expansion line offsets,
    // not preamble-to-body jumps.
    const MAX_ZIGZAG_DISTANCE = 3
    let currentLine = line
    let lineOffset = 1
    for (let tries = 0; tries < 100; tries++) {
      if (Math.abs(currentLine - line) > MAX_ZIGZAG_DISTANCE) break
      if (currentLine > 0) {
        const result = this.forwardForLine(data, inputTag, currentLine)
        if (result) return result
      }
      currentLine += lineOffset
      lineOffset = lineOffset < 0 ? -(lineOffset - 1) : -(lineOffset + 1)
      // Skip non-positive lines (reference: line 7566-7569)
      if (currentLine <= 0) {
        currentLine += lineOffset
        lineOffset = lineOffset < 0 ? -(lineOffset - 1) : -(lineOffset + 1)
      }
    }
    return null
  }

  /** Forward search for a specific line. Two-pass: non-box first, then all. */
  private forwardForLine(data: SynctexData, inputTag: number, line: number): PdfLocation | null {
    const friends = data.friendIndex?.get(`${inputTag}:${line}`)
    if (!friends || friends.length === 0) return null

    // Skip zero-width anchor nodes (label markers, counter marks, etc.)
    // pdfTeX emits these at \begin{document} time for internal LaTeX bookkeeping;
    // they appear on distant pages and would cause incorrect forward-search jumps.
    const visible = friends.filter((n) => n.width > 0 || !isBox(n))
    if (visible.length === 0) return null

    // Choose the target page ONCE from the full visible set (the earliest page with any
    // representation of the line). The non-box-first preference then governs only precision
    // within that page — not which page wins. Otherwise a later-page non-box leaf could beat
    // the line's own hbox on an earlier page.
    // Reduce, NOT Math.min(...spread): the friend bucket is unbounded, and spreading a
    // huge array as function arguments overflows V8's arg-count limit (~125k) and throws.
    const targetPage = visible.reduce((m, n) => (n.page < m ? n.page : m), Infinity)
    const onPage = visible.filter((n) => n.page === targetPage)

    // First pass: non-box nodes only (reference: exclude_box=YES)
    const nonBox = onPage.filter((n) => !isBox(n))
    if (nonBox.length > 0) {
      const result = this.forwardFromNodes(nonBox)
      if (result) return result
    }

    // Second pass: include all nodes (reference: exclude_box=NO)
    return this.forwardFromNodes(onPage)
  }

  /** Compute forward search result from matched nodes */
  private forwardFromNodes(nodes: SynctexNode[]): PdfLocation | null {
    // Filter to first page
    const firstPage = nodes[0]!.page
    const pageNodes = nodes.filter((n) => n.page === firstPage)
    if (pageNodes.length === 0) return null

    // For leaf nodes, resolve to ancestor hbox for proper bounds
    const resolvedBoxes = new Set<SynctexNode>()
    const directBoxes: SynctexNode[] = []

    for (const node of pageNodes) {
      if (node.type === 'hbox' || node.type === 'void_hbox') {
        directBoxes.push(node)
      } else if (node.type === 'vbox' || node.type === 'void_vbox') {
        // skip vbox — too broad
      } else {
        // Leaf node: walk to ancestor hbox
        const hbox = this.findAncestorHbox(node)
        if (hbox) resolvedBoxes.add(hbox)
      }
    }

    // Prefer resolved boxes from leaves (more precise — matches actual content)
    if (resolvedBoxes.size > 0) {
      return this.bboxFromNodes([...resolvedBoxes], firstPage)
    }
    if (directBoxes.length > 0) {
      return this.bboxFromNodes(directBoxes, firstPage)
    }

    // Fallback: use whatever we have
    return this.bboxFromNodes(pageNodes, firstPage)
  }

  /** Point-in-box test (reference: _synctex_point_in_box_v2) */
  private pointInBox(x: number, y: number, node: SynctexNode): boolean {
    return hOrderedDistance(x, node) === 0 && this.vOrderedDistance(y, node) === 0
  }

  /** Vertical ordered distance (reference: _synctex_point_v_ordered_distance_v2) */
  private vOrderedDistance(y: number, node: SynctexNode): number {
    let min: number
    let max: number
    if (node.type === 'hbox') {
      min = node.v - node.height
      max = node.v + node.depth
    } else if (node.type === 'vbox' || node.type === 'void_vbox' || node.type === 'void_hbox') {
      min = node.v - node.height
      max = node.v + node.depth
    } else {
      // Leaf nodes: use parent's vertical extent
      const p = node.parent
      if (p) {
        min = node.v - p.height
        max = node.v + p.depth
      } else {
        return node.v - y
      }
    }
    if (y < min) return min - y
    if (y > max) return max - y
    return 0
  }

  /** Smallest container by area (reference: _synctex_smallest_container_v2) */
  private smallestContainer(a: SynctexNode, b: SynctexNode): SynctexNode {
    const areaA = a.width * (a.height + a.depth)
    const areaB = b.width * (b.height + b.depth)
    if (areaA < areaB) return a
    if (areaA > areaB) return b
    // Tie-break: prefer smaller height
    if (a.height + a.depth < b.height + b.depth) return a
    return b
  }

  /**
   * Deepest container: DFS to find the deepest box containing the hit point.
   * Reference: _synctex_eq_deepest_container_v2
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference C algorithm
  private deepestContainer(x: number, y: number, node: SynctexNode): SynctexNode {
    if (node.children.length === 0) return node

    // Go deep first — check children for containment
    for (const child of node.children) {
      if (this.pointInBox(x, y, child)) {
        return this.deepestContainer(x, y, child)
      }
    }

    // For vboxes: find closest child with children (reference lines 8063-8082)
    if (node.type === 'vbox') {
      let bestChild: SynctexNode | null = null
      let bestDist = Infinity
      for (const child of node.children) {
        if (child.children.length > 0) {
          const d = pointNodeDistance(x, y, child)
          if (d < bestDist) {
            bestDist = d
            bestChild = child
          }
        }
      }
      // Recurse into the chosen closest child (reference _synctex_eq_deepest_container_v2);
      // returning it directly stops one level too shallow. Terminates because each
      // step strictly descends to a proper descendant.
      if (bestChild) return this.deepestContainer(x, y, bestChild)
    }

    return node
  }

  /**
   * Find L/R closest children within a box using horizontal ordered distance.
   * Reference: __synctex_eq_get_closest_children_in_hbox_v2
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: L/R bracketing from reference
  private getClosestChildrenInBox(
    x: number,
    y: number,
    box: SynctexNode,
  ): { l: SynctexNode | null; r: SynctexNode | null } {
    let lNode: SynctexNode | null = null
    let lDist = Infinity
    let rNode: SynctexNode | null = null
    let rDist = Infinity

    for (const child of box.children) {
      const d = hOrderedDistance(x, child)

      if (d > 0) {
        // Child is to the RIGHT of hit point
        if (d < rDist || (d === rDist && rNode && child.line < rNode.line)) {
          rNode = child
          rDist = d
        }
      } else if (d === 0) {
        // Hit point is inside child — recurse if it's a container
        if (child.children.length > 0) {
          return this.getClosestChildrenInBox(x, y, child)
        }
        lNode = child
        lDist = 0
      } else {
        // Child is to the LEFT (d < 0)
        const absDist = -d
        if (absDist < lDist || (absDist === lDist && lNode && child.line < lNode.line)) {
          lNode = child
          lDist = absDist
        }
      }
    }

    // Try to narrow results by drilling deeper (reference lines 8180-8197)
    if (lNode && lNode.children.length > 0) {
      const deeper = this.closestDeepChild(x, y, lNode)
      if (deeper) lNode = deeper
    }
    if (rNode && rNode.children.length > 0) {
      const deeper = this.closestDeepChild(x, y, rNode)
      if (deeper) rNode = deeper
    }

    return { l: lNode, r: rNode }
  }

  /**
   * Pick the best of L/R results.
   * Reference: synctex_iterator_new_edit lines 7338-7377
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference C algorithm
  private pickBestLR(
    l: SynctexNode | null,
    r: SynctexNode | null,
    x: number,
    y: number,
  ): SynctexNode | null {
    if (l && r) {
      // A line<=0 leaf (glue/kern) is "no source location" — the caller discards a line-0
      // pick (Step 4 guard) — so when exactly one side carries a real line, prefer that side
      // rather than letting the "smaller line number" rule pick the 0 and throw the real-line
      // leaf away (resolving the click to the container instead of the bracketing leaf).
      if (l.line <= 0 && r.line > 0) return r
      if (r.line <= 0 && l.line > 0) return l
      // Different source locations: prefer smaller line number
      if (l.input !== r.input || l.line !== r.line) {
        if (r.line < l.line) return r
        if (l.line < r.line) return l
        // Same line, different files — prefer closer
        const dL = pointNodeDistance(x, y, l)
        const dR = pointNodeDistance(x, y, r)
        return dL <= dR ? l : r
      }
      // Same source location: prefer closer
      const dL = pointNodeDistance(x, y, l)
      const dR = pointNodeDistance(x, y, r)
      return dL <= dR ? l : r
    }
    return l ?? r
  }

  /**
   * Recursive closest deep child by L1 distance.
   * Reference: __synctex_closest_deep_child_v2
   */
  private closestDeepChild(x: number, y: number, node: SynctexNode): SynctexNode | null {
    if (node.children.length === 0) return null

    let best: SynctexNode | null = null
    let bestDist = Infinity

    for (const child of node.children) {
      let nd: SynctexNode
      let dist: number

      if (child.children.length > 0) {
        // Recurse into container
        const deep = this.closestDeepChild(x, y, child)
        if (deep) {
          nd = deep
          dist = pointNodeDistance(x, y, deep)
        } else {
          nd = child
          dist = pointNodeDistance(x, y, child)
        }
      } else {
        nd = child
        dist = pointNodeDistance(x, y, child)
      }

      // Reference: prefer a non-kern child over a kern when equidistant — but only
      // *upgrade* from a kern. Replacing an already-non-kern best with a later equidistant
      // non-kern would make the result depend on child emission order.
      if (dist < bestDist || (dist === bestDist && nd.type !== 'kern' && best?.type === 'kern')) {
        best = nd
        bestDist = dist
      }
    }

    return best
  }

  /** Walk up from a leaf to find the nearest ancestor hbox */
  private findAncestorHbox(node: SynctexNode): SynctexNode | null {
    let current = node.parent
    while (current) {
      if (current.type === 'hbox') return current
      current = current.parent
    }
    return null
  }

  /** Compute a bounding box enclosing the given nodes */
  private bboxFromNodes(nodes: SynctexNode[], page: number): PdfLocation {
    let minH = Infinity
    let maxH = -Infinity
    let minTop = Infinity
    let maxBottom = -Infinity

    for (const node of nodes) {
      const top = node.v - node.height
      const bottom = node.v + node.depth
      if (node.h < minH) minH = node.h
      if (node.h + node.width > maxH) maxH = node.h + node.width
      if (top < minTop) minTop = top
      if (bottom > maxBottom) maxBottom = bottom
    }

    // Zero-dimension leaf nodes: estimate height from baseline
    if (maxBottom - minTop < 2) {
      minTop = nodes[0]!.v - 12
      maxBottom = nodes[0]!.v + 3
    }

    return {
      page,
      x: minH,
      y: minTop,
      width: Math.max(maxH - minH, 10),
      height: Math.max(maxBottom - minTop, 10),
    }
  }
}
