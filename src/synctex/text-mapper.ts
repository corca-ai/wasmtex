import type * as pdfjsLib from 'pdfjs-dist'

export interface SourceLocation {
  file: string
  line: number
}

export interface PdfLocation {
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface TextBlock {
  text: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * Maps PDF text positions back to source lines using text content matching.
 * Approximate — works for plain text, not for math/tables/figures.
 */
export class TextMapper {
  private pageBlocks: Map<number, TextBlock[]> = new Map()
  private sourceLines: Map<string, string[]> = new Map()

  /** Register source file content for matching */
  setSource(file: string, content: string): void {
    this.sourceLines.set(file, content.split('\n'))
  }

  /**
   * Replace the entire set of registered source files. Use this when the project
   * file set may have changed (rename/delete) so stale files are dropped and can
   * no longer be matched by inverse search.
   */
  setSources(sources: Iterable<readonly [string, string]>): void {
    this.sourceLines.clear()
    for (const [file, content] of sources) {
      this.sourceLines.set(file, content.split('\n'))
    }
  }

  /** Extract text blocks from a PDF page */
  async indexPage(page: pdfjsLib.PDFPageProxy, pageNum: number): Promise<void> {
    const textContent = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })
    const blocks: TextBlock[] = []

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str.trim()) continue

      // transform: [scaleX, skewX, skewY, scaleY, translateX, translateY]
      const tx = item.transform
      if (!tx) continue

      // `||` not `??`: pdf.js can report `height: 0` for some glyph runs, and 0 is not a
      // usable height — fall back to the font scale |tx[3]| so the block isn't a zero-height
      // box sitting on the baseline.
      const height = item.height || Math.abs(tx[3]!)
      // Convert from PDF user space (origin bottom-left) to viewport coords (origin top-left)
      const [vx, vy] = viewport.convertToViewportPoint(tx[4]!, tx[5]!)

      blocks.push({
        text: item.str,
        x: vx,
        // vy is the baseline position; shift up by height so highlight covers the text
        y: vy - height,
        width: item.width ?? 0,
        height,
      })
    }

    this.pageBlocks.set(pageNum, blocks)
  }

  /** Find the source line for a click at (x, y) on the given page */
  lookup(pageNum: number, x: number, y: number): SourceLocation | null {
    const blocks = this.pageBlocks.get(pageNum)
    if (!blocks || blocks.length === 0) return null

    // Find closest text block to click position
    const block = this.findClosestBlock(blocks, x, y)
    if (!block) return null

    // Match block text against source lines
    return this.matchTextToSource(block.text)
  }

  /** Forward search: find PDF position for a source line */
  forwardLookup(file: string, line: number): PdfLocation | null {
    const lines = this.sourceLines.get(file)
    if (!lines) return null

    const sourceLine = lines[line - 1]
    if (!sourceLine) return null

    // Strip TeX commands, get clean text
    const cleanText = this.stripTexCommands(sourceLine)
    if (cleanText.length < 3) return null

    // Find the best matching block across all pages (longest overlap wins)
    let best: { page: number; block: TextBlock; score: number } | null = null

    for (const [page, blocks] of this.pageBlocks) {
      for (const block of blocks) {
        const score = this.matchScore(cleanText, block.text)
        if (score > 0 && (!best || score > best.score)) {
          best = { page, block, score }
        }
      }
    }

    if (!best) return null
    const b = best.block
    return { page: best.page, x: b.x, y: b.y, width: b.width, height: b.height }
  }

  /** Clear all indexed data */
  clear(): void {
    this.pageBlocks.clear()
  }

  private findClosestBlock(blocks: TextBlock[], x: number, y: number): TextBlock | null {
    let best: TextBlock | null = null
    let bestDist = Infinity

    for (const block of blocks) {
      // Distance from click to block center (y is top of block)
      const cx = block.x + block.width / 2
      const cy = block.y + block.height / 2
      const dist = Math.hypot(x - cx, y - cy)

      if (dist < bestDist) {
        bestDist = dist
        best = block
      }
    }

    return best
  }

  private matchTextToSource(text: string): SourceLocation | null {
    const needle = text.trim()
    if (!needle) return null

    // Exact match
    const exact = this.findInSources(needle)
    if (exact) return exact

    // Partial match (first 10+ chars)
    if (needle.length >= 10) {
      return this.findInSources(needle.slice(0, 10))
    }

    return null
  }

  private stripTexCommands(line: string): string {
    return line
      .replace(/\\[a-zA-Z]+(\{[^}]*\}|\[[^\]]*\])*/g, ' ')
      .replace(/[{}\\$%&]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** Score how well cleanText matches a PDF block's text. Higher = better match. 0 = no match. */
  private matchScore(cleanText: string, blockText: string): number {
    // Full containment: one contains the other entirely
    if (blockText.includes(cleanText)) return cleanText.length * 2
    if (cleanText.includes(blockText)) return blockText.length * 2

    // Prefix/suffix overlap (at least 8 chars)
    const minOverlap = Math.min(8, Math.min(cleanText.length, blockText.length))
    for (let len = Math.min(cleanText.length, blockText.length); len >= minOverlap; len--) {
      // cleanText end matches blockText start
      if (cleanText.slice(-len) === blockText.slice(0, len)) return len
      // cleanText start matches blockText end
      if (cleanText.slice(0, len) === blockText.slice(-len)) return len
    }

    return 0
  }

  private findInSources(needle: string): SourceLocation | null {
    for (const [file, lines] of this.sourceLines) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.includes(needle)) {
          return { file, line: i + 1 }
        }
      }
    }
    return null
  }
}
