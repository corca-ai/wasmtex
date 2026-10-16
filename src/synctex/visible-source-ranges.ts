import type { LatexSyntaxRange } from '../syntax-contract'

/** Small interval index shared by the source projection's masks and prose. */
export class VisibleSourceRanges {
  readonly ranges: readonly LatexSyntaxRange[]

  constructor(ranges: readonly LatexSyntaxRange[]) {
    const merged: LatexSyntaxRange[] = []
    for (const range of [...ranges].sort((a, b) => a.startOffset - b.startOffset)) {
      if (range.endOffset <= range.startOffset) continue
      const previous = merged.at(-1)
      if (previous && range.startOffset <= previous.endOffset) {
        previous.endOffset = Math.max(previous.endOffset, range.endOffset)
      } else merged.push({ ...range })
    }
    this.ranges = merged
  }

  private first(offset: number) {
    let low = 0
    let high = this.ranges.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (this.ranges[middle]!.endOffset <= offset) low = middle + 1
      else high = middle
    }
    return low
  }

  intersects(start: number, end: number) {
    const range = this.ranges[this.first(start)]
    return range !== undefined && range.startOffset < end
  }

  clips(start: number, end: number) {
    const found: LatexSyntaxRange[] = []
    for (let index = this.first(start); index < this.ranges.length; index++) {
      const range = this.ranges[index]!
      if (range.startOffset >= end) break
      found.push({
        startOffset: Math.max(start, range.startOffset),
        endOffset: Math.min(end, range.endOffset),
      })
    }
    return found
  }
}
